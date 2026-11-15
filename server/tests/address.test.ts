// The tunnel address the server hands to phones: which addresses are taken, and when a saved one stops counting.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, expect, test } from "vitest";
import { TUNNEL_FILE, TUNNEL_FILE_MAX_BYTES, TUNNEL_STALE_MS, baseUrl, publicAddress, tunnelAddress } from "../lib/address";

const URL_UP = "https://kingston-inside-best-graphic.trycloudflare.com";
const scratch = mkdtempSync(join(tmpdir(), "odyssey-address-"));
let dataDir = scratch;
let run = 0;
beforeEach(() => {
  run += 1;
  dataDir = mkdtempSync(join(scratch, `run-${String(run)}-`));
});
afterAll(() => { rmSync(scratch, { recursive: true, force: true }); });

function save(content: unknown): void {
  writeFileSync(join(dataDir, TUNNEL_FILE), typeof content === "string" ? content : JSON.stringify(content));
}

/** The id of a process that has already ended. */
function deadPid(): number {
  const ended = spawnSync(process.execPath, ["-e", ""]);
  expect(ended.status).toBe(0);
  return ended.pid;
}

test("only a bare https address is taken as public", () => {
  expect(publicAddress(URL_UP)).toBe(URL_UP);
  expect(publicAddress(`${URL_UP}/`)).toBe(URL_UP);
  expect(publicAddress("https://play.example:8443")).toBe("https://play.example:8443");
  const refused = [
    "http://kingston-inside-best-graphic.trycloudflare.com", "http://192.168.1.20:8787", `${URL_UP}/join`, `${URL_UP}//`, `${URL_UP}/?room=ABCD`, `${URL_UP}/?`,
    `${URL_UP}?x=1`, `${URL_UP}/#top`, `${URL_UP}#`, "https://user:secret@play.example", "https://user@play.example", "https://@play.example",
    "https://PLAY.example", " https://play.example", "https://play.example\n", "https://play.example/\\evil.example", "https:play.example", "https://",
    "//play.example", "play.example", "javascript:alert(1)", "ftp://play.example", "wss://play.example", "", "null",
    null, undefined, 7, {}, [URL_UP],
  ];
  for (const raw of refused) expect(publicAddress(raw), JSON.stringify(raw)).toBeNull();
});

test("with no tunnel file, or one that cannot be read, there is no tunnel address", () => {
  expect(tunnelAddress(dataDir)).toBeNull();
  expect(tunnelAddress(join(dataDir, "missing"))).toBeNull();
  for (const content of ["", "{", "not json", "null", "[]", "7", `"${URL_UP}"`, { url: URL_UP }, { pid: process.pid }, [{ url: URL_UP, pid: process.pid }]]) {
    save(content);
    expect(tunnelAddress(dataDir), JSON.stringify(content)).toBeNull();
  }
});

test("a fresh file from a running process gives its address", () => {
  save({ url: URL_UP, pid: process.pid });
  expect(tunnelAddress(dataDir)).toBe(URL_UP);
  // And the address then leads every link handed to a phone.
  expect(baseUrl({ publicBaseUrl: tunnelAddress(dataDir), lan: "192.168.1.20", port: 8787, protocol: "http", host: "localhost:8787" })).toBe(URL_UP);
});

test("an address that is not bare https is not handed out, even from a running process", () => {
  for (const url of ["http://192.168.1.20:8787", `${URL_UP}/phish`, `${URL_UP}/?next=evil`, "https://user:secret@evil.example", "javascript:alert(1)", 7, null]) {
    save({ url, pid: process.pid });
    expect(tunnelAddress(dataDir), JSON.stringify(url)).toBeNull();
  }
});

test("a file whose process has ended is ignored", () => {
  save({ url: URL_UP, pid: deadPid() });
  expect(tunnelAddress(dataDir)).toBeNull();
  // Ids that are not one process: 0 and negatives mean a group, 1 is always running, and the rest are not ids at all.
  for (const pid of [0, 1, -1, -process.pid, 1.5, Number.MAX_SAFE_INTEGER + 2, String(process.pid), null, true]) {
    save({ url: URL_UP, pid });
    expect(tunnelAddress(dataDir), JSON.stringify(pid)).toBeNull();
  }
});

test("a file nobody has touched for a while is ignored, even if its process id is in use again", () => {
  save({ url: URL_UP, pid: process.pid });
  const now = Date.now();
  expect(tunnelAddress(dataDir, now + TUNNEL_STALE_MS - 2000)).toBe(URL_UP);
  expect(tunnelAddress(dataDir, now + TUNNEL_STALE_MS + 2000)).toBeNull();
  // A clock that jumped back does not make an old file fresh.
  expect(tunnelAddress(dataDir, now - TUNNEL_STALE_MS - 2000)).toBeNull();
  const old = new Date(now - 10 * 60_000);
  utimesSync(join(dataDir, TUNNEL_FILE), old, old);
  expect(tunnelAddress(dataDir)).toBeNull();
});

test("a file bigger than one address and one process id is not read", () => {
  const good = { url: URL_UP, pid: process.pid };
  save({ ...good, padding: "x".repeat(TUNNEL_FILE_MAX_BYTES - JSON.stringify({ ...good, padding: "" }).length) });
  expect(tunnelAddress(dataDir)).toBe(URL_UP);
  save({ ...good, padding: "x".repeat(TUNNEL_FILE_MAX_BYTES) });
  expect(tunnelAddress(dataDir)).toBeNull();
  // 8 MB that would parse to a good address if it were read: only its size is looked at.
  save(`${" ".repeat(8 * 1024 * 1024)}${JSON.stringify(good)}`);
  expect(tunnelAddress(dataDir)).toBeNull();
});
