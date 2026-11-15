// Limits for the room relay, for when a tunnel lets the whole internet reach it (issue #155).
// All of it is in memory and runs on a clock the tests move. The send limit is per member and lives in ./rooms.
import type { IncomingHttpHeaders, Server } from "node:http";
import { isLoopback, lastHop, network, publicRooms, wasRelayed } from "./localOnly";
import { SENDS_PER_SECOND } from "./rooms";

export { network };

export const MINUTE_MS = 60_000;
/** Create and join carry no data, so their bodies are tiny. A send's limit is the message limit plus room for the token. */
export const SMALL_BODY_BYTES = 1024;
export const SEND_ENVELOPE_BYTES = 512;
export const CREATES_PER_MINUTE = 6;
export const MAX_ROOMS_PER_CLIENT = 3;
/**
 * With PUBLIC_ROOMS=1 strangers make rooms, so every room made by a caller that is not this machine also counts
 * against this one budget. However many addresses somebody has, they make no more rooms a minute than this.
 * Only a room that was made counts: a create that was refused spends nothing here.
 */
export const PUBLIC_CREATES_PER_MINUTE = 30;
/**
 * With PUBLIC_ROOMS=1 one caller can be a whole venue. The public page is on Vercel, which passes /api/ on, so the
 * server's proxy sees Vercel's address and everybody who came through it is one counting key. The laptop's caps
 * (6 rooms a minute, 3 rooms in use, 8 streams) would stop the fourth pair of players in a hall. So with the flag on
 * the caps for one key are sized for a hall, and the shared caps (PUBLIC_CREATES_PER_MINUTE, and MAX_ROOMS less
 * ROOMS_KEPT_FOR_THIS_MACHINE) are what really bound a stranger. One key still gets half of each shared cap at most,
 * so one address alone can neither use up the minute's rooms nor hold every room.
 */
export const HOSTED_CREATES_PER_MINUTE = PUBLIC_CREATES_PER_MINUTE / 2;
export const HOSTED_ROOMS_PER_CLIENT = 20;
/** Rooms no other caller can take, so the laptop that runs the server can always open one of its own. */
export const ROOMS_KEPT_FOR_THIS_MACHINE = 10;
/**
 * Guessing odds. A code is four of 23 letters: 23^4 = 279,841 codes, drawn with crypto.randomInt.
 * One address gets WRONG_CODES_PER_MINUTE wrong joins a minute, and as many wrong sends and streams, so 40 guesses a minute.
 * Against one open room that is a 1 in 7,000 chance a minute, about 58 hours on average to find it.
 * Against a full server of 50 rooms it is about 140 minutes to find any one of them.
 * A found code only lets a stranger take an empty guest seat: a room with two members gives nothing without a token (144 random bits).
 * The count is per IPv4 address or IPv6 /64, so somebody with many of those guesses that many times faster.
 */
export const WRONG_CODES_PER_MINUTE = 20;
export const MAX_STREAMS_PER_CLIENT = 8;
/** With PUBLIC_ROOMS=1: both seats of every room one key may hold. A stream needs a seat's token, so rooms bound streams anyway. */
export const HOSTED_STREAMS_PER_CLIENT = 2 * HOSTED_ROOMS_PER_CLIENT;
export const STREAMS_RETRY_S = 5;
/**
 * A poll loop starts a new poll as soon as the last one answers, and a poll answers at once when a message is waiting,
 * so a member that is sent SENDS_PER_SECOND messages a second polls about that often. Two such members share an
 * address behind one tunnel visitor or Wi-Fi, so an address gets room for two of them, plus a little. Only a runaway loop reaches this.
 */
export const POLLS_PER_SECOND = 2 * SENDS_PER_SECOND + 10;
/** With PUBLIC_ROOMS=1: the same room for two members, for every room one key may hold. */
export const HOSTED_POLLS_PER_SECOND = HOSTED_ROOMS_PER_CLIENT * POLLS_PER_SECOND;
/** A reader that lets this much pile up unread has stopped reading, and is cut off (routes/rooms.ts). */
export const MAX_STREAM_BACKLOG_BYTES = 1024 * 1024;
/** A request must arrive whole within this, headers within the shorter one, or Node closes it. An event stream is an answer, so it is not cut. */
export const REQUEST_TIMEOUT_MS = 30_000;
export const HEADERS_TIMEOUT_MS = 10_000;
/** Past this many counted clients the expired ones are dropped, and past ten times this everything is forgotten: memory stays bounded. */
const PRUNE_AT = 1_000;

