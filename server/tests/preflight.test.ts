// The demo-day preflight: what passes, what only warns, and what fails. No keys and no network.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import {
  POSE_MODEL,
  POSE_WASM_DIR,
  checkClips,
  checkElevenLabs,
  checkGemini,
  checkKeys,
  checkPoseFiles,
  checkServer,
  formatLine,
  summary,
} from "../lib/preflightChecks";

let dir = "";
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "preflight-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

function put(path: string, content = "x"): void {
  const file = join(dir, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function goodClips(): void {
  put("athena/index.json", '["win","loss"]');
  put("athena/win.mp3");
  put("athena/loss.mp3");
  put("sfx/index.json", '["won"]');
  put("sfx/won.mp3");
}

test("clips pass when every listed id has a file and every file is listed", () => {
  goodClips();
  expect(checkClips(dir)).toEqual({ level: "PASS", name: "clips", detail: "2 Athena, 1 effects" });
  put("music/index.json", '["cave"]');
  put("music/cave.mp3");
  expect(checkClips(dir).detail).toBe("2 Athena, 1 effects, 1 music");
});

test("a listed clip with no file, an empty file, a bad index or a missing folder is a fail", () => {
  goodClips();
  rmSync(join(dir, "athena/win.mp3"));
  put("sfx/won.mp3", "");
  const broken = checkClips(dir);
  expect(broken.level).toBe("FAIL");
  expect(broken.detail).toContain("athena/win.mp3 is missing or empty");
  expect(broken.detail).toContain("sfx/won.mp3 is missing or empty");

  put("sfx/index.json", '{"won":true}');
  expect(checkClips(dir).detail).toContain("sfx/index.json is missing or is not a list of ids");
  rmSync(join(dir, "sfx"), { recursive: true });
  expect(checkClips(dir).detail).toContain("sfx/ is missing");
});

test("a clip file that no index lists is only a warning", () => {
  goodClips();
  put("athena/extra.mp3");
  const line = checkClips(dir);
  expect(line.level).toBe("WARN");
  expect(line.detail).toContain("athena/extra.mp3");
});

test("the clips in this repo pass", () => {
  expect(checkClips(resolve(process.cwd(), "public/audio")).level).toBe("PASS");
});

test("keys are reported as present or missing, and a missing key is a warning", () => {
  expect(checkKeys({ gemini: true, elevenLabs: true })).toEqual({
    level: "PASS", name: "keys", detail: "GEMINI_API_KEY present, ELEVENLABS_API_KEY present",
  });
  const line = checkKeys({ gemini: true, elevenLabs: false });
  expect(line.level).toBe("WARN");
  expect(line.detail).toContain("ELEVENLABS_API_KEY missing");
});

test("gemini passes with the model that answered and the time it took", async () => {
  const clock = [1000, 1420];
  const line = await checkGemini(
    (request) => { request.onModel?.("gemini-test"); return Promise.resolve({ ok: true }); },
    500,
    () => clock.shift() ?? 0,
  );
  expect(line).toEqual({ level: "PASS", name: "gemini", detail: "gemini-test answered in 420 ms" });
});

test("gemini with no key, an error or no answer in time is a warning that names the fallback", async () => {
  const fallback = "the game falls back to bundled fights and the browser god scan";
  const lines = await Promise.all([
    checkGemini(null, 50),
    checkGemini(() => Promise.reject(new Error("quota used up")), 50),
    checkGemini(() => new Promise(() => undefined), 20),
  ]);
  for (const line of lines) {
    expect(line.level).toBe("WARN");
    expect(line.detail).toContain(fallback);
  }
  expect(lines[1].detail).toContain("quota used up");
  expect(lines[2].detail).toContain("timed out after 20 ms");
});

test("elevenlabs passes with a voice count, and warns on no key, no voices or an error", async () => {
  const voice = { id: "v1", name: "George" };
  const clock = [0, 300];
  const good = await checkElevenLabs(() => Promise.resolve([voice, voice]), 50, () => clock.shift() ?? 0);
  expect(good).toEqual({ level: "PASS", name: "elevenlabs", detail: "2 voices listed in 300 ms" });
  const bad = await Promise.all([
    checkElevenLabs(null, 50),
    checkElevenLabs(() => Promise.resolve([]), 50),
    checkElevenLabs(() => Promise.reject(new Error("elevenlabs 401")), 50),
  ]);
  for (const line of bad) {
    expect(line.level).toBe("WARN");
    expect(line.detail).toContain("the game plays the bundled clips");
  }
});

test("the AI server is up when /api/health answers ok, and down is a warning that says how to start it", async () => {
  const urls: string[] = [];
  const up: typeof fetch = (url) => {
    urls.push(typeof url === "string" ? url : "not a string");
    return Promise.resolve(Response.json({ ok: true, gemini: true, speech: false }));
  };
  expect(await checkServer(8787, up)).toEqual({
    level: "PASS", name: "ai server", detail: "up on port 8787 (gemini yes, speech no)",
  });
  expect(urls).toEqual(["http://127.0.0.1:8787/api/health"]);

  const down = { level: "WARN", name: "ai server", detail: "nothing answers on port 8787; start it with npm run dev:all" };
  expect(await checkServer(8787, () => Promise.reject(new Error("ECONNREFUSED")))).toEqual(down);
  expect(await checkServer(8787, () => Promise.resolve(new Response("<html>", { status: 404 })))).toEqual(down);
});

test("the pose files pass when all are there, and one missing or empty file is a fail that names it", () => {
  put(POSE_MODEL);
  put(`${POSE_WASM_DIR}/vision_wasm_internal.js`);
  put(`${POSE_WASM_DIR}/vision_wasm_internal.wasm`, "");
  const line = checkPoseFiles(dir);
  expect(line.level).toBe("FAIL");
  expect(line.detail).toContain("mediapipe/wasm/vision_wasm_internal.wasm");
  expect(line.detail).not.toContain(POSE_MODEL);
  put(`${POSE_WASM_DIR}/vision_wasm_internal.wasm`);
  expect(checkPoseFiles(dir).level).toBe("PASS");
});

test("the pose paths checked are the ones the tracker loads", () => {
  const tracker = readFileSync(resolve(process.cwd(), "src/pose/tracker.ts"), "utf8");
  expect(tracker).toContain(`"/${POSE_MODEL}"`);
  expect(tracker).toContain(`"/${POSE_WASM_DIR}"`);
});

test("a line is plain text, and a key that slipped into a detail is hidden", () => {
  expect(formatLine({ level: "PASS", name: "clips", detail: "45 Athena, 11 effects" })).toBe("PASS clips: 45 Athena, 11 effects");
  const leaked = formatLine({ level: "WARN", name: "gemini", detail: "no answer (bad key sk-secret-123)" }, ["sk-secret-123", null]);
  expect(leaked).toBe("WARN gemini: no answer (bad key [hidden])");
});

test("only a fail makes the exit code 1", () => {
  const pass = { level: "PASS", name: "a", detail: "" } as const;
  const warn = { level: "WARN", name: "b", detail: "" } as const;
  const skip = { level: "SKIP", name: "c", detail: "" } as const;
  const fail = { level: "FAIL", name: "d", detail: "" } as const;
  expect(summary([pass, pass])).toEqual({ line: "preflight: 2 pass, 0 warn, 0 fail. ready", exitCode: 0 });
  expect(summary([pass, warn, skip])).toEqual({ line: "preflight: 1 pass, 1 warn, 0 fail. ready, with fallbacks in use", exitCode: 0 });
  expect(summary([pass, warn, fail])).toEqual({ line: "preflight: 1 pass, 1 warn, 1 fail. NOT READY", exitCode: 1 });
});
