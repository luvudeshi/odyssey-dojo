// Routes that spend API credits answer only this machine; replays and health stay open to the network.
// A request that came through a tunnel or a proxy arrives from loopback, and is still not this machine:
// it gets the room paths a guest needs and the pages, nothing else, and its join attempts are counted.
import { once } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, expect, test } from "vitest";
import { NO_AI } from "../ai/types";
import { createApp } from "../app";
import type { Config } from "../env";
import { JOIN_LIMIT, JOIN_WINDOW_MS, createJoinLimit, isLoopback, isTunnelPath, mayAnswer, wasRelayed } from "../lib/localOnly";

// A built game with one page, so static paths have something to answer with.
const dist = mkdtempSync(join(tmpdir(), "odyssey-dist-"));
writeFileSync(join(dist, "index.html"), "<!doctype html><title>game</title>");
afterAll(() => { rmSync(dist, { recursive: true, force: true }); });

const config: Config = {
  port: 0, geminiKey: null, elevenLabsKey: null, dataDir: "/nonexistent", publicBaseUrl: null, distDir: dist,
  timeouts: { levelMs: 80, revealMs: 80, portraitMs: 80, speechMs: 80 },
};
const LAN = "192.168.1.20";
const LEVEL = JSON.stringify({ phrase: "quick and precise", god: "athena", rival_god: "zeus" });
/** What cloudflared puts on a request it hands to the server. The visitor's address here is made up. */
const TUNNEL: readonly string[] = [
  "Cf-Connecting-Ip: 203.0.113.7", "Cf-Ray: 8f1c2d3e4f5a6b7c-DFW", "X-Forwarded-For: 203.0.113.7", "X-Forwarded-Proto: https",
  "Cdn-Loop: cloudflare", "Cf-Ipcountry: US", 'Cf-Visitor: {"scheme":"https"}',
];
let close: (() => void) | null = null;
afterEach(() => { close?.(); close = null; });

/** The real app on a loopback port. */
async function listen(): Promise<number> {
  const app = await createApp({ config, ai: NO_AI });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  close = () => { server.close(); };
  return (server.address() as AddressInfo).port;
}

/** Sends a request byte for byte as written, so header names keep their case and a value may be empty. Resolves with the status. */
function send(port: number, method: string, path: string, headers: readonly string[], body = ""): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, "127.0.0.1");
    let answer = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => { answer += chunk; });
    socket.on("error", reject);
    socket.on("close", () => { resolve(Number(/^HTTP\/1\.1 (\d{3}) /.exec(answer)?.[1])); });
    const length = body === "" ? [] : ["Content-Type: application/json", `Content-Length: ${String(Buffer.byteLength(body))}`];
    socket.write([`${method} ${path} HTTP/1.1`, "Host: 127.0.0.1", "Connection: close", ...length, ...headers, "", body].join("\r\n"));
  });
}

test("only the three loopback addresses count as this machine", () => {
  for (const address of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) expect(isLoopback(address), address).toBe(true);
  for (const address of [LAN, "::ffff:192.168.1.20", "10.0.0.5", "fe80::1", "0.0.0.0", "127.0.0.1, 10.0.0.5", "localhost", "", undefined]) {
    expect(isLoopback(address), String(address)).toBe(false);
  }
});

test("another device is refused on spending routes and allowed on replays, health and the game itself", () => {
  for (const path of ["/api/level", "/api/reveal", "/api/portrait/abc", "/api/speech", "/api/nope", "/API/Level", "/api/level/", "/api/replays", "/api/healthy"]) {
    expect(mayAnswer(path, LAN), path).toBe(false);
    expect(mayAnswer(path, undefined), path).toBe(false);
    expect(mayAnswer(path, "::ffff:127.0.0.1"), path).toBe(true);
  }
  for (const path of ["/api/replays/abc", "/api/replays/abc/clip.webm", "/api/health", "/API/Health", "/", "/index.html", "/replays/abc", "/assets/app.js"]) {
    expect(mayAnswer(path, LAN), path).toBe(true);
  }
});

