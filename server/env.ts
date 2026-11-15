// Server settings, read once from the environment (and from .env at the repo root when it exists).
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { log } from "../src/core/log";
import { tunnelAddress } from "./lib/address";

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
    readonly revealMs: number;
    readonly portraitMs: number;
    readonly speechMs: number;
  };
}

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
  const envFile = resolve(root, ".env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
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
    timeouts: { levelMs: 9000, revealMs: 8000, portraitMs: 12000, speechMs: 15000 },
  };
}
