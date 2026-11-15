// The leave call from the page's side. Both links here only poll, as the hosted page does: a poll that stops says
// nothing to the relay, so without the leave call the other member would hear of it AWAY_MS (20 s) later at best.
// close() is the member leaving for good and sends it; a page that is only loaded again must not, or the seat its
// kept token stands for would be gone. The relay and every request are real.
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, test, vi } from "vitest";
import { NO_AI } from "../../server/ai/types";
import { createApp } from "../../server/app";
import type { Config } from "../../server/env";
import { AWAY_MS } from "../../server/lib/rooms";
import type { NetMessage } from "../../src/net/messages";
import { createRoom, joinRoom, joinRoomAgain, openRoom } from "../../src/net/transport";
import type { NetDeps, RoomTransport, SeatStore } from "../../src/net/transport";

const config: Config = {
  port: 0, geminiKey: null, elevenLabsKey: null, dataDir: "/nonexistent", publicBaseUrl: null, distDir: "/nonexistent",
  timeouts: { levelMs: 80, revealMs: 80, portraitMs: 80, speechMs: 80 },
};

let server: Server | null = null;
const links: RoomTransport[] = [];
const pages: Page[] = [];
afterEach(() => {
  vi.useRealTimers();
  for (const link of links.splice(0)) link.close();
  for (const page of pages.splice(0)) page.unplug();
  server?.close();
  server?.closeAllConnections();
  server = null;
});

async function serve(): Promise<string> {
  const listening = (await createApp({ config, ai: NO_AI })).listen(0, "127.0.0.1");
  await once(listening, "listening");
  server = listening;
  return `http://127.0.0.1:${String((listening.address() as AddressInfo).port)}`;
}

const realTimeout = setTimeout;
const realNow = Date.now.bind(Date);
/** Far below AWAY_MS: whatever is waited for here did not come from the relay's 20 second rule. */
const SOON_MS = 5_000;

async function until(what: string, done: () => boolean): Promise<void> {
  for (const start = realNow(); realNow() - start < SOON_MS; ) {
    if (done()) return;
    await new Promise((resolve) => realTimeout(resolve, 20));
  }
  if (done()) return;
  throw new Error(`timed out waiting for ${what}`);
}

const pause = (ms: number): Promise<void> => new Promise((resolve) => realTimeout(resolve, ms));
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

/** One browser page's way to the relay: real requests, a list of what it asked, and a plug the test can pull. */
interface Page {
  readonly deps: NetDeps;
  /** Every leave call this page made: the token in its body and whether it was asked with keepalive. */
  readonly leaves: { token: unknown; keepalive: boolean | undefined }[];
  readonly asked: string[];
  /** Cuts every request on its way and refuses new ones until `plug()`: a page that was thrown away, or a lost network. */
  unplug(): void;
  plug(): void;
  /** What the page's "pagehide" would call, when the link asked to be told. */
  pageGone: (() => void) | null;
  /** How many times the link stopped watching for the page going. */
  unwatched: number;
}

function page(watchPageGone = false): Page {
  let cut = new AbortController();
  let off = false;
  const made: Page = {
    leaves: [],
    asked: [],
    pageGone: null,
    unwatched: 0,
    unplug: () => { off = true; cut.abort(); },
    plug: () => { off = false; cut = new AbortController(); },
    deps: {
      pollOnly: true,
      openStream: () => { throw new Error("a poll-only link opened a stream"); },
      fetch: (url, init) => {
        made.asked.push(url);
        if (url.endsWith("/leave")) made.leaves.push({ token: (JSON.parse(init.body ?? "{}") as { token?: unknown }).token, keepalive: init.keepalive });
        if (off) return Promise.reject(new Error("unplugged"));
        const { signal, ...rest } = init;
        return fetch(url, { ...rest, signal: signal ? AbortSignal.any([signal, cut.signal]) : cut.signal });
      },
      ...(watchPageGone ? {
        onPageGone: (gone: () => void) => {
          made.pageGone = gone;
          return () => { made.unwatched += 1; };
        },
      } : {}),
    },
  };
  pages.push(made);
  return made;
}

interface Pair {
  readonly code: string;
  readonly host: RoomTransport;
  readonly guest: RoomTransport;
  readonly hostHeard: NetMessage[];
  readonly guestHeard: NetMessage[];
  readonly hostPage: Page;
  readonly guestPage: Page;
  readonly store: ReturnType<typeof memoryStore>;
}

/** A host and a guest in one room on the real relay, both polling, each told the other is here. */
async function pair(base: string, watchPageGone = false): Promise<Pair> {
  const hostPage = page(watchPageGone);
  const guestPage = page(watchPageGone);
  const room = await createRoom(hostPage.deps, base);
  if (typeof room === "string") throw new Error(room);
  const host = openRoom(hostPage.deps, room, base);
  const hostHeard: NetMessage[] = [];
  host.onMessage((message) => hostHeard.push(message));
  const store = memoryStore();
  const seat = await joinRoomAgain(guestPage.deps, room.code, store, base);
  if (typeof seat === "string") throw new Error(seat);
  const guest = openRoom(guestPage.deps, seat, base);
  const guestHeard: NetMessage[] = [];
  guest.onMessage((message) => guestHeard.push(message));
  links.push(host, guest);
  await until("the host hears the guest", () => peers(hostHeard).at(-1) === true);
  // A held poll is answered by a message, and the answer says where the host stands: the host says something.
  expect(await host.send({ type: "stop" })).toBe(true);
  await until("the guest hears the host", () => peers(guestHeard).at(-1) === true);
  return { code: room.code, host, guest, hostHeard, guestHeard, hostPage, guestPage, store };
}

