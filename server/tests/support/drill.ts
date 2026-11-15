// What the failure drills share: a server on a spare port with made-up AI clients, and upstream calls that go wrong.
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vi } from "vitest";
import { NO_AI } from "../../ai/types";
import type { AiClients } from "../../ai/types";
import { createApp } from "../../app";
import type { Config } from "../../env";

/** Made-up keys, and on purpose not shaped like real ones. No drill may ever find these in an answer or a log line. */
export const GEMINI_KEY = "made-up-gemini-key-0123456789";
export const ELEVENLABS_KEY = "made-up-elevenlabs-key-9876543210";

/** How long the stalled upstream of the drills takes: far longer than any route may. */
export const STALL_MS = 15_000;

export interface Drill {
  /** GET with no body, POST with one. */
  readonly call: (path: string, json?: unknown) => Promise<Response>;
  readonly close: () => void;
}

export interface DrillOptions {
  readonly timeouts: Config["timeouts"];
  /** Whether the config holds keys. The AI clients are whatever `ai` says either way. */
  readonly keys?: boolean;
}

export async function serve(ai: Partial<AiClients>, options: DrillOptions): Promise<Drill> {
  const dataDir = mkdtempSync(join(tmpdir(), "drill-"));
  const config: Config = {
    port: 0,
    geminiKey: options.keys === true ? GEMINI_KEY : null,
    elevenLabsKey: options.keys === true ? ELEVENLABS_KEY : null,
    dataDir,
    publicBaseUrl: null,
    distDir: "/nonexistent",
    timeouts: options.timeouts,
  };
  const app = await createApp({ config, ai: { ...NO_AI, ...ai } });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  return {
    call: (path, json) =>
      fetch(`http://127.0.0.1:${String(port)}${path}`, json === undefined ? {} : {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(json),
      }),
    close: () => {
      server.close();
      server.closeAllConnections();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

/**
 * An upstream call that stalls: it ignores the signal it was given and only answers, with `late`, after `ms`.
 * The timer does not keep the test run alive.
 */
export function stalled<T>(late: T, ms: number = STALL_MS): Promise<T> {
  return new Promise<T>((resolve) => {
    setTimeout(() => { resolve(late); }, ms).unref();
  });
}

/** Everything the logger writes from now until the mocks are restored, one string per line. */
export function captureLog(): { readonly lines: string[] } {
  const lines: string[] = [];
  for (const level of ["info", "warn", "error"] as const) {
    vi.spyOn(console, level).mockImplementation((...parts: unknown[]) => { lines.push(parts.map(String).join(" ")); });
  }
  return { lines };
}

/** Runs `work` and reports how long it took. */
export async function timed<T>(work: () => Promise<T>): Promise<{ readonly result: T; readonly ms: number }> {
  const started = performance.now();
  const result = await work();
  return { result, ms: performance.now() - started };
}
