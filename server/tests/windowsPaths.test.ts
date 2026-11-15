// What the server does with paths must hold on Windows. These tests run on any machine: the path logic is given
// path.win32, and the routes are asked for the ids and file names that only mean something on Windows.
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, posix, win32 } from "node:path";
import { afterAll, afterEach, expect, test, vi } from "vitest";
import { ATHENA_LINES } from "../../src/audio/athenaLines";
import { ALL_STORY_LINES } from "../../src/audio/narrationLines";
import { NO_AI } from "../ai/types";
import { createApp } from "../app";
import type { Config } from "../env";
import { decodeEnvFile, loadEnvFile } from "../lib/envFile";
import { checkClips, checkPoseFiles } from "../lib/preflightChecks";
import { CARD_FILE, VIDEO_KINDS, createReplay, findReplay, isReplayId, replayDir, videoFile } from "../lib/replayStore";
import { STOP_CLIPS } from "../tools/stopClips";
import { isInside, listFiles, toPosix, windowsNameProblem } from "./support/paths";

const scratch = mkdtempSync(join(tmpdir(), "odyssey-windows-"));
let close: (() => void) | null = null;
afterEach(() => { close?.(); close = null; vi.restoreAllMocks(); });
afterAll(() => { rmSync(scratch, { recursive: true, force: true }); });

const meta = { godName: "Athena", epithet: "", enemyName: "Polyphemus", fightTitle: "", score: 1, won: true } as const;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const SECRET = "GEMINI_API_KEY=do-not-serve-this";
const WIN_DATA = "C:\\game\\server\\data";

type Call = (path: string, init?: RequestInit) => Promise<Response>;

async function serve(dataDir: string, distDir: string): Promise<Call> {
  const config: Config = {
    port: 0, geminiKey: null, elevenLabsKey: null, dataDir, publicBaseUrl: null, distDir,
    timeouts: { levelMs: 80, revealMs: 80, portraitMs: 80, speechMs: 80 },
  };
  const app = await createApp({ config, ai: NO_AI });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  close = () => { server.close(); };
  const { port } = server.address() as AddressInfo;
  return (path, init) => fetch(`http://127.0.0.1:${String(port)}${path}`, init);
}

/** Ids that only Windows gives a meaning to, as they arrive in a URL. `real` is an id that exists. */
function windowsIds(real: string): string[] {
  return [
    // Backslash is a separator on Windows, so these would climb out of the replays folder.
    "..%5Cx", "..%5C..%5Cx", "%2e%2e%5Cx", `${real}%5C..%5C..%5Cx`, "..%5C..%2Fx",
    // A drive letter, a drive-relative path, and UNC and device prefixes.
    "C:%5Cx", "C:x", "c%3A%5Cx", "%5C%5Cserver%5Cshare%5Cx", "%5C%5C%3F%5CC:%5Cx", "%5C%5C.%5CC:%5Cx", "%5Cx",
    // Other names Windows resolves to the folder of a real replay: a trailing dot or space, upper case, a data stream.
    `${real}.`, `${real}%20`, real.toUpperCase(), `${real}::$DATA`, `${real}:x`, `${real}%5C`, `${real.slice(0, 6)}~1`,
    // Device names.
    "CON", "NUL", "nul.png", "COM1", "LPT1",
  ];
}

test("a recursive listing made on Windows reads the same as one made anywhere else", () => {
  // What readdirSync(dir, { recursive: true }) answers on Windows for one stored replay. This is the listing
  // server/tests/replays.test.ts compared with forward slashes, which failed on a Windows laptop.
  const onWindows = ["replays", win32.join("replays", "abcdefghjk"), win32.join("replays", "abcdefghjk", "card.png")];
  expect(onWindows[2]).toBe("replays\\abcdefghjk\\card.png");
  expect(onWindows.map((path) => toPosix(path, win32.sep))).toEqual(["replays", "replays/abcdefghjk", "replays/abcdefghjk/card.png"]);
  // Elsewhere a backslash is an ordinary character in a name and is left alone.
  expect(toPosix("odd\\name/card.png", posix.sep)).toBe("odd\\name/card.png");

  const dir = join(scratch, "listing");
  mkdirSync(join(dir, "a", "b"), { recursive: true });
  writeFileSync(join(dir, "a", "b", "c.txt"), "");
  expect(listFiles(dir)).toEqual(["a", "a/b", "a/b/c.txt"]);
});

