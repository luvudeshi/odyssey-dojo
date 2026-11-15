// Issue #222, the part after the reload: a guest whose page stays open but whose network is gone for longer than
// the relay holds a seat (a phone that left the Wi-Fi, a laptop that slept). The relay gives the seat away after
// AWAY_MS and then refuses the guest's token. The guest's link must notice its stream is dead, join the room again
// by itself and carry on, so the fight on its screen moves again and its strikes count.
// The relay, the host's stream and every request are real; only the guest's stream can be cut by the test.
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, test, vi } from "vitest";
import { NO_AI } from "../../server/ai/types";
import { createApp } from "../../server/app";
import type { Config } from "../../server/env";
import { AWAY_MS } from "../../server/lib/rooms";
import { HEARTBEAT_MS } from "../../server/routes/rooms";
import type { NetMessage } from "../../src/net/messages";
import { STREAM_QUIET_MS, createRoom, joinRoom, joinRoomAgain, openRoom } from "../../src/net/transport";
import type { EventStream, NetDeps, RoomTransport, SeatStore } from "../../src/net/transport";

const config: Config = {
  port: 0, geminiKey: null, elevenLabsKey: null, dataDir: "/nonexistent", publicBaseUrl: null, distDir: "/nonexistent",
  timeouts: { levelMs: 80, revealMs: 80, portraitMs: 80, speechMs: 80 },
};

let server: Server | null = null;
const hangUps: AbortController[] = [];
const links: RoomTransport[] = [];
afterEach(() => {
  vi.useRealTimers();
  for (const link of links.splice(0)) link.close();
  for (const hangUp of hangUps.splice(0)) hangUp.abort();
  server?.close();
  server?.closeAllConnections();
  server = null;
});

/** A stream the test can cut. `cut()` drops the connection without a word to the page, as a lost network does. */
type CutStream = EventStream & { cut(): void; closed: boolean };

/** Node has no EventSource: this reads the relay's text stream with fetch, ids included. */
function realStream(url: string): CutStream {
  const hangUp = new AbortController();
  hangUps.push(hangUp);
  const stream: CutStream = {
    onmessage: null,
    onerror: null,
    closed: false,
    cut: () => { hangUp.abort(); },
    close: () => { stream.closed = true; hangUp.abort(); },
  };
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
      // Cut by the test.
    }
  })();
  return stream;
}

/** A stream the test speaks on: nothing comes out but what `say` puts in. */
function madeUpStream(): EventStream & { closed: boolean; say(message: unknown): void } {
  const stream: EventStream & { closed: boolean; say(message: unknown): void } = {
    onmessage: null,
    onerror: null,
    closed: false,
    close: () => { stream.closed = true; },
    say: (message) => { stream.onmessage?.({ data: JSON.stringify(message) }); },
  };
  return stream;
}

async function serve(): Promise<string> {
  const listening = (await createApp({ config, ai: NO_AI })).listen(0, "127.0.0.1");
  await once(listening, "listening");
  server = listening;
  return `http://127.0.0.1:${String((listening.address() as AddressInfo).port)}`;
}

/** The real timer and clock, kept from before a test swaps in made-up ones, so waiting on the network still works. */
const realTimeout = setTimeout;
const realNow = Date.now.bind(Date);
const UNTIL_MS = 20_000;

async function until(what: string, done: () => boolean): Promise<void> {
  for (const start = realNow(); realNow() - start < UNTIL_MS; ) {
    if (done()) return;
    await new Promise((resolve) => realTimeout(resolve, 20));
  }
  if (done()) return;
  throw new Error(`timed out waiting for ${what}`);
}

const pause = (ms: number): Promise<void> => new Promise((resolve) => realTimeout(resolve, ms));

function start(seed: number): NetMessage {
  return { type: "start", enemyId: "e", styleId: "s", seed };
}

const seeds = (heard: readonly NetMessage[]): number[] => heard.flatMap((message) => (message.type === "start" ? message.seed : []));
const peers = (heard: readonly NetMessage[]): boolean[] => heard.flatMap((message) => (message.type === "peer" ? message.joined : []));

function memoryStore(): SeatStore & { token(): string | null } {
  const kept = new Map<string, string>();
  return {
    getItem: (key) => kept.get(key) ?? null,
    setItem: (key, value) => { kept.set(key, value); },
    removeItem: (key) => { kept.delete(key); },
    token: () => {
      const seat: unknown = JSON.parse(kept.get("odyssey.room.seat") ?? "null");
      return typeof seat === "object" && seat !== null && "token" in seat && typeof seat.token === "string" ? seat.token : null;
    },
  };
}

