// Routes that spend API credits answer only this machine; replays and health stay open to the network.
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterEach, expect, test } from "vitest";
import { NO_AI } from "../ai/types";
import { createApp } from "../app";
import type { Config } from "../env";
import { isLoopback, mayAnswer } from "../lib/localOnly";

const config: Config = {
  port: 0, geminiKey: null, elevenLabsKey: null, dataDir: "/nonexistent", publicBaseUrl: null, distDir: "/nonexistent",
  timeouts: { levelMs: 80, revealMs: 80, portraitMs: 80, speechMs: 80 },
};
const LAN = "192.168.1.20";
let close: (() => void) | null = null;
afterEach(() => { close?.(); close = null; });

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

test("a request from this machine is answered as before, whatever X-Forwarded-For claims", async () => {
  const app = await createApp({ config, ai: NO_AI });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  close = () => { server.close(); };
  const { port } = server.address() as AddressInfo;
  const post = (host: string): Promise<Response> => fetch(`http://${host}:${String(port)}/api/level`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": LAN },
    body: JSON.stringify({ phrase: "quick and precise", god: "athena", rival_god: "zeus" }),
  });
  expect((await post("127.0.0.1")).status).toBe(200);
  expect((await fetch(`http://127.0.0.1:${String(port)}/api/health`)).status).toBe(200);
});