test("with Windows path rules a replay folder is always one level under replays, and nothing but an id gets a folder", () => {
  const root = win32.join(WIN_DATA, "replays");
  for (const id of ["abcdefghjk", "2345678992", "zzzzzzzzzz", "hjkmnpqrst"]) {
    const dir = replayDir(WIN_DATA, id, win32);
    expect(dir).toBe(`${root}\\${id}`);
    expect(win32.dirname(dir ?? "")).toBe(root);
    expect(windowsNameProblem(id), id).toBeNull();
  }
  for (const encoded of windowsIds("abcdefghjk")) {
    const id = decodeURIComponent(encoded);
    expect(isReplayId(id), encoded).toBe(false);
    expect(replayDir(WIN_DATA, id, win32), encoded).toBeNull();
  }
  // Why the id check cannot be a search for "/": joined as they are, these leave the folder on Windows and nowhere else.
  for (const id of ["..\\x", "..\\..\\x", "abcdefghjk\\..\\..\\x"]) {
    expect(isInside(root, win32.join(root, id), win32), id).toBe(false);
    expect(isInside("/game/server/data/replays", posix.join("/game/server/data/replays", id), posix), id).toBe(true);
  }
  expect(isInside(root, "D:\\elsewhere", win32)).toBe(false);
  expect(isInside(root, "\\\\server\\share\\x", win32)).toBe(false);
  expect(isInside(root, `${root}\\abcdefghjk\\card.png`, win32)).toBe(true);
  expect(isInside(root, root, win32)).toBe(true);
});

test("ids that only mean something on Windows are a 404 on every replay route and touch nothing", async () => {
  const dataDir = join(scratch, "ids");
  mkdirSync(join(dataDir, "x"), { recursive: true });
  // What "..\x" would reach if it were ever joined onto the replays folder.
  writeFileSync(join(dataDir, "x", "meta.json"), JSON.stringify({ meta, page_url: "http://leak.example", created_ms: 1 }));
  writeFileSync(join(dataDir, "x", "card.png"), PNG);
  const real = (await createReplay(dataDir, meta, PNG, (id) => `http://test.example/replays/${id}`)).id;
  const call = await serve(dataDir, join(scratch, "no-dist"));
  expect((await call(`/replays/${real}/card.png`)).status).toBe(200);
  const before = listFiles(dataDir);

  for (const id of windowsIds(real)) {
    expect(await findReplay(dataDir, decodeURIComponent(id)), id).toBeNull();
    const page = await call(`/replays/${id}`);
    expect(page.status, id).toBe(404);
    expect(await page.text(), id).not.toContain("Athena");
    expect((await call(`/replays/${id}/card.png`)).status, id).toBe(404);
    expect((await call(`/replays/${id}/video`)).status, id).toBe(404);
    expect((await call(`/api/replays/${id}/qr.svg`)).status, id).toBe(404);
    const upload = { method: "PUT", headers: { "Content-Type": "video/webm" }, body: new Uint8Array([1, 2, 3]) };
    expect((await call(`/api/replays/${id}/video`, upload)).status, id).toBe(404);
  }
  expect(listFiles(dataDir)).toEqual(before);
});

test("the built game is served, and a backslash path cannot reach a file beside it", async () => {
  const root = join(scratch, "static");
  const distDir = join(root, "dist");
  mkdirSync(distDir, { recursive: true });
  writeFileSync(join(distDir, "index.html"), "<p>the game</p>");
  const call = await serve(join(root, "data"), distDir);
  expect(await (await call("/index.html")).text()).toBe("<p>the game</p>");

  // Dot files are never served, so a plain name is tried too: only the path check stands between it and the request.
  for (const name of [".env", "keys.txt"]) {
    writeFileSync(join(root, name), SECRET);
    const paths = [
      `/..%5C${name}`, `/..%5C..%5C${name}`, `/%2e%2e%5C${name}`, `/assets%5C..%5C..%5C${name}`, `/..%2F${name}`, `/%5C..%5C${name}`,
      `/${encodeURIComponent(join(root, name))}`, `/${encodeURIComponent(win32.join("C:\\", "game", name))}`,
      `/%5C%5Clocalhost%5Cc$%5Cgame%5C${name}`,
    ];
    for (const path of paths) {
      const response = await call(path);
      expect([403, 404], path).toContain(response.status);
      expect(await response.text(), path).not.toContain(SECRET);
    }
  }
});

