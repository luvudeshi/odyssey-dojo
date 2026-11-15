// Two clients against the real relay on a random loopback port: create, join, start, a strike, state back, leaving.
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, test } from "vitest";
import { NO_AI } from "../../server/ai/types";
import { createApp } from "../../server/app";
import type { Config } from "../../server/env";
import { startFight } from "../../src/combat/engine";
import { ENEMIES } from "../../src/enemies/registry";
import { createGuestLink } from "../../src/net/guest";
import { createHostLink } from "../../src/net/host";
import { createRoom, joinRoom, openRoom } from "../../src/net/transport";
import type { EventStream, NetDeps } from "../../src/net/transport";

const config: Config = {
  port: 0, geminiKey: null, elevenLabsKey: null, dataDir: "/nonexistent", publicBaseUrl: null, distDir: "/nonexistent",
  timeouts: { levelMs: 80, revealMs: 80, portraitMs: 80, speechMs: 80 },
};

let server: Server | null = null;
const hangUps: AbortController[] = [];
afterEach(() => {
  for (const hangUp of hangUps.splice(0)) hangUp.abort();
  server?.close();
  server?.closeAllConnections();
  server = null;
});

/** Node has no EventSource: this reads the same text stream with fetch. */
function streamOver(url: string): EventStream {
  const hangUp = new AbortController();
  hangUps.push(hangUp);
  const stream: EventStream = { onmessage: null, close: () => { hangUp.abort(); } };
  void (async () => {
    try {
      const response = await fetch(url, { signal: hangUp.signal });
      const reader = response.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        for (let cut = buffer.indexOf("\n\n"); cut >= 0; cut = buffer.indexOf("\n\n")) {
          const frame = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 2);
          const data = frame.split("\n").find((line) => line.startsWith("data: "));
          const id = frame.split("\n").find((line) => line.startsWith("id: "));
          if (data !== undefined) stream.onmessage?.({ data: data.slice(6), ...(id === undefined ? {} : { lastEventId: id.slice(4) }) });
        }
      }
    } catch {
      // Hung up by the test.
    }
  })();
  return stream;
}

async function until(what: string, done: () => boolean): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (done()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`timed out waiting for ${what}`);
}

test("the address route answers with a base a phone can open, on the port the browser used", async () => {
  const listening = (await createApp({ config: { ...config, publicBaseUrl: null }, ai: NO_AI })).listen(0, "127.0.0.1");
  await once(listening, "listening");
  server = listening;
  const port = (listening.address() as AddressInfo).port;
  const asked = (await (await fetch(`http://127.0.0.1:${String(port)}/api/rooms/address?port=5741`)).json()) as { base: string };
  expect(asked.base).toMatch(/^http:\/\/[\w.-]+:5741$/);
  const own = (await (await fetch(`http://127.0.0.1:${String(port)}/api/rooms/address?port=junk`)).json()) as { base: string };
  expect(own.base).toContain(`:${String(port)}`);
});

test("a host and a guest fight together through the real relay, and the host carries on when the guest leaves", async () => {
  const listening = (await createApp({ config, ai: NO_AI })).listen(0, "127.0.0.1");
  await once(listening, "listening");
  server = listening;
  const base = `http://127.0.0.1:${String((listening.address() as AddressInfo).port)}`;
  const deps: NetDeps = { fetch: (url, init) => fetch(url, init), openStream: streamOver };

  const room = await createRoom(deps, base);
  if (typeof room === "string") throw new Error(room);
  expect(room.code).toMatch(/^[A-Z]{4}$/);
  const host = createHostLink(openRoom(deps, room, base));

  expect(await joinRoom(deps, "zzzz", base)).toBe("unknown_room");
  const seat = await joinRoom(deps, room.code.toLowerCase(), base);
  if (typeof seat === "string") throw new Error(seat);
  expect(await joinRoom(deps, room.code, base)).toBe("room_full");
  const guest = createGuestLink(openRoom(deps, seat, base));
  await until("both streams", () => host.guestHere() && guest.hostHere());

  const enemy = ENEMIES[0];
  if (!enemy) throw new Error("no enemies");
  host.start(enemy.id, "boxer", 7);
  await until("the start", () => guest.fight()?.seed === 7);

  guest.sendInput({ held: new Set(), struck: [{ move: "jab", quality: 0.9, player: 1 }] });
  // The host holds a lone strike up to 400 ms for the other player's, so the clock moves on between looks.
  let clock = 0;
  let seen = host.takeInput({ held: new Set(), struck: [] }, clock);
  await until("the strike", () => {
    clock += 500;
    seen = host.takeInput({ held: new Set(), struck: [] }, clock);
    return seen.struck.length > 0;
  });
  expect(seen.struck).toEqual([{ move: "jab", quality: 0.9, player: 1 }]);

  host.publish({ ...startFight(enemy, 7), players: 2 }, [], 5000);
  await until("the state", () => guest.view() !== null);

  guest.close();
  await until("the guest leaving", () => !host.guestHere());
  host.close();
});