test("the room routes a second laptop needs are open to the network, and no spending route opened with them", () => {
  for (const path of ["/api/rooms", "/api/rooms/KXTR/join", "/api/rooms/kxtr/events", "/API/Rooms/KXTR/send"]) {
    expect(mayAnswer(path, LAN), path).toBe(true);
  }
  for (const path of ["/api/level", "/api/reveal", "/api/portrait/abc", "/api/speech", "/api/replays", "/api/room", "/api/roomsx", "/api/rooms-admin", "/api/level/rooms/"]) {
    expect(mayAnswer(path, LAN), path).toBe(false);
  }
});

test("a header that says the request was passed on makes it not local, in any case and with any value", () => {
  const names = [
    "cf-connecting-ip", "cf-ray", "x-forwarded-for", "forwarded", "x-real-ip", "Cf-Connecting-Ip", "CF-RAY", "X-FORWARDED-FOR", "x-ForWarded-fOR",
    "x-forwarded-proto", "x-forwarded-host", "cf-visitor", "cf-ipcountry", "cf-warp-tag-id", "cdn-loop", "true-client-ip", "via",
  ];
  for (const name of names) {
    for (const value of ["203.0.113.7", "127.0.0.1", "::1", "", "unknown"]) {
      expect(wasRelayed({ [name]: value }), `${name}: ${value}`).toBe(true);
      expect(mayAnswer("/api/level", "127.0.0.1", { host: "localhost:8787", [name]: value }), `${name}: ${value}`).toBe(false);
    }
  }
  // What a browser on this machine sends. A cookie or a value that names such a header changes nothing.
  const browser = {
    host: "localhost:8787", "user-agent": "Mozilla/5.0", accept: "*/*", "content-type": "application/json", origin: "http://localhost:5173",
    cookie: "cf-ray=1; x-forwarded-for=2",
  };
  expect(wasRelayed(browser)).toBe(false);
  expect(wasRelayed({})).toBe(false);
  expect(mayAnswer("/api/level", "127.0.0.1", browser)).toBe(true);
  // The headers never grant anything: another device stays refused with or without them.
  expect(mayAnswer("/api/level", LAN, browser)).toBe(false);
  expect(mayAnswer("/api/level", LAN, { "x-forwarded-for": "127.0.0.1" })).toBe(false);
});

test("a browser on this machine still reaches the spending routes", async () => {
  const port = await listen();
  expect(await send(port, "POST", "/api/level", [], LEVEL)).toBe(200);
  expect(await send(port, "POST", "/api/level", ["Origin: http://localhost:5173", "User-Agent: Mozilla/5.0"], LEVEL)).toBe(200);
  for (const [method, path] of [["POST", "/api/speech"], ["POST", "/api/reveal"], ["GET", "/api/portrait/x"]] as const) {
    expect(await send(port, method, path, [], method === "POST" ? "{}" : ""), path).not.toBe(403);
  }
});

test("through the tunnel no route that spends a key answers, whatever the spelling of the path", async () => {
  const port = await listen();
  const spending = [
    ["POST", "/api/level"], ["POST", "/api/speech"], ["POST", "/api/reveal"], ["GET", "/api/portrait/x"], ["POST", "/api/replays"],
    ["POST", "/API/Level"], ["POST", "/api/level/"], ["POST", "/api/level?x=/api/rooms/"], ["GET", "/api/nope"],
  ] as const;
  for (const [method, path] of spending) {
    expect(await send(port, method, path, TUNNEL, method === "POST" ? LEVEL : ""), `${method} ${path}`).toBe(403);
  }
  // Spellings that do not start with /api/ pass the guard. They must then not reach a spending route, from anywhere.
  for (const path of ["//api/level", "/%61pi/level", "/api%2Flevel", "/./api/level", "/x/../api/level", "/api\\level"]) {
    expect(await send(port, "POST", path, TUNNEL, LEVEL), path).toBe(404);
    expect(await send(port, "POST", path, [], LEVEL), `${path} from this machine`).toBe(404);
  }
});

