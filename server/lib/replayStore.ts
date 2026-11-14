// Where replays live on disk: one folder per id under <dataDir>/replays, holding meta.json, card.png and the video.
import { randomInt } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { log } from "../../src/core/log";
import { ReplayMetaSchema } from "../../src/replay/contracts";
import type { ReplayMeta } from "../../src/replay/contracts";

export const MAX_REPLAYS = 200;
export const CARD_FILE = "card.png";
export const VIDEO_KINDS = ["webm", "mp4"] as const;
export type VideoKind = (typeof VIDEO_KINDS)[number];

/** No i, l, o, 0 or 1: an id read off a screen cannot be mistyped. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const ID_LENGTH = 10;
const ID_PATTERN = /^[a-hjkmnp-z2-9]{10}$/;
const META_FILE = "meta.json";
const CLAIM_GRACE_MS = 60_000;

const RecordSchema = z.object({ meta: ReplayMetaSchema, page_url: z.string(), created_ms: z.number() });
type StoredRecord = z.infer<typeof RecordSchema>;

export interface StoredReplay {
  readonly id: string;
  readonly dir: string;
  readonly meta: ReplayMeta;
  /** The absolute address handed out when the replay was made, which is what its QR code holds. */
  readonly pageUrl: string;
  readonly hasCard: boolean;
  readonly video: VideoKind | null;
}

/** The only gate between a request and the filesystem: nothing but a well-formed id ever becomes part of a path. */
export function isReplayId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

export function videoFile(kind: VideoKind): string {
  return `video.${kind}`;
}

function root(dataDir: string): string {
  return join(dataDir, "replays");
}

function newId(): string {
  return Array.from({ length: ID_LENGTH }, () => ALPHABET.charAt(randomInt(ALPHABET.length))).join("");
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function readRecord(dir: string): Promise<StoredRecord | null> {
  try {
    const parsed = RecordSchema.safeParse(JSON.parse(await readFile(join(dir, META_FILE), "utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Makes the folder for a fresh id. mkdir fails if the name is taken, so two replays can never share one. */
async function claimFolder(dataDir: string): Promise<string> {
  await mkdir(root(dataDir), { recursive: true });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const id = newId();
    try {
      await mkdir(join(root(dataDir), id));
      return id;
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
    }
  }
  throw new Error("no free replay id");
}

/**
 * When a replay was made, or null for a folder the cap must leave alone. A folder with no readable meta
 * that was touched in the last minute may still be being written; an older one was abandoned, and is aged by that touch.
 */
async function createdAt(dir: string): Promise<number | null> {
  const record = await readRecord(dir);
  if (record !== null) return record.created_ms;
  try {
    const touched = (await stat(dir)).mtimeMs;
    return Date.now() - touched < CLAIM_GRACE_MS ? null : touched;
  } catch {
    return 0;
  }
}

/** Deletes the oldest replays beyond the cap. */
async function prune(dataDir: string, keep: string): Promise<void> {
  try {
    const ids = (await readdir(root(dataDir))).filter(isReplayId);
    if (ids.length <= MAX_REPLAYS) return;
    const aged = await Promise.all(ids.filter((id) => id !== keep).map(async (id) => ({
      id,
      created: await createdAt(join(root(dataDir), id)),
    })));
    const oldestFirst = aged
      .flatMap(({ id, created }) => (created === null ? [] : [{ id, created }]))
      .sort((a, b) => a.created - b.created);
    for (const { id } of oldestFirst.slice(0, ids.length - MAX_REPLAYS)) {
      await rm(join(root(dataDir), id), { recursive: true, force: true, maxRetries: 2 });
    }
  } catch (error) {
    log("warn", "replay_prune_failed", error);
  }
}

// Replays made in the same millisecond still need an order for the cap, so this clock never repeats.
let lastCreated = 0;

// Creates take turns, so the cap never counts or deletes a replay that another create is still writing.
let turn: Promise<unknown> = Promise.resolve();

function inTurn<T>(task: () => Promise<T>): Promise<T> {
  const done = turn.then(task);
  turn = done.catch(() => undefined);
  return done;
}

export function createReplay(
  dataDir: string,
  meta: ReplayMeta,
  card: Buffer | null,
  pageUrl: (id: string) => string,
): Promise<StoredReplay> {
  return inTurn(() => writeReplay(dataDir, meta, card, pageUrl));
}

async function writeReplay(
  dataDir: string,
  meta: ReplayMeta,
  card: Buffer | null,
  pageUrl: (id: string) => string,
): Promise<StoredReplay> {
  const id = await claimFolder(dataDir);
  const dir = join(root(dataDir), id);
  lastCreated = Math.max(Date.now(), lastCreated + 1);
  const record: StoredRecord = { meta, page_url: pageUrl(id), created_ms: lastCreated };
  try {
    if (card !== null) await writeFile(join(dir, CARD_FILE), card);
    // Written last: a replay exists once its meta does.
    await writeFile(join(dir, META_FILE), JSON.stringify(record));
  } catch (error) {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
  await prune(dataDir, id);
  return { id, dir, meta, pageUrl: record.page_url, hasCard: card !== null, video: null };
}

export async function findReplay(dataDir: string, id: unknown): Promise<StoredReplay | null> {
  if (!isReplayId(id)) return null;
  const dir = join(root(dataDir), id);
  const record = await readRecord(dir);
  if (record === null) return null;
  const [hasCard, ...videos] = await Promise.all([
    isFile(join(dir, CARD_FILE)),
    ...VIDEO_KINDS.map((kind) => isFile(join(dir, videoFile(kind)))),
  ]);
  const video = VIDEO_KINDS.find((_, index) => videos[index] === true) ?? null;
  return { id, dir, meta: record.meta, pageUrl: record.page_url, hasCard, video };
}

/** Replaces whatever video the replay had. The file is renamed into place so a half-written one is never served. */
export async function saveVideo(replay: StoredReplay, kind: VideoKind, bytes: Buffer): Promise<void> {
  const target = join(replay.dir, videoFile(kind));
  const partial = `${target}.part`;
  await writeFile(partial, bytes);
  await rename(partial, target);
  for (const other of VIDEO_KINDS) {
    if (other !== kind) await rm(join(replay.dir, videoFile(other)), { force: true });
  }
}
