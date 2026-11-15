// Finds the room a FaceTime call to the game's Chert line is in, or will come into, so the game can answer it.
//
// How Chert's `chert dev` works (read from its own code and seen running): it keeps one "waiting" room ready in our
// LiveKit project, named chert-warm-<id>, with our silent agent in it, and makes a new one every five minutes and
// after every call (the old one is deleted). A call that finds no waiting room gets a room named chert-<operation id>.
// The FaceTime call joins as the participant chert-bridge-<call id>.
//
// Two ways to learn the room, in this order:
//  1. Ask LiveKit (ListRooms, then ListParticipants): the room that has our agent in it, the one with a caller
//     first, else the newest waiting room. This is the truth, whatever any file says.
//  2. If LiveKit cannot be asked, the note our agent writes (scripts/chert-bridge.mjs): used only when it names a
//     room, the name is one of Chert's, and it was written a short while ago.
// Both are read-only: nothing here makes, changes or deletes a room. The tokens for the two questions are signed
// here, live a minute, and go only to LiveKit.
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { bridgeReady } from "../../src/facetime/bridge";
import type { LivekitConfig } from "./facetimeEnv";
import { ROOM_SERVICE_TTL_S, roomServiceUrl } from "./facetimeRooms";

/** The room `chert dev` keeps ready before a call. Only such a room is waited in. */
export const WAITING_ROOM = /^chert-warm-[A-Za-z0-9_-]{1,64}$/;
/**
 * Any room `chert dev` makes. A call that found no waiting room is put in chert-<operation id>, so a room of
 * another name is joined only when a caller is in it. (`chert doctor` makes chert-doctor-<id> rooms with the agent
 * in them and no caller: those are never joined.)
 */
export const CHERT_ROOM = /^chert-[A-Za-z0-9_-]{1,94}$/;
/** The FaceTime call's own participant in the room. */
export const CALLER_PREFIX = "chert-bridge-";
/** `chert dev` replaces a waiting room after five minutes and LiveKit closes it at seven, and a trial call lasts five: an older note is about a room that is gone. */
export const NOTE_MAX_AGE_MS = 8 * 60_000;
/** A clock that runs a little behind the agent's is not a stale note. */
const NOTE_AHEAD_MS = 60_000;
export const LOOKUP_TIMEOUT_MS = 4000;
/** No more rooms than this are looked into for one question: the newest ones. */
const MAX_LOOKED_AT = 6;

export interface WaitingRoom {
  readonly room: string;
  /** The FaceTime call's participant when a call is in the room, else null. */
  readonly caller: string | null;
  /** True once the room's metadata says FaceTime is up (chert_bridge_ready). */
  readonly ready: boolean;
  /** Who said so: LiveKit itself, or the agent's note. */
  readonly source: "livekit" | "file";
}

/** `room: null` means LiveKit was asked and there is no such room. Not ok means it could not be asked. */
export type Lookup =
  | { readonly ok: true; readonly room: WaitingRoom | null }
  | { readonly ok: false; readonly why: "network" | "service"; readonly status: number };

export type RoomNote =
  | { readonly kind: "room"; readonly room: WaitingRoom }
  | { readonly kind: "none"; readonly why: "missing" | "unreadable" | "no_room" | "bad_name" | "stale" };

/** Where the agent writes its note: FACETIME_ROOM_FILE, else ~/.chert/odyssey-dojo-room.json. */
export function roomFilePath(env: Readonly<Record<string, string | undefined>>, home: string = homedir()): string {
  const set = env.FACETIME_ROOM_FILE?.trim() ?? "";
  return set === "" ? join(home, ".chert", "odyssey-dojo-room.json") : set;
}

/** Reads the agent's note. The room's name is checked before anything is signed for it. */
export function readRoomNote(text: string, nowMs: number): RoomNote {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { kind: "none", why: "unreadable" };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return { kind: "none", why: "unreadable" };
  const { room, caller, ready, at } = parsed as Record<string, unknown>;
  if (room === null || room === undefined || room === "") return { kind: "none", why: "no_room" };
  if (typeof room !== "string" || !CHERT_ROOM.test(room)) return { kind: "none", why: "bad_name" };
  const written = typeof at === "string" ? Date.parse(at) : Number.NaN;
  if (!Number.isFinite(written) || nowMs - written > NOTE_MAX_AGE_MS || written - nowMs > NOTE_AHEAD_MS) return { kind: "none", why: "stale" };
  const who = typeof caller === "string" && caller.startsWith(CALLER_PREFIX) && caller.length <= 200 ? caller : null;
  if (who === null && !WAITING_ROOM.test(room)) return { kind: "none", why: "bad_name" };
  return { kind: "room", room: { room, caller: who, ready: ready === true, source: "file" } };
}