test("one such header is enough, in odd case or with an empty value", async () => {
  const port = await listen();
  const lines = [
    "Cf-Connecting-Ip: 203.0.113.7", "cF-cOnNeCtInG-iP: 203.0.113.7", "CF-RAY: 8f1c2d3e4f5a6b7c-DFW", "cf-ray:", "X-Forwarded-For: 203.0.113.7",
    "x-FORWARDED-for: 127.0.0.1", "X-Forwarded-For:", "X-Forwarded-For: ", "Forwarded: for=203.0.113.7", "fOrWaRdEd:", "X-Real-Ip: 203.0.113.7", "x-real-ip:",
  ];
  for (const line of lines) {
    expect(await send(port, "POST", "/api/level", [line], LEVEL), line).toBe(403);
    expect(await send(port, "POST", "/api/speech", [line], "{}"), line).toBe(403);
    expect(await send(port, "GET", "/api/portrait/x", [line]), line).toBe(403);
  }
});

/** The tunnel's headers for a visitor at `address`. */
function tunnelFrom(address: string): readonly string[] {
  return [`Cf-Connecting-Ip: ${address}`, "Cf-Ray: 8f1c2d3e4f5a6b7c-DFW", `X-Forwarded-For: ${address}`, "X-Forwarded-Proto: https", "Cdn-Loop: cloudflare"];
}

test("a request that was passed on gets the room paths a guest needs and no other API path, from any address", () => {
  const relayed = { "cf-ray": "8f1c2d3e4f5a6b7c-DFW" };
  for (const address of ["127.0.0.1", "::1", LAN, undefined]) {
    for (const path of ["/api/rooms/KXTR/join", "/api/rooms/kxtr/events", "/API/Rooms/KXTR/send", "/api/rooms/address", "/", "/index.html", "/replays/abc", "/replays/abc/video", "/assets/app.js"]) {
      expect(mayAnswer(path, address, relayed), `${path} from ${String(address)}`).toBe(true);
    }
    const closed = [
      "/api/rooms", "/api/rooms/", "/API/Rooms", "/api/rooms//", "/api/rooms//join", "/api/replays/abc", "/api/replays/abc/video", "/api/replays/abc/qr.svg",
      "/api/health", "/api/health/", "/API/Health", "/api/level", "/api/roomsx/KXTR/join", "/api/nope",
    ];
    for (const path of closed) expect(mayAnswer(path, address, relayed), `${path} from ${String(address)}`).toBe(false);
  }
  expect(isTunnelPath("/api/rooms/kxtr/join")).toBe(true);
  expect(isTunnelPath("/api/rooms")).toBe(false);
  expect(isTunnelPath("/api/rooms/")).toBe(false);
});

test("through the tunnel a guest can join a room, follow it and send, and the pages answer", async () => {
  const port = await listen();
  // These 404s and the 400 come from the room routes themselves: the guard let the request through.
  expect(await send(port, "POST", "/api/rooms/ZZZZ/join", TUNNEL)).toBe(404);
  expect(await send(port, "GET", "/api/rooms/ZZZZ/events?token=x", TUNNEL)).toBe(404);
  expect(await send(port, "POST", "/api/rooms/ZZZZ/send", TUNNEL, "{}")).toBe(400);
  expect(await send(port, "GET", "/api/rooms/address", TUNNEL)).toBe(200);
  // The replay page and its files are not under /api/. This 404 is the replay page's own "no such replay".
  expect(await send(port, "GET", "/replays/nope", TUNNEL)).toBe(404);
  expect(await send(port, "GET", "/replays/nope/video", TUNNEL)).toBe(404);
  expect(await send(port, "GET", "/", TUNNEL)).toBe(200);
  expect(await send(port, "GET", "/index.html", TUNNEL)).toBe(200);
});

test("through the tunnel nobody can make a room, upload a replay video, or ask for health or a replay QR code", async () => {
  const port = await listen();
  const closed = [
    ["POST", "/api/rooms"], ["POST", "/api/rooms/"], ["POST", "/API/Rooms"], ["POST", "/api/rooms?x=/join"], ["POST", "/api/rooms//"],
    ["PUT", "/api/replays/abcdefghij/video"], ["GET", "/api/replays/abcdefghij/qr.svg"], ["GET", "/API/Replays/abcdefghij/qr.svg"],
    ["GET", "/api/health"], ["GET", "/api/health/"], ["POST", "/api/replays"],
  ] as const;
  for (const [method, path] of closed) expect(await send(port, method, path, TUNNEL), `${method} ${path}`).toBe(403);
  // One header is enough for these too.
  expect(await send(port, "POST", "/api/rooms", ["x-forwarded-for:"])).toBe(403);
  expect(await send(port, "GET", "/api/health", ["cF-rAy: 1"])).toBe(403);
});