interface Pair {
  readonly code: string;
  readonly host: RoomTransport;
  readonly guest: RoomTransport;
  readonly hostHeard: NetMessage[];
  readonly guestHeard: NetMessage[];
  readonly store: ReturnType<typeof memoryStore>;
  /** The guest's stream, to cut. */
  readonly guestStream: () => CutStream;
  /** Every address the guest asked the relay for. */
  readonly guestCalls: string[];
}

/** A host and a guest in one room on the real relay, both on their streams, each told the other is here. */
async function pair(base: string): Promise<Pair> {
  const hostDeps: NetDeps = { fetch: (url, init) => fetch(url, init), openStream: realStream };
  const room = await createRoom(hostDeps, base);
  if (typeof room === "string") throw new Error(room);
  const host = openRoom(hostDeps, room, base);
  const hostHeard: NetMessage[] = [];
  host.onMessage((message) => hostHeard.push(message));
  let guestStream: CutStream | null = null;
  const guestCalls: string[] = [];
  const guestDeps: NetDeps = {
    fetch: (url, init) => { guestCalls.push(url); return fetch(url, init); },
    openStream: (url) => {
      const stream = realStream(url);
      guestStream = stream;
      return stream;
    },
  };
  const store = memoryStore();
  const seat = await joinRoomAgain(guestDeps, room.code, store, base);
  if (typeof seat === "string") throw new Error(seat);
  const guest = openRoom(guestDeps, seat, base);
  const guestHeard: NetMessage[] = [];
  guest.onMessage((message) => guestHeard.push(message));
  links.push(host, guest);
  await until("both here", () => peers(hostHeard).at(-1) === true && peers(guestHeard).at(-1) === true);
  return {
    code: room.code, host, guest, hostHeard, guestHeard, store, guestCalls,
    guestStream: () => {
      if (guestStream === null) throw new Error("the guest opened no stream");
      return guestStream;
    },
  };
}

/** The guest's connection is cut and stays cut until the relay has given its seat away. */
async function awayTooLong(room: Pair): Promise<void> {
  room.guestStream().cut();
  await until("the host hears the guest went", () => peers(room.hostHeard).at(-1) === false);
  vi.setSystemTime(Date.now() + AWAY_MS + 1);
  // Any call makes the relay look at its seats; with the guest's seat empty nobody gets this.
  expect(await room.host.send(start(99))).toBe(false);
}

test("a guest away longer than the relay holds its seat takes a seat again by itself, hears the host and is heard", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const base = await serve();
  const room = await pair(base);
  const first = room.store.token();
  expect(first).not.toBeNull();
  expect(await room.host.send(start(1))).toBe(true);
  await until("the first start", () => seeds(room.guestHeard).includes(1));

  await awayTooLong(room);
  // The network is back and the page's stream reports its error: the relay refuses the old token from here on.
  room.guestStream().onerror?.();

  await until("the host hears the guest is back", () => peers(room.hostHeard).at(-1) === true);
  // The opening line of the host's stream (nobody here yet), then: joined, went, back.
  expect(peers(room.hostHeard)).toEqual([false, true, false, true]);
  expect(room.guestCalls.filter((url) => url.endsWith(`/api/rooms/${room.code}/join`)).length).toBe(2);
  // The new seat is kept where the old one was, so a reload after this still gets straight back in.
  expect(room.store.token()).not.toBe(first);
  expect(room.store.token()).not.toBeNull();

  // Both ways work again: what the host says next reaches the guest once, and the guest's strike reaches the host.
  expect(await room.host.send(start(2))).toBe(true);
  await until("the next start", () => seeds(room.guestHeard).includes(2));
  expect(await room.guest.send({ type: "strike", move: "jab", quality: 0.7 })).toBe(true);
  await until("the strike", () => room.hostHeard.some((message) => message.type === "strike"));
  await pause(100);
  expect(seeds(room.guestHeard).filter((seed) => seed === 2)).toEqual([2]);
  // The guest was never told the host left: its screen stays on the fight.
  expect(peers(room.guestHeard)).not.toContain(false);
});

