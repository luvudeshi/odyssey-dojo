// Client side of polling, against the real relay: a stream that never delivers, a stream that dies mid-conversation,
// the 429 answers, and the host's keep-alive. The only made-up parts are the streams (Node has no EventSource).
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, test, vi } from "vitest";
import { NO_AI } from "../../server/ai/types";
import { createApp } from "../../server/app";
import type { Config } from "../../server/env";
import { KEEP_EVERY_MS, createHostLink } from "../../src/net/host";
import { createGuestLink } from "../../src/net/guest";
import { parseMessage } from "../../src/net/messages";
import type { NetMessage } from "../../src/net/messages";
import { createRoom, joinRoom, openRoom } from "../../src/net/transport";
import type { EventStream, NetDeps, RoomTransport } from "../../src/net/transport";
import { ROOM_MESSAGES } from "../../src/screens/roomUrl";

const config: Config = {
  port: 0, geminiKey: null, elevenLabsKey: null, dataDir: "/nonexistent", publicBaseUrl: null, distDir: "/nonexistent",
  timeouts: { levelMs: 80, revealMs: 80, portraitMs: 80, speechMs: 80 },
};

let server: Server | null = null;
const hangUps: AbortController[] = [];
afterEach(() => {
  vi.useRealTimers();
  for (const hangUp of hangUps.splice(0)) hangUp.abort();
  server?.close();
  server?.closeAllConnections();
  server = null;
});

/** Node has no EventSource: this reads the relay's text stream with fetch, ids included. */
function realStream(url: string): EventStream {
  const hangUp = new AbortController();
  hangUps.push(hangUp);
  const stream: EventStream = { onmessage: null, onerror: null, close: () => { hangUp.abort(); } };
  void (async () => {
    try {
      const reader = (await fetch(url, { signal: hangUp.signal })).body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        for (let cut = buffer.indexOf("\n\n"); cut >= 0; cut = buffer.indexOf("\n\n")) {
          const lines = buffer.slice(0, cut).split("\n");
          buffer = buffer.slice(cut + 2);
          const data = lines.find((line) => line.startsWith("data: "));
          const id = lines.find((line) => line.startsWith("id: "));
          if (data !== undefined) stream.onmessage?.({ data: data.slice(6), ...(id === undefined ? {} : { lastEventId: id.slice(4) }) });
        }
      }
    } catch {
      // Hung up by the test.
    }
  })();
  return stream;
}

/** A stream the network swallows: it opens and nothing ever comes out, as behind a Cloudflare quick tunnel. */
function silentStream(): EventStream & { closed: boolean } {
  const stream: EventStream & { closed: boolean } = { onmessage: null, onerror: null, closed: false, close: () => { stream.closed = true; } };
  return stream;
}

async function serve(): Promise<string> {
  const listening = (await createApp({ config, ai: NO_AI })).listen(0, "127.0.0.1");
  await once(listening, "listening");
  server = listening;
  return `http://127.0.0.1:${String((listening.address() as AddressInfo).port)}`;
}

/** The real timer, kept from before any test swaps in a made-up one, so waiting on the network still works then. */
const realTimeout = setTimeout;
const realNow = Date.now.bind(Date);
/** Long enough for a machine with every core busy, and inside the 30 s a test may take. */
const UNTIL_MS = 20_000;

async function until(what: string, done: () => boolean): Promise<void> {
  for (const start = realNow(); realNow() - start < UNTIL_MS; ) {
    if (done()) return;
    await new Promise((resolve) => realTimeout(resolve, 20));
  }
  if (done()) return;
  throw new Error(`timed out waiting for ${what}`);
}

function start(seed: number): NetMessage {
  return { type: "start", enemyId: "e", styleId: "s", seed };
}

const seeds = (heard: readonly NetMessage[]): number[] => heard.flatMap((message) => (message.type === "start" ? message.seed : []));

async function pair(base: string, deps: (who: "host" | "guest") => NetDeps): Promise<{ host: RoomTransport; guest: RoomTransport; hostHeard: NetMessage[]; guestHeard: NetMessage[] }> {
  const hostDeps = deps("host");
  const room = await createRoom(hostDeps, base);
  if (typeof room === "string") throw new Error(room);
  const host = openRoom(hostDeps, room, base);
  const hostHeard: NetMessage[] = [];
  host.onMessage((message) => hostHeard.push(message));
  const guestDeps = deps("guest");
  const seat = await joinRoom(guestDeps, room.code, base);
  if (typeof seat === "string") throw new Error(seat);
  const guest = openRoom(guestDeps, seat, base);
  const guestHeard: NetMessage[] = [];
  guest.onMessage((message) => guestHeard.push(message));
  return { host, guest, hostHeard, guestHeard };
}

