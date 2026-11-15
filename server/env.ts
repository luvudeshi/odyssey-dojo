// Server settings, read once from the environment (and from .env at the repo root when it exists).
import { resolve } from "node:path";
import { log } from "../src/core/log";
import { tunnelAddress } from "./lib/address";
import { loadEnvFile } from "./lib/envFile";

const DEFAULT_PORT = 8787;

export interface Config {
  readonly port: number;
  readonly geminiKey: string | null;
  readonly elevenLabsKey: string | null;
  /** Where caches and replays are written. Ignored by git. */
  readonly dataDir: string;
  /**
   * What a phone should open to reach this server, e.g. http://192.168.1.20:8787. Null means work it out per request.
   * From loadConfig this is PUBLIC_BASE_URL (or PUBLIC_URL), else the address of a tunnel opened by scripts/tunnel.mjs.
   * That one is looked up on every read, because a tunnel starts and stops while the server runs.
   */
  readonly publicBaseUrl: string | null;
  /** The built game, served by this server when it exists. */
  readonly distDir: string;
  readonly timeouts: {
    readonly levelMs: number;
    /** The whole god scan, both attempts included. */
    readonly revealMs: number;
    /** A god scan with no answer after this long gets a second attempt beside it. Left out: only a failed first attempt is tried again. */
    readonly revealHedgeMs?: number;
    readonly portraitMs: number;
    readonly speechMs: number;
  };
}

/**
 * How long each AI call may take before the route answers with its fallback. Every route the player waits on answers
 * in under five seconds, and every limit is at least a second shorter than the browser's own wait for that route, so
 * the server is never still working when the page has given up. docs/failure-drill.md has the table, and
 * server/tests/failureDrill.test.ts holds both rules.
 *
 * - levelMs: the page waits LEVEL_TIMEOUT_MS (src/ai/client.ts). A real level took 2.9 to 3.6 s, and 1 in 11 was not back by 4.8 s.
 * - revealMs and revealHedgeMs: the page waits REVEAL_BUDGET_MS (src/ai/revealGod.ts). A real scan took 0.85 to 2.3 s,
 *   so a second attempt started at 2.5 s is not started for nothing and still has time to answer before revealMs.
 * - portraitMs: the one limit over five seconds, because a painting takes that long. Nothing waits on it: the god is
 *   shown first and the picture is filled in when it comes (PORTRAIT_TIMEOUT_MS in src/ai/reveal.ts).
 * - speechMs: the page waits SPEECH_WAIT_MS (src/audio/narration.ts). A real line took 0.2 to 0.6 s.
 */
export const TIMEOUTS: Required<Config["timeouts"]> = {
  levelMs: 4800,
  revealMs: 4800,
  revealHedgeMs: 2500,
  portraitMs: 12000,
  speechMs: 4500,
};

function value(name: string): string | null {
  const raw = process.env[name]?.trim();
  return raw === undefined || raw === "" ? null : raw;
}

/** A whole number from 1 to 65535, or the default port with a warning. */
export function parsePort(raw: string | null): number {
  if (raw === null) return DEFAULT_PORT;
  const port = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  if (port >= 1 && port <= 65535) return port;
  log("warn", "bad_server_port", { value: raw, using: DEFAULT_PORT });
  return DEFAULT_PORT;
}

export function loadConfig(root: string = process.cwd()): Config {
  loadEnvFile(resolve(root, ".env"));
  const dataDir = resolve(root, "server/data");
  const fixedUrl = value("PUBLIC_BASE_URL") ?? value("PUBLIC_URL");
  return {
    // Not PORT: hosts and dev tools set that for the web page, and the two must not collide.
    port: parsePort(value("AI_SERVER_PORT")),
    geminiKey: value("GEMINI_API_KEY"),
    elevenLabsKey: value("ELEVENLABS_API_KEY"),
    dataDir,
    get publicBaseUrl() {
      return fixedUrl ?? tunnelAddress(dataDir);
    },
    distDir: resolve(root, "dist"),
    timeouts: TIMEOUTS,
  };
}