test("a .env file saved by a Windows editor or by PowerShell is still read", () => {
  const text = "# keys\r\nGEMINI_API_KEY=first-value\r\nELEVENLABS_API_KEY=\"second value\"\r\nAI_SERVER_PORT = 9100  \r\n";
  const want = { GEMINI_API_KEY: "first-value", ELEVENLABS_API_KEY: "second value", AI_SERVER_PORT: "9100" };
  const saved: Readonly<Record<string, Buffer>> = {
    "crlf.env": Buffer.from(text),
    // Notepad's "UTF-8 with BOM", and Out-File -Encoding utf8 in Windows PowerShell 5.
    "bom.env": Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text.slice(8))]),
    // What "echo ... > .env" writes in Windows PowerShell 5.
    "utf16.env": Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]),
  };
  const dir = join(scratch, "env");
  mkdirSync(dir);
  for (const [name, bytes] of Object.entries(saved)) {
    writeFileSync(join(dir, name), bytes);
    const env: NodeJS.ProcessEnv = {};
    loadEnvFile(join(dir, name), env);
    expect(env, name).toEqual(want);
  }
  expect(decodeEnvFile(Buffer.from([0xef, 0xbb, 0xbf, 0x41, 0x3d, 0x31]))).toBe("A=1");
  expect(decodeEnvFile(Buffer.alloc(0))).toBe("");

  // What is already set wins, as with process.loadEnvFile, and a missing file changes nothing and warns about nothing.
  const env: NodeJS.ProcessEnv = { GEMINI_API_KEY: "from-the-shell" };
  loadEnvFile(join(dir, "crlf.env"), env);
  expect(env).toEqual({ ...want, GEMINI_API_KEY: "from-the-shell" });
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const empty: NodeJS.ProcessEnv = {};
  loadEnvFile(join(dir, "missing.env"), empty);
  expect(empty).toEqual({});
  expect(warn).not.toHaveBeenCalled();
  // A folder named .env cannot be read: that is a warning, never a crash, and the warning holds no value.
  loadEnvFile(dir, empty);
  expect(empty).toEqual({});
  expect(warn).toHaveBeenCalledTimes(1);
});

test("the preflight reads a clip index saved on Windows, and tells a Windows user how to get the pose files", () => {
  const audio = join(scratch, "audio");
  for (const [folder, id, index] of [
    // Git checks text files out with CRLF on Windows by default.
    ["athena", "win", '[\r\n  "win"\r\n]\r\n'],
    ["sfx", "won", '﻿["won"]\r\n'],
  ] as const) {
    mkdirSync(join(audio, folder), { recursive: true });
    writeFileSync(join(audio, folder, "index.json"), index);
    writeFileSync(join(audio, folder, `${id}.mp3`), "x");
  }
  expect(checkClips(audio)).toEqual({ level: "PASS", name: "clips", detail: "1 Athena, 1 effects" });

  const empty = join(scratch, "no-pose-files");
  expect(checkPoseFiles(empty, "win32").detail).toContain("run npm install from Git Bash");
  expect(checkPoseFiles(empty, "darwin").detail).not.toContain("Git Bash");
  expect(checkPoseFiles(empty, "win32").level).toBe("FAIL");
});

test("the name check knows what Windows refuses", () => {
  for (const name of ["", "a:b", "a?b", "a*b", "a|b", 'a"b', "a<b", "a>b", "a/b", "a\\b", "a\tb", "name.", "name ", "CON", "con", "nul.mp3", "Aux.tar.gz", "COM1", "lpt9.txt"]) {
    expect(windowsNameProblem(name), JSON.stringify(name)).not.toBeNull();
  }
  for (const name of ["card.png", "meta.json", "enemyHit.mp3", "call_block", "console", "com10", "a.b.c", ".env"]) {
    expect(windowsNameProblem(name), name).toBeNull();
  }
});

test("every file name the server writes is one Windows allows, and no two differ only by case", () => {
  const audio = join(process.cwd(), "public", "audio");
  const folders: Record<string, string[]> = {
    "athena lines": ATHENA_LINES.map((line) => line.id),
    "story lines": ALL_STORY_LINES.map((line) => line.id),
    "stop clips": Object.keys(STOP_CLIPS),
    "replay files": [CARD_FILE, "meta.json", ...VIDEO_KINDS.map(videoFile), ...VIDEO_KINDS.map((kind) => `${videoFile(kind)}.part`)],
  };
  // The clips that are on disk, by the ids the game asks for them with. This covers the effects and the music too.
  for (const name of readdirSync(audio)) {
    const index = join(audio, name, "index.json");
    if (existsSync(index)) folders[`public/audio/${name}`] = JSON.parse(readFileSync(index, "utf8")) as string[];
  }
  expect(Object.keys(folders).length).toBeGreaterThan(6);
  for (const [folder, ids] of Object.entries(folders)) {
    expect(ids.length, folder).toBeGreaterThan(0);
    for (const id of ids) {
      // An id may hold "/" for a subfolder, as the stop clips do. Each piece is a name on disk.
      for (const piece of `${id}.mp3`.split("/")) expect(windowsNameProblem(piece), `${folder}: ${id}`).toBeNull();
    }
    // Windows and macOS keep one file for "Win.mp3" and "win.mp3".
    expect(new Set(ids.map((id) => id.toLowerCase())).size, folder).toBe(ids.length);
  }
});

test("with Windows path rules every stop clip lands one folder deep under the stops folder", () => {
  const stops = "C:\\game\\public\\audio\\stops";
  for (const key of Object.keys(STOP_CLIPS)) {
    // The same join server/tools/genClips.ts makes for the file it writes.
    const target = win32.join(stops, `${key}.mp3`);
    expect(isInside(stops, target, win32), key).toBe(true);
    expect(toPosix(win32.relative(stops, target), win32.sep), key).toBe(`${key}.mp3`);
    expect(key.split("/"), key).toHaveLength(2);
  }
});