test("a guest whose stream never delivers still gets every host message, in order, by polling", async () => {
  // Only the timers are made up, so the guest gives up on its stream when the test says so, not when a busy machine
  // gets round to it. The relay, the host's stream and every request are real.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const base = await serve();
  const quiet = silentStream();
  const proofMs = 150;
  // The host keeps the default wait: its stream is real, and it must stay on it however slowly the first line comes.
  const { host, guest, hostHeard, guestHeard } = await pair(base, (who) => (who === "host"
    ? { fetch: (url, init) => fetch(url, init), openStream: realStream }
    : { fetch: (url, init) => fetch(url, init), openStream: () => quiet, streamProofMs: proofMs }));
  // The host is connected before the guest first asks, so the guest is told so once and never told otherwise.
  await until("the host's stream", () => hostHeard.length > 0);
  // Five are sent before the guest gives up on its stream, five after.
  for (let seed = 1; seed <= 5; seed += 1) await host.send(start(seed));
  await vi.advanceTimersByTimeAsync(proofMs - 1);
  expect(quiet.closed).toBe(false);
  expect(guestHeard).toEqual([]);
  await vi.advanceTimersByTimeAsync(1);
  expect(quiet.closed).toBe(true);
  for (let seed = 6; seed <= 10; seed += 1) await host.send(start(seed));
  await until("every message", () => seeds(guestHeard).length >= 10);
  // One more from the host comes last, so anything heard twice would already be in the list.
  await host.send({ type: "end", won: true });
  await until("the last message", () => guestHeard.some((message) => message.type === "end"));
  expect(seeds(guestHeard)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  // The relay's word on the host reaches the guest too, once.
  expect(guestHeard.filter((message) => message.type === "peer")).toEqual([{ type: "peer", joined: true }]);
  expect(guestHeard.length).toBe(12);
  guest.close();
  host.close();
});

test("a stream that dies mid-conversation hands over to polling with nothing lost and nothing heard twice", async () => {
  const base = await serve();
  let guestStream: EventStream | null = null;
  const { host, guest, guestHeard } = await pair(base, (who) => ({
    fetch: (url, init) => fetch(url, init),
    openStream: (url) => {
      const stream = realStream(url);
      if (who === "guest") guestStream = stream;
      return stream;
    },
  }));
  await until("both here", () => guestHeard.some((message) => message.type === "peer"));
  let next = 1;
  const sendTo = async (count: number): Promise<void> => { for (let n = 0; n < count; n += 1) await host.send(start(next++)); };
  await sendTo(5);
  await until("five on the stream", () => seeds(guestHeard).length === 5);
  // The stream errors while the host keeps talking: some are already on the wire, some come after.
  const more = sendTo(10);
  (guestStream as EventStream | null)?.onerror?.();
  await more;
  await sendTo(5);
  await until("all twenty", () => seeds(guestHeard).length >= 20);
  await new Promise((resolve) => setTimeout(resolve, 150));
  expect(seeds(guestHeard)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
  guest.close();
  host.close();
});

test("closing a polling link stops the loop and cancels the request in flight", async () => {
  const base = await serve();
  const calls: { url: string; signal: AbortSignal | undefined }[] = [];
  const deps: NetDeps = {
    fetch: (url, init) => { calls.push({ url, signal: init.signal }); return fetch(url, init); },
    openStream: () => silentStream(),
    streamProofMs: 50,
  };
  const room = await createRoom(deps, base);
  if (typeof room === "string") throw new Error(room);
  const link = openRoom(deps, room, base);
  await until("a poll in flight", () => calls.some((call) => call.url.includes("/poll?")));
  const poll = calls.find((call) => call.url.includes("/poll?"));
  expect(poll?.url).toContain("&after=0");
  link.close();
  expect(poll?.signal?.aborted).toBe(true);
  const count = calls.length;
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(calls.length).toBe(count);
});

test("a stream that errors before saying anything switches at once, and a poll the relay refuses ends the loop", async () => {
  const calls: string[] = [];
  const quiet = silentStream();
  const deps: NetDeps = {
    fetch: (url) => { calls.push(url); return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) }); },
    openStream: () => quiet,
  };
  openRoom(deps, { code: "ABCD", token: "t" }, "http://relay");
  quiet.onerror?.();
  await until("the poll", () => calls.length === 1);
  expect(calls[0]).toBe("http://relay/api/rooms/ABCD/poll?token=t&after=0");
  expect(quiet.closed).toBe(true);
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(calls.length).toBe(1);
});

test("a 429 from the relay is its own answer, with a line for the screen", async () => {
  const limited: NetDeps = {
    fetch: () => Promise.resolve({ ok: false, status: 429, json: () => Promise.resolve({ error: "too_many_requests" }) }),
    openStream: () => silentStream(),
  };
  expect(await createRoom(limited)).toBe("slow_down");
  expect(await joinRoom(limited, "KXTR")).toBe("slow_down");
  expect(ROOM_MESSAGES.slow_down).toBe("Too many tries from this network. Wait a minute and try again.");
});

test("an idle host sends a keep message every five minutes until it closes, and the guest ignores it", () => {
  vi.useFakeTimers();
  const sent: NetMessage[] = [];
  const ears: ((message: NetMessage) => void)[] = [];
  const transport: RoomTransport = {
    send: (message) => { sent.push(message); return Promise.resolve(true); },
    onMessage: (listener) => ears.push(listener),
    close: () => undefined,
  };
  const host = createHostLink(transport);
  vi.advanceTimersByTime(KEEP_EVERY_MS - 1);
  expect(sent).toEqual([]);
  vi.advanceTimersByTime(1);
  expect(sent).toEqual([{ type: "keep" }]);
  vi.advanceTimersByTime(2 * KEEP_EVERY_MS);
  expect(sent.length).toBe(3);
  host.close();
  vi.advanceTimersByTime(10 * KEEP_EVERY_MS);
  expect(sent.length).toBe(3);

  // The guest's side: keep and anything unknown change nothing.
  expect(parseMessage({ type: "keep" })).toBeNull();
  expect(parseMessage({ type: "something new" })).toBeNull();
  const guest = createGuestLink({ send: () => Promise.resolve(true), onMessage: (listener) => ears.push(listener), close: () => undefined });
  for (const ear of ears) ear({ type: "keep" });
  expect(guest.fight()).toBeNull();
  expect(guest.view()).toBeNull();
  expect(guest.result()).toBeNull();
  expect(guest.stopped()).toBe(false);
});
