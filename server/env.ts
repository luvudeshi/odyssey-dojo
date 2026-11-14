// Server settings, read once from the environment (and from .env at the repo root when it exists).
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export interface Config {
  readonly port: number;
  readonly geminiKey: string | null;
  readonly elevenLabsKey: string | null;
  /** Where caches and replays are written. Ignored by git. */
  readonly dataDir: string;
  /** What a phone should open to reach this server, e.g. http://192.168.1.20:8787. Null means work it out per request. */
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

export function loadConfig(root: string = process.cwd()): Config {
  const envFile = resolve(root, ".env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  return {
    // Not PORT: hosts and dev tools set that for the web page, and the two must not collide.
    port: Number(value("AI_SERVER_PORT") ?? 8787),
    geminiKey: value("GEMINI_API_KEY"),
    elevenLabsKey: value("ELEVENLABS_API_KEY"),
    dataDir: resolve(root, "server/data"),
    publicBaseUrl: value("PUBLIC_BASE_URL"),
    distDir: resolve(root, "dist"),
    timeouts: { levelMs: 9000, revealMs: 8000, portraitMs: 12000, speechMs: 15000 },
  };
}