/** A stranger's try at the guest seat: the join's answer. */
async function tryJoin(base: string, code: string): Promise<string> {
  const seat = await joinRoom(page().deps, code, base);
  return typeof seat === "string" ? seat : "joined";
}

test("a polling host that closes its link is reported to the guest at once, not 20 seconds later", async () => {
  const base = await serve();
  const room = await pair(base);
  const started = realNow();
  room.host.close();
  await until("the guest hears the host left", () => peers(room.guestHeard).at(-1) === false);
  expect(realNow() - started).toBeLessThan(SOON_MS);
  expect(room.hostPage.leaves.length).toBe(1);
  // Asked so that a closing page still gets it out.
  expect(room.hostPage.leaves[0]?.keepalive).toBe(true);
  // Closing twice says it once.
  room.host.close();
  expect(room.hostPage.leaves.length).toBe(1);
  // The room is closed with its host: nobody new walks into it.
  room.guest.close();
  await until("the guest's leave", () => room.guestPage.leaves.length === 1);
  await pause(100);
  expect(await tryJoin(base, room.code)).toBe("unknown_room");
});

test("a polling guest that closes its link frees its seat at once and the host is told", async () => {
  const base = await serve();
  const room = await pair(base);
  expect(await tryJoin(base, room.code)).toBe("room_full");
  room.guest.close();
  await until("the host hears the guest left", () => peers(room.hostHeard).at(-1) === false);
  expect(room.guestPage.leaves).toEqual([{ token: room.store.token(), keepalive: true }]);
  // No 409 while the relay waits out its 20 seconds: the seat is free now.
  expect(await tryJoin(base, room.code)).toBe("joined");
  expect(await tryJoin(base, room.code)).toBe("room_full");
  // The host heard: joined, left. Nothing came twice.
  expect(peers(room.hostHeard)).toEqual([true, false]);
});

test("a guest's page that is loaded again sends no leave call and is back on its own seat", async () => {
  const base = await serve();
  const room = await pair(base);
  const token = room.store.token();
  expect(token).not.toBeNull();
  // The page is thrown away: its requests die with it and close() is never called.
  room.guestPage.unplug();
  await pause(150);
  expect(room.guestPage.leaves).toEqual([]);

  // The new page has the tab's store and nothing else.
  const again = page();
  const seat = await joinRoomAgain(again.deps, room.code, room.store, base);
  if (typeof seat === "string") throw new Error(seat);
  expect(seat.token).toBe(token);
  expect(again.asked.some((url) => url.endsWith("/join"))).toBe(false);
  const link = openRoom(again.deps, seat, base);
  links.push(link);
  const heard: NetMessage[] = [];
  link.onMessage((message) => heard.push(message));
  await until("the host is here for the new page", () => peers(heard).at(-1) === true);
  expect(await link.send({ type: "strike", move: "jab", quality: 0.7 })).toBe(true);
  await until("the strike", () => room.hostHeard.some((message) => message.type === "strike"));
});

test("only a host's link watches for the page going; told so, it sends the leave call once and close() adds nothing", async () => {
  const base = await serve();
  const room = await pair(base, true);
  // A guest's page that goes may be a reload, so its link did not ask to be told.
  expect(room.guestPage.pageGone).toBeNull();
  expect(room.hostPage.pageGone).not.toBeNull();
  room.hostPage.pageGone?.();
  await until("the guest hears the host left", () => peers(room.guestHeard).at(-1) === false);
  room.hostPage.pageGone?.();
  room.host.close();
  expect(room.hostPage.leaves.length).toBe(1);
  expect(room.hostPage.unwatched).toBe(1);
});

test("a guest that took a seat again leaves with its new token only, and one whose seat is lost sends nothing", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const base = await serve();
  const room = await pair(base);
  const first = room.store.token();

  // The guest's network goes for longer than the relay holds a seat.
  room.guestPage.unplug();
  await pause(100);
  vi.setSystemTime(Date.now() + AWAY_MS + 1);
  // Any call makes the relay look at its seats.
  expect(await room.host.send({ type: "stop" })).toBe(false);
  await until("the host hears the guest went", () => peers(room.hostHeard).at(-1) === false);
  // The network is back: the relay refuses the old token and the link joins again by itself.
  room.guestPage.plug();
  await until("the host hears the guest is back", () => peers(room.hostHeard).at(-1) === true);
  const second = room.store.token();
  expect(second).not.toBe(first);
  expect(room.guestPage.leaves).toEqual([]);

  room.guest.close();
  await until("the host hears the guest left", () => peers(room.hostHeard).at(-1) === false);
  // One leave, for the seat it holds now; the dead token is never sent.
  expect(room.guestPage.leaves).toEqual([{ token: second, keepalive: true }]);
  expect(await tryJoin(base, room.code)).toBe("joined");

  // A second guest loses its seat to a stranger while it is away: it is told the host is gone and has no seat to give back.
  const other = await pair(base);
  other.guestPage.unplug();
  await pause(100);
  vi.setSystemTime(Date.now() + AWAY_MS + 1);
  expect(await other.host.send({ type: "stop" })).toBe(false);
  expect(await tryJoin(base, other.code)).toBe("joined");
  other.guestPage.plug();
  await until("the guest is told", () => peers(other.guestHeard).at(-1) === false);
  other.guest.close();
  await pause(100);
  expect(other.guestPage.leaves).toEqual([]);
  // The stranger's seat stands.
  expect(await tryJoin(base, other.code)).toBe("room_full");
});