test("a guest's send the relay refuses for its token also sets the link to take a seat again", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const base = await serve();
  const room = await pair(base);
  await awayTooLong(room);
  // The stream died without an error event; the first the page learns of it is a strike nobody takes.
  expect(await room.guest.send({ type: "strike", move: "jab", quality: 0.7 })).toBe(false);
  await until("the host hears the guest is back", () => peers(room.hostHeard).at(-1) === true);
  expect(room.guestStream().closed).toBe(true);
  expect(await room.guest.send({ type: "strike", move: "hook", quality: 0.7 })).toBe(true);
  await until("the strike", () => room.hostHeard.some((message) => message.type === "strike" && message.move === "hook"));
});

test("when the seat went to somebody else, or the room is gone, the guest is told the host is not here; a host is told nothing", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const base = await serve();
  const room = await pair(base);
  await awayTooLong(room);
  const other = await joinRoom({ fetch: (url, init) => fetch(url, init), openStream: realStream }, room.code, base);
  expect(typeof other).toBe("object");
  room.guestStream().onerror?.();
  await until("the guest is told", () => peers(room.guestHeard).at(-1) === false);
  const calls = room.guestCalls.length;
  await pause(150);
  // It does not keep asking for a seat that is taken.
  expect(room.guestCalls.length).toBe(calls);

  // A room the relay no longer knows: the guest hears it once; a host's link only stops, as before.
  for (const who of ["guest", "host"] as const) {
    const quiet = madeUpStream();
    const asked: string[] = [];
    const deps: NetDeps = {
      fetch: (url) => {
        asked.push(url);
        return Promise.resolve(url.endsWith("/join")
          ? { ok: true, status: 200, json: () => Promise.resolve({ token: "t" }) }
          : { ok: false, status: 404, json: () => Promise.resolve({ error: "unknown_room" }) });
      },
      openStream: () => quiet,
    };
    const seat = who === "guest" ? await joinRoom(deps, "ABCD", "http://relay") : { code: "ABCD", token: "t" };
    if (typeof seat === "string") throw new Error(seat);
    const link = openRoom(deps, seat, "http://relay");
    links.push(link);
    const heard: NetMessage[] = [];
    link.onMessage((message) => heard.push(message));
    quiet.say({ type: "peer", joined: true });
    quiet.onerror?.();
    await until("the poll", () => asked.some((url) => url.includes("/poll?")));
    await pause(50);
    expect(peers(heard)).toEqual(who === "guest" ? [true, false] : [true]);
    expect(asked.filter((url) => url.includes("/poll?")).length).toBe(1);
  }
});

test("a stream that has sent a beat and then goes silent is given up for polling; without a beat it is left alone", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  // The page must wait for more than two beats before it gives a stream up.
  expect(STREAM_QUIET_MS).toBeGreaterThan(2 * HEARTBEAT_MS);
  const open = (): { stream: ReturnType<typeof madeUpStream>; polls: string[]; heard: NetMessage[] } => {
    const stream = madeUpStream();
    const polls: string[] = [];
    const heard: NetMessage[] = [];
    const link = openRoom({
      fetch: (url) => { polls.push(url); return new Promise(() => undefined); },
      openStream: () => stream,
    }, { code: "ABCD", token: "t" }, "http://relay");
    link.onMessage((message) => heard.push(message));
    links.push(link);
    return { stream, polls, heard };
  };

  // A relay that sends no beats (an older server): silence proves nothing, however long.
  const old = open();
  old.stream.say({ type: "peer", joined: true });
  await vi.advanceTimersByTimeAsync(10 * STREAM_QUIET_MS);
  expect(old.polls).toEqual([]);
  expect(old.stream.closed).toBe(false);

  // A relay that beats: every beat and every message pushes the wait back; the beat itself is not passed on.
  const live = open();
  live.stream.say({ type: "peer", joined: true });
  live.stream.say({ type: "beat" });
  await vi.advanceTimersByTimeAsync(STREAM_QUIET_MS - 1);
  live.stream.say({ type: "beat" });
  await vi.advanceTimersByTimeAsync(STREAM_QUIET_MS - 1);
  live.stream.say(start(1));
  await vi.advanceTimersByTimeAsync(STREAM_QUIET_MS - 1);
  expect(live.polls).toEqual([]);
  expect(live.heard).toEqual([{ type: "peer", joined: true }, start(1)]);
  // Then nothing: the stream is dead, and the link asks by polling instead.
  await vi.advanceTimersByTimeAsync(1);
  expect(live.stream.closed).toBe(true);
  expect(live.polls).toEqual(["http://relay/api/rooms/ABCD/poll?token=t&after=0"]);
});