export async function readRoomFile(path: string, nowMs: number, read: (path: string) => Promise<string> = (file) => readFile(file, "utf8")): Promise<RoomNote> {
  let text: string;
  try {
    text = await read(path);
  } catch {
    return { kind: "none", why: "missing" };
  }
  return readRoomNote(text, nowMs);
}

const encode = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString("base64url");

/**
 * A token for one read-only question to LiveKit's room service. `roomList` lets it list rooms; `roomAdmin` with a
 * room lets it list who is in that room. It names no participant, cannot join anything, and lives a minute.
 */
export function mintLookupToken(config: LivekitConfig, nowSeconds: number, room?: string): string {
  const video = room === undefined ? { roomList: true } : { roomAdmin: true, room };
  const body = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ iss: config.livekitKey, nbf: nowSeconds - 10, exp: nowSeconds + ROOM_SERVICE_TTL_S, video })}`;
  return `${body}.${createHmac("sha256", config.livekitSecret).update(body).digest("base64url")}`;
}

export const LIST_ROOMS_PATH = "/twirp/livekit.RoomService/ListRooms";
export const LIST_PARTICIPANTS_PATH = "/twirp/livekit.RoomService/ListParticipants";

export interface LookupDeps {
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>;
  /** Milliseconds since 1970. */
  readonly now: () => number;
}

type NotAsked = Extract<Lookup, { ok: false }>;
type Asked = { readonly ok: true; readonly body: Record<string, unknown> } | NotAsked;

async function ask(deps: LookupDeps, config: LivekitConfig, path: string, body: Record<string, string>, room?: string): Promise<Asked> {
  const base = roomServiceUrl(config.livekitUrl);
  if (base === null) return { ok: false, why: "service", status: 0 };
  const token = mintLookupToken(config, Math.floor(deps.now() / 1000), room);
  try {
    const response = await deps.fetch(`${base}${path}`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      return { ok: false, why: "service", status: response.status };
    }
    const parsed: unknown = await response.json();
    if (typeof parsed !== "object" || parsed === null) return { ok: false, why: "service", status: response.status };
    return { ok: true, body: parsed as Record<string, unknown> };
  } catch {
    // The error is not passed on: it can carry the request, and the request carries the token.
    return { ok: false, why: "network", status: 0 };
  }
}

const records = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter((each): each is Record<string, unknown> => typeof each === "object" && each !== null) : [];

/** LiveKit's JSON gives a participant's kind as a word ("AGENT") or as its number (4). */
const isAgent = (kind: unknown): boolean => kind === "AGENT" || kind === 4;

/**
 * Asks LiveKit which of Chert's rooms the game should be in: one that has our agent in it, a room with a caller
 * before a waiting room, and the newest of several.
 */
export async function findChertRoom(deps: LookupDeps, config: LivekitConfig): Promise<Lookup> {
  const listed = await ask(deps, config, LIST_ROOMS_PATH, {});
  if (!listed.ok) return listed;
  const rooms = records(listed.body.rooms)
    .map((each) => ({
      name: typeof each.name === "string" ? each.name : "",
      // Milliseconds when LiveKit gives them, else its whole seconds.
      created: (Number(each.creation_time_ms ?? each.creationTimeMs ?? 0) || 0) || (Number(each.creation_time ?? each.creationTime ?? 0) || 0) * 1000,
      metadata: typeof each.metadata === "string" ? each.metadata : "",
    }))
    .filter((each) => CHERT_ROOM.test(each.name))
    .sort((a, b) => b.created - a.created)
    .slice(0, MAX_LOOKED_AT);
  const looked = await Promise.all(rooms.map(async (each) => ({ each, who: await ask(deps, config, LIST_PARTICIPANTS_PATH, { room: each.name }, each.name) })));
  let waiting: WaitingRoom | null = null;
  let failed: NotAsked | null = null;
  for (const { each, who } of looked) {
    if (!who.ok) {
      // A room that closed between the two questions answers 404: it is simply not there.
      if (who.status !== 404) failed ??= who;
      continue;
    }
    const people = records(who.body.participants);
    if (!people.some((person) => isAgent(person.kind))) continue;
    const caller = people.map((person) => person.identity).find((identity): identity is string => typeof identity === "string" && identity.startsWith(CALLER_PREFIX)) ?? null;
    const found: WaitingRoom = { room: each.name, caller, ready: bridgeReady(each.metadata), source: "livekit" };
    // Newest first: the first room with a caller wins, else the first that is waiting.
    if (caller !== null) return { ok: true, room: found };
    if (WAITING_ROOM.test(each.name)) waiting ??= found;
  }
  // A waiting room that was found stands. With none found, a room that could not be looked into may have been it.
  if (waiting === null && failed !== null) return failed;
  return { ok: true, room: waiting };
}
