// The server answers every level request with a valid level, whatever the model does.
import type { AddressInfo } from "node:net";
import { afterEach, expect, test } from "vitest";
import { LevelResponseSchema } from "../../src/ai/contracts";
import { fallbackLevel } from "../../src/ai/fallbacks";
import { NO_AI } from "../ai/types";
import type { AiClients } from "../ai/types";
import { createApp } from "../app";
import type { Config } from "../env";
import { TimeoutError, withTimeout } from "../lib/timeout";

const config: Config = {
  port: 0, geminiKey: null, elevenLabsKey: null, dataDir: "/nonexistent", publicBaseUrl: null, distDir: "/nonexistent",
  timeouts: { levelMs: 80, revealMs: 80, portraitMs: 80, speechMs: 80 },
};
const body = { phrase: "like a Texas thunderstorm", god: "athena", rival_god: "poseidon" } as const;
const base = fallbackLevel(body);
let close: (() => void) | null = null;
afterEach(() => { close?.(); close = null; });

async function serve(ai: Partial<AiClients>): Promise<(path: string, json?: unknown) => Promise<Response>> {
  const app = await createApp({ config, ai: { ...NO_AI, ...ai } });
  const server = app.listen(0, "127.0.0.1");
  close = () => { server.close(); };
  const { port } = server.address() as AddressInfo;
  return (path, json) =>
    fetch(`http://127.0.0.1:${String(port)}${path}`, json === undefined ? {} : {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(json),
    });
}

test("health reports which services have keys, and unknown paths are a JSON 404", async () => {
  const call = await serve({});
  expect(await (await call("/api/health")).json()).toEqual({ ok: true, gemini: false, portraits: false, speech: false, sound: false });
  const missing = await call("/api/nope");
  expect(missing.status).toBe(404);
});

test("with no key the level is the fallback; a bad request is a 400", async () => {
  const call = await serve({});
  expect(await (await call("/api/level", body)).json()).toEqual({ level: base, source: "fallback" });
  expect((await call("/api/level", { phrase: "", god: "athena", rival_god: "zeus" })).status).toBe(400);
  expect((await call("/api/level", { phrase: "x", god: "odin", rival_god: "zeus" })).status).toBe(400);
});

test("a good model answer is clamped and marked as ai", async () => {
  const call = await serve({ json: () => Promise.resolve({ ...base, title: "Made by the model", tempo_bpm: 9999 }) });
  const result = LevelResponseSchema.parse(await (await call("/api/level", body)).json());
  expect(result.source).toBe("ai");
  expect(result.level.title).toBe("Made by the model");
  expect(result.level.tempo_bpm).toBe(170);
});

test("a model that throws, hangs or returns junk still gets the player a level, quickly", async () => {
  const cases: AiClients["json"][] = [
    () => Promise.reject(new Error("boom")),
    () => new Promise(() => undefined),
    () => Promise.resolve("not a level"),
    () => Promise.resolve({ title: "half a level" }),
  ];
  for (const json of cases) {
    const call = await serve({ json });
    const started = Date.now();
    expect(await (await call("/api/level", body)).json()).toEqual({ level: base, source: "fallback" });
    expect(Date.now() - started).toBeLessThan(2000);
    close?.();
    close = null;
  }
});

test("withTimeout aborts the work and rejects even when the work ignores the signal", async () => {
  let aborted = false;
  await expect(withTimeout(20, (signal) => {
    signal.addEventListener("abort", () => { aborted = true; });
    return new Promise(() => undefined);
  })).rejects.toBeInstanceOf(TimeoutError);
  expect(aborted).toBe(true);
  expect(await withTimeout(1000, () => Promise.resolve(7))).toBe(7);
});
