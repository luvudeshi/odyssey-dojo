// Speech lines are made once, cached on disk, and never leave the caller waiting or with a 500.
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { NO_AI } from "../ai/types";
import type { AiClients } from "../ai/types";
import { pickVoice } from "../ai/voices";
import { createApp } from "../app";
import type { Config } from "../env";

let dataDir = "";
let close: (() => void) | null = null;
beforeEach(() => { dataDir = mkdtempSync(join(tmpdir(), "speech-")); });
afterEach(() => { close?.(); close = null; rmSync(dataDir, { recursive: true, force: true }); });

async function serve(ai: Partial<AiClients>): Promise<(json: unknown) => Promise<Response>> {
  const config: Config = {
    port: 0, geminiKey: null, elevenLabsKey: null, dataDir, publicBaseUrl: null, distDir: "/nonexistent",
    timeouts: { levelMs: 80, revealMs: 80, portraitMs: 80, speechMs: 80 },
  };
  const app = await createApp({ config, ai: { ...NO_AI, ...ai } });
  const server = app.listen(0);
  close = () => { server.close(); };
  const { port } = server.address() as AddressInfo;
  return (json) => fetch(`http://127.0.0.1:${String(port)}/api/speech`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(json),
  });
}

const voices = [{ id: "v1", name: "Zed" }, { id: "v2", name: "George - warm storyteller" }, { id: "v3", name: "Callum" }];

test("a line is spoken with the right voice, then served from the cache without calling the model again", async () => {
  const calls: string[] = [];
  const call = await serve({
    voices: () => Promise.resolve(voices),
    speech: ({ text, voiceId }) => { calls.push(`${voiceId}:${text}`); return Promise.resolve(Buffer.from("mp3-bytes")); },
  });
  const first = await call({ text: "Sing, Muse.", voice: "homer" });
  expect(first.status).toBe(200);
  expect(first.headers.get("content-type")).toContain("audio/mpeg");
  expect(Buffer.from(await first.arrayBuffer()).toString()).toBe("mp3-bytes");
  expect((await call({ text: "Sing, Muse.", voice: "homer" })).status).toBe(200);
  expect((await call({ text: "Sing, Muse.", voice: "monster" })).status).toBe(200);
  expect(calls).toEqual(["v2:Sing, Muse.", "v3:Sing, Muse."]);
});

test("no key, a failing model and a bad request all answer at once without a 500", async () => {
  expect((await (await serve({}))({ text: "x", voice: "homer" })).status).toBe(503);
  close?.();
  const failing = await serve({ voices: () => Promise.resolve(voices), speech: () => Promise.reject(new Error("quota")) });
  expect((await failing({ text: "x", voice: "homer" })).status).toBe(503);
  expect((await failing({ text: "", voice: "homer" })).status).toBe(400);
  expect((await failing({ text: "x", voice: "zeus" })).status).toBe(400);
});

test("voices are picked by forced id, then by preferred name, then whatever exists", () => {
  expect(pickVoice("homer", voices, "v1")?.id).toBe("v1");
  expect(pickVoice("homer", voices, undefined)?.id).toBe("v2");
  expect(pickVoice("athena", voices, undefined)?.id).toBe("v1");
  expect(pickVoice("athena", [], undefined)).toBeNull();
});