/** The laptop's own browser, or anything else on it that sends no proxy header. */
export const THIS_MACHINE = "local";
/** Every caller that reaches this machine through a proxy other than Cloudflare's: they share one budget. */
export const RELAYED = "relayed";
/** The tunnel's far end writes this one itself, so a caller cannot choose it. */
const TUNNEL_HEADER = "cf-connecting-ip";
/** Headers other proxies add. The caller can write these too, so their value is never read. */
const PROXY_HEADERS = ["x-real-ip", "x-forwarded-for", "forwarded", "true-client-ip", "via"] as const;

/**
 * Who a request is counted against. A tunnel runs on this machine, so its requests arrive from loopback with the real
 * caller in a header. The header is only ever a counting key: it never makes a request local (see ./localOnly), and it
 * is ignored on a request from another device, which could put anything there to get a fresh budget.
 */
export function clientKey(socketAddress: string | undefined, headers: IncomingHttpHeaders, roomsArePublic = false): string {
  if (roomsArePublic) return publicKey(socketAddress, headers);
  const value = headers[TUNNEL_HEADER];
  const caller = (typeof value === "string" ? value : "").trim().slice(0, 64);
  if (isLoopback(socketAddress) && caller !== "") return `via ${network(caller)}`;
  if (!isLoopback(socketAddress)) return socketAddress === undefined ? "unknown" : network(socketAddress);
  return PROXY_HEADERS.some((name) => headers[name] !== undefined) ? RELAYED : THIS_MACHINE;
}

/**
 * The counting key with PUBLIC_ROOMS=1: the entry the server's own proxy wrote last in X-Forwarded-For (lastHop in ./localOnly).
 * Cf-Connecting-Ip is not read here. No tunnel runs on the hosted copy, and its proxy passes that header on as the
 * caller wrote it, so reading it would hand a fresh budget to anybody who makes up a value.
 * A request the guard calls passed on is never this machine, whichever header marked it: this machine is not
 * counted for rooms, and one X-Forwarded-Proto must not buy that.
 */
function publicKey(socketAddress: string | undefined, headers: IncomingHttpHeaders): string {
  const passedOn = lastHop(headers);
  if (passedOn !== null) return `via ${passedOn}`;
  if (!isLoopback(socketAddress)) return socketAddress === undefined ? "unknown" : network(socketAddress);
  return wasRelayed(headers) ? RELAYED : THIS_MACHINE;
}

/** Live rooms one caller may hold: MAX_ROOMS_PER_CLIENT, or HOSTED_ROOMS_PER_CLIENT with PUBLIC_ROOMS=1. */
export function roomsPerClient(roomsArePublic: boolean): number {
  return roomsArePublic ? HOSTED_ROOMS_PER_CLIENT : MAX_ROOMS_PER_CLIENT;
}

/** Shortens how long a request may take to arrive. The server's own check runs every 30 s, so a stalled one is closed 30 to 60 s after it began. */
export function limitSlowRequests(server: Server): Server {
  server.requestTimeout = REQUEST_TIMEOUT_MS;
  server.headersTimeout = HEADERS_TIMEOUT_MS;
  return server;
}

export interface Budget {
  /** Seconds until `key` may go again, or 0 when it still has budget. */
  readonly wait: (key: string) => number;
  readonly count: (key: string) => void;
}

