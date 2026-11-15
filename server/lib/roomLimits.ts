// Limits for the room relay, for when a tunnel lets the whole internet reach it (issue #155).
// All of it is in memory and runs on a clock the tests move. The send limit is per member and lives in ./rooms.
import type { IncomingHttpHeaders } from "node:http";
import { isLoopback } from "./localOnly";

export const MINUTE_MS = 60_000;
/** Create and join carry no data, so their bodies are tiny. A send's limit is the message limit plus room for the token. */
export const SMALL_BODY_BYTES = 1024;
export const SEND_ENVELOPE_BYTES = 512;
export const CREATES_PER_MINUTE = 6;
export const MAX_ROOMS_PER_CLIENT = 3;
/** How long a client holding MAX_ROOMS_PER_CLIENT rooms is told to wait. A room it leaves alone is gone after IDLE_MS. */
export const ROOMS_HELD_RETRY_S = 60;
/**
 * Guessing odds. A code is four of 23 letters: 23^4 = 279,841 codes, drawn with crypto.randomInt.
 * One address gets WRONG_CODES_PER_MINUTE wrong joins a minute, and as many wrong sends and streams, so 40 guesses a minute.
 * Against one open room that is a 1 in 7,000 chance a minute, about 58 hours on average to find it.
 * Against a full server of 50 rooms it is about 140 minutes to find any one of them.
 * A found code only lets a stranger take an empty guest seat: a room with two members gives nothing without a token (144 random bits).
 * The count is per address, so somebody with many addresses guesses that many times faster.
 */
export const WRONG_CODES_PER_MINUTE = 20;
export const MAX_STREAMS_PER_CLIENT = 8;
export const STREAMS_RETRY_S = 5;
/** Past this many counted clients the expired ones are dropped, and past ten times this everything is forgotten: memory stays bounded. */
const PRUNE_AT = 1_000;

/** The laptop's own browser, or anything else on it that sends no tunnel header. */
export const THIS_MACHINE = "local";
/** Set by the tunnel's far end, in the order they are believed. Cloudflare overwrites the first, so a caller cannot choose it. */
const TUNNEL_HEADERS = ["cf-connecting-ip", "x-real-ip", "x-forwarded-for"] as const;

/**
 * Who a request is counted against. A tunnel runs on this machine, so its requests arrive from loopback with the real
 * caller in a header. The header is only ever a counting key: it never makes a request local (see ./localOnly), and it
 * is ignored on a request from another device, which could put anything there to get a fresh budget.
 */
export function clientKey(socketAddress: string | undefined, headers: IncomingHttpHeaders): string {
  if (!isLoopback(socketAddress)) return socketAddress ?? "unknown";
  for (const name of TUNNEL_HEADERS) {
    const value = headers[name];
    // In a list, the last entry is the one the nearest proxy wrote; the caller can make up the earlier ones.
    const last = (typeof value === "string" ? value : "").split(",").at(-1)?.trim() ?? "";
    if (last !== "") return `via ${last.slice(0, 64)}`;
  }
  return THIS_MACHINE;
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

export function createRoomLimits(now: () => number = Date.now) {
  const creates = createBudget(CREATES_PER_MINUTE, MINUTE_MS, now);
  const wrong = createBudget(WRONG_CODES_PER_MINUTE, MINUTE_MS, now);
  const streams = new Map<string, number>();
  return {
    /**
     * Seconds `client`, which holds `held` live rooms, must wait before it creates another; 0 lets it and counts it.
     * This machine is never refused: the laptop running the demo must not be locked out of its own relay, and
     * MAX_ROOMS still bounds it.
     */
    create: (client: string, held: number): number => {
      if (client === THIS_MACHINE) return 0;
      if (held >= MAX_ROOMS_PER_CLIENT) return ROOMS_HELD_RETRY_S;
      const wait = creates.wait(client);
      if (wait === 0) creates.count(client);
      return wait;
    },
    /**
     * Wrong codes and wrong tokens, counted apart for joins ("join") and for sends and streams ("member"),
     * so a tab still talking to a room that is gone cannot use up its own budget for joining the next one.
     */
    wrongWait: (client: string, call: "join" | "member"): number => wrong.wait(`${call} ${client}`),
    wrongCount: (client: string, call: "join" | "member"): void => { wrong.count(`${call} ${client}`); },
    /** Takes one of the client's stream places and returns how to give it back, or null when it has none left. */
    openStream: (client: string): (() => void) | null => {
      const held = streams.get(client) ?? 0;
      if (held >= MAX_STREAMS_PER_CLIENT) return null;
      streams.set(client, held + 1);
      let given = false;
      return () => {
        if (given) return;
        given = true;
        const left = (streams.get(client) ?? 1) - 1;
        if (left > 0) streams.set(client, left);
        else streams.delete(client);
      };
    },
  };
}
