// Limits for the room relay, for when a tunnel lets the whole internet reach it (issue #155).
// All of it is in memory and runs on a clock the tests move. The send limit is per member and lives in ./rooms.
import type { IncomingHttpHeaders, Server } from "node:http";
import { isIP } from "node:net";
import { isLoopback, publicRooms } from "./localOnly";
import { SENDS_PER_SECOND } from "./rooms";

export const MINUTE_MS = 60_000;
/** Create and join carry no data, so their bodies are tiny. A send's limit is the message limit plus room for the token. */
export const SMALL_BODY_BYTES = 1024;
export const SEND_ENVELOPE_BYTES = 512;
export const CREATES_PER_MINUTE = 6;
export const MAX_ROOMS_PER_CLIENT = 3;
/**
 * With PUBLIC_ROOMS=1 strangers make rooms, so every room made by a caller that is not this machine also counts
 * against this one budget. However many addresses somebody has, they make no more rooms a minute than this.
 */
export const PUBLIC_CREATES_PER_MINUTE = 30;
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
export const STREAMS_RETRY_S = 5;
/**
 * A poll loop starts a new poll as soon as the last one answers, and a poll answers at once when a message is waiting,
 * so a member that is sent SENDS_PER_SECOND messages a second polls about that often. Two such members share an
 * address behind one tunnel visitor or Wi-Fi, so an address gets room for two of them, plus a little. Only a runaway loop reaches this.
 */
export const POLLS_PER_SECOND = 2 * SENDS_PER_SECOND + 10;
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
 * The network an address counts as. One home or phone is given a whole IPv6 /64 and can use any address in it,
 * so an IPv6 address is cut to its first four groups. An IPv4 address is kept whole.
 */
export function network(address: string): string {
  const plain = (address.split("%")[0] ?? "").toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(plain);
  if (mapped !== null) return mapped[1] ?? plain;
  if (!plain.includes(":")) return plain;
  const [head = "", tail] = plain.split("::");
  const groups = head === "" ? [] : head.split(":");
  const end = tail === undefined || tail === "" ? [] : tail.split(":");
  if (tail !== undefined) while (groups.length + end.length < 8) groups.push("0");
  return `${[...groups, ...end].slice(0, 4).map((group) => group.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

/**
 * Who a request is counted against. A tunnel runs on this machine, so its requests arrive from loopback with the real
 * caller in a header. The header is only ever a counting key: it never makes a request local (see ./localOnly), and it
 * is ignored on a request from another device, which could put anything there to get a fresh budget.
 */
export function clientKey(socketAddress: string | undefined, headers: IncomingHttpHeaders, roomsArePublic = false): string {
  const value = headers[TUNNEL_HEADER];
  const caller = (typeof value === "string" ? value : "").trim().slice(0, 64);
  if (isLoopback(socketAddress) && caller !== "") return `via ${network(caller)}`;
  const passedOn = roomsArePublic ? lastHop(headers) : null;
  if (passedOn !== null) return `via ${passedOn}`;
  if (!isLoopback(socketAddress)) return socketAddress === undefined ? "unknown" : network(socketAddress);
  return PROXY_HEADERS.some((name) => headers[name] !== undefined) ? RELAYED : THIS_MACHINE;
}

/**
 * With PUBLIC_ROOMS=1 the server sits behind its own proxy (Caddy in deploy/vultr), and every request reaches it from
 * that proxy's one address. The proxy writes the address it took the request from as the last entry of
 * X-Forwarded-For, so that entry is the counting key: one budget per caller, not one for the whole internet.
 * Only the last entry is read. The ones before it are whatever the caller sent. Null when it is not an address.
 * It is only ever a counting key, as above. A server that callers reach with no proxy in between must not set
 * PUBLIC_ROOMS: there a caller writes this header itself, and only PUBLIC_CREATES_PER_MINUTE and MAX_ROOMS hold it.
 */
function lastHop(headers: IncomingHttpHeaders): string | null {
  const value = headers["x-forwarded-for"];
  const last = (typeof value === "string" ? value : "").split(",").pop()?.trim() ?? "";
  return last.length <= 64 && isIP(last) !== 0 ? network(last) : null;
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
  const creates = createBudget(CREATES_PER_MINUTE, MINUTE_MS, now);
  const publicCreates = createBudget(PUBLIC_CREATES_PER_MINUTE, MINUTE_MS, now);
  const wrong = createBudget(WRONG_CODES_PER_MINUTE, MINUTE_MS, now);
  const polls = createBudget(POLLS_PER_SECOND, 1_000, now);
  const streams = new Map<string, Map<string, number>>();
  let opened = 0;
  return {
    /**
     * Seconds `client` must wait before it creates another room; 0 lets it and counts it. This machine is never
     * refused: the laptop running the demo must not be locked out of its own relay, and MAX_ROOMS still bounds it.
     */
    create: (client: string): number => {
      if (client === THIS_MACHINE) return 0;
      // With public rooms on, every caller but this machine also shares one budget.
      const shared = roomsArePublic();
      const wait = Math.max(shared ? publicCreates.wait("") : 0, creates.wait(client));
      if (wait === 0) {
        creates.count(client);
        if (shared) publicCreates.count("");
      }
      return wait;
    },
    /**
     * Wrong codes and wrong tokens, counted apart for joins ("join") and for sends and streams ("member"),
     * so a tab still talking to a room that is gone cannot use up its own budget for joining the next one.
     * This machine is not counted, as for creates: it is the laptop's own browser, and guessing its own code gains nothing.
     */
    wrongWait: (client: string, call: "join" | "member"): number => (client === THIS_MACHINE ? 0 : wrong.wait(`${call} ${client}`)),
    wrongCount: (client: string, call: "join" | "member"): void => { if (client !== THIS_MACHINE) wrong.count(`${call} ${client}`); },
    /** Seconds `client` must wait before it polls again; 0 lets it and counts it. */
    poll: (client: string): number => {
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
      if (!held.has(seat) && held.size >= MAX_STREAMS_PER_CLIENT) return null;
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