test("this machine still makes rooms and reads health, and a room made here can be joined through the tunnel", async () => {
  const port = await listen();
  expect(await send(port, "GET", "/api/health", [])).toBe(200);
  expect(await send(port, "GET", "/api/replays/nope/qr.svg", [])).toBe(404);
  const made = await fetch(`http://127.0.0.1:${String(port)}/api/rooms`, { method: "POST" });
  expect(made.status).toBe(200);
  const { code } = (await made.json()) as { code: string };
  // Spellings the join count does not see do not reach the join route: the seat is still free after them.
  for (const path of [`/api/rooms/${code}/%6aoin`, `/api/rooms/${code}//join`, `/api/rooms/${code}/join/x`, `/api/rooms//${code}/join`]) {
    expect(await send(port, "POST", path, TUNNEL), path).not.toBe(200);
  }
  expect(await send(port, "POST", `/api/rooms/${code}/join`, TUNNEL)).toBe(200);
  // The seat is taken now, which the room route says itself.
  expect(await send(port, "POST", `/api/rooms/${code.toLowerCase()}/join`, TUNNEL)).toBe(409);
});

test("the join limit allows a fixed number of attempts per caller in each window", () => {
  const allowed = createJoinLimit(3, 1000, 2);
  expect([allowed("a", 0), allowed("a", 10), allowed("a", 20)]).toEqual([true, true, true]);
  expect(allowed("a", 30)).toBe(false);
  expect(allowed("a", 999)).toBe(false);
  // Another caller has a count of their own.
  expect(allowed("b", 30)).toBe(true);
  // The table is full and both windows are still running: a third caller waits.
  expect(allowed("c", 500)).toBe(false);
  // A new window starts when the old one has run out, and makes room for others.
  expect(allowed("a", 1000)).toBe(true);
  expect(allowed("c", 1040)).toBe(true);
  expect(allowed("b", 1050)).toBe(false);
  expect(JOIN_LIMIT).toBeGreaterThan(0);
  // At this rate every one of the 279,841 codes takes one address more than a week.
  expect((23 ** 4 / JOIN_LIMIT) * JOIN_WINDOW_MS).toBeGreaterThan(7 * 24 * 60 * 60 * 1000);
});

test("through the tunnel one address gets a limited number of join attempts, however the path is spelled", async () => {
  const port = await listen();
  const walker = tunnelFrom("198.51.100.23");
  const spellings = ["/api/rooms/ZZZZ/join", "/API/Rooms/zzzy/JOIN", "/api/rooms/ZZZX/join/", "/api/rooms/ZZZW/join?x=1"];
  for (let attempt = 0; attempt < JOIN_LIMIT; attempt += 1) {
    const path = spellings[attempt % spellings.length] ?? "";
    expect(await send(port, "POST", path, walker), `attempt ${String(attempt + 1)} ${path}`).toBe(404);
  }
  for (const path of spellings) expect(await send(port, "POST", path, walker), path).toBe(429);
  // The other room paths are not counted, and another visitor is not held back.
  expect(await send(port, "GET", "/api/rooms/ZZZZ/events?token=x", walker)).toBe(404);
  expect(await send(port, "GET", "/api/rooms/address", walker)).toBe(200);
  expect(await send(port, "POST", "/api/rooms/ZZZZ/join", tunnelFrom("198.51.100.24"))).toBe(404);
  // A relayed request that names no visitor is counted against the socket it came from, so it cannot dodge the count by leaving the name out.
  for (let attempt = 0; attempt < JOIN_LIMIT; attempt += 1) expect(await send(port, "POST", "/api/rooms/ZZZZ/join", ["X-Forwarded-For:"])).toBe(404);
  expect(await send(port, "POST", "/api/rooms/ZZZZ/join", ["Cf-Ray: 1", "Cf-Connecting-Ip:"])).toBe(429);
});

test("a browser on this machine is not counted", async () => {
  const port = await listen();
  for (let attempt = 0; attempt < JOIN_LIMIT + 5; attempt += 1) expect(await send(port, "POST", "/api/rooms/ZZZZ/join", [])).toBe(404);
});