/** At most `max` counts per key in a window that opens at the key's first count. */
export function createBudget(max: number, windowMs: number, now: () => number): Budget {
  const used = new Map<string, { readonly from: number; count: number }>();
  const open = (key: string): { readonly from: number; count: number } | null => {
    const found = used.get(key);
    return found !== undefined && now() - found.from < windowMs ? found : null;
  };
  return {
    wait: (key) => {
      const found = open(key);
      return found !== null && found.count >= max ? Math.max(1, Math.ceil((found.from + windowMs - now()) / 1000)) : 0;
    },
    count: (key) => {
      const found = open(key);
      if (found !== null) {
        found.count += 1;
        return;
      }
      if (used.size >= PRUNE_AT) for (const [other, window] of used) if (now() - window.from >= windowMs) used.delete(other);
      if (used.size >= PRUNE_AT * 10) used.clear();
      used.set(key, { from: now(), count: 1 });
    },
  };
}

export type RoomLimits = ReturnType<typeof createRoomLimits>;

export function createRoomLimits(now: () => number = Date.now, roomsArePublic: () => boolean = publicRooms) {
  // The flag does not change while the server runs, but it is asked each time, so each setting has its own budgets.
  const laptop = { creates: createBudget(CREATES_PER_MINUTE, MINUTE_MS, now), polls: createBudget(POLLS_PER_SECOND, 1_000, now), streams: MAX_STREAMS_PER_CLIENT };
  const hosted = { creates: createBudget(HOSTED_CREATES_PER_MINUTE, MINUTE_MS, now), polls: createBudget(HOSTED_POLLS_PER_SECOND, 1_000, now), streams: HOSTED_STREAMS_PER_CLIENT };
  const caps = (): typeof laptop => (roomsArePublic() ? hosted : laptop);
  const publicCreates = createBudget(PUBLIC_CREATES_PER_MINUTE, MINUTE_MS, now);
  const wrong = createBudget(WRONG_CODES_PER_MINUTE, MINUTE_MS, now);
  const streams = new Map<string, Map<string, number>>();
  let opened = 0;
  return {
    /**
     * Seconds `client` must wait before it creates another room; 0 lets it and counts it against the client. This machine is never
     * refused: the laptop running the demo must not be locked out of its own relay, and MAX_ROOMS still bounds it.
     * With public rooms on, every caller but this machine also shares one budget, which `made` counts.
     */
    create: (client: string): number => {
      if (client === THIS_MACHINE) return 0;
      const { creates } = caps();
      const wait = Math.max(roomsArePublic() ? publicCreates.wait("") : 0, creates.wait(client));
      if (wait === 0) creates.count(client);
      return wait;
    },
    /**
     * Says that `client` was given a room, which is what the shared budget counts. A create that was let through
     * here and then refused for another reason (the rooms are full) must not spend it, or people trying again
     * while the server is full would turn "full" into "too many requests" for everybody.
     */
    made: (client: string): void => { if (client !== THIS_MACHINE && roomsArePublic()) publicCreates.count(""); },
    /**
     * Wrong codes and wrong tokens, counted apart for joins ("join") and for sends and streams ("member"),
     * so a tab still talking to a room that is gone cannot use up its own budget for joining the next one.
     * This machine is not counted, as for creates: it is the laptop's own browser, and guessing its own code gains nothing.
     */
    wrongWait: (client: string, call: "join" | "member"): number => (client === THIS_MACHINE ? 0 : wrong.wait(`${call} ${client}`)),
    wrongCount: (client: string, call: "join" | "member"): void => { if (client !== THIS_MACHINE) wrong.count(`${call} ${client}`); },
    /** Seconds `client` must wait before it polls again; 0 lets it and counts it. */
    poll: (client: string): number => {
      const { polls } = caps();
      const wait = polls.wait(client);
      if (wait === 0) polls.count(client);
      return wait;
    },
    /**
     * Takes one of the client's stream places for `seat` (a room's code and a member's token) and returns how to give
     * it back, or null when the client has none left. A seat's newer stream replaces its older one, so it uses the
     * same place, and the place is given back when the newest stream closes.
     */
    openStream: (client: string, seat: string): (() => void) | null => {
      const held = streams.get(client) ?? new Map<string, number>();
      if (!held.has(seat) && held.size >= caps().streams) return null;
      opened += 1;
      const mine = opened;
      held.set(seat, mine);
      streams.set(client, held);
      return () => {
        if (held.get(seat) !== mine) return;
        held.delete(seat);
        if (held.size === 0 && streams.get(client) === held) streams.delete(client);
      };
    },
  };
}
