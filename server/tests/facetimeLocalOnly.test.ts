// Every FaceTime route spends the call service's minutes or hands out a seat in the call's room, so each answers
// this machine only: never a tunnel, a proxy or another device on the network. Checked on the guard's own rules
// and on the real app over HTTP, so a route added to the open paths by mistake fails here.
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterEach, expect, test } from "vitest";
import { NO_AI } from "../ai/types";
import { createApp } from "../app";
import type { Config } from "../env";
import { isOpenPath, isTunnelPath, mayAnswer } from "../lib/localOnly";

const ROUTES: readonly (readonly [string, string])[] = [
  ["GET", "/api/facetime/status"], ["POST", "/api/facetime/seat"], ["POST", "/api/facetime/call"], ["POST", "/api/facetime/standin"],
  ["POST", "/api/facetime/hangup"], ["GET", "/api/facetime/call/call-1"],
];
/** What a tunnel or a proxy adds. The addresses are made up. */
const RELAYS: readonly (readonly [string, string])[] = [
  ["X-Forwarded-For", "203.0.113.9"], ["Cf-Connecting-Ip", "203.0.113.9"], ["Via", "1.1 tunnel"], ["Forwarded", "for=203.0.113.9"],
];
const config: Config = {
  port: 0, geminiKey: null, elevenLabsKey: null, dataDir: "/nonexistent", publicBaseUrl: null, distDir: "/nonexistent",
  timeouts: { levelMs: 80, revealMs: 80, portraitMs: 80, speechMs: 80 },
};
let close: (() => void) | null = null;
afterEach(() => { close?.(); close = null; });

test("no FaceTime route is open to the network or to a tunnel, in any case or with a trailing slash", () => {
  for (const [, path] of ROUTES) {
    for (const each of [path, path.toUpperCase(), `${path}/`]) {
      expect(isOpenPath(each.toLowerCase()), each).toBe(false);
      expect(isTunnelPath(each.toLowerCase()), each).toBe(false);
      expect(mayAnswer(each, "192.168.1.20"), each).toBe(false);
      expect(mayAnswer(each, undefined), each).toBe(false);
      expect(mayAnswer(each, "127.0.0.1", { "x-forwarded-for": "127.0.0.1" }), each).toBe(false);
      expect(mayAnswer(each, "127.0.0.1"), each).toBe(true);
    }
  }
});

test("the real app refuses every FaceTime route to a request that was passed on, and still answers this machine", async () => {
  const app = await createApp({ config, ai: NO_AI });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  close = () => { server.close(); server.closeAllConnections(); };
  const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  for (const [name, value] of RELAYS) {
    for (const [method, path] of ROUTES) {
      const init: RequestInit = method === "POST"
        ? { method, headers: { [name]: value, "Content-Type": "application/json" }, body: JSON.stringify({ to: "+15555550100", room: "odyssey-dojo-0123456789ab" }) }
        : { headers: { [name]: value } };
      const response = await fetch(`${base}${path}`, init);
      expect(response.status, `${method} ${path} with ${name}`).toBe(403);
      expect(await response.json()).toEqual({ error: "local_only" });
    }
  }
  expect((await fetch(`${base}/api/facetime/status`)).status).toBe(200);
  // The guard comes first: a passed-on request that is not JSON either is told local_only, not what was wrong with it.
  const both = await fetch(`${base}/api/facetime/hangup`, { method: "POST", headers: { "X-Forwarded-For": "203.0.113.9", "Content-Type": "text/plain" }, body: "x" });
  expect(both.status).toBe(403);
});
