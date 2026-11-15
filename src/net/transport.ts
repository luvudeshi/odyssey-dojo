// Talks to the room relay in server/routes/rooms.ts: create, join, an event stream in (or long polling when the
// stream does not get through, as behind a Cloudflare quick tunnel), POSTs out, and a leave call when the member goes.
// The browser's fetch and EventSource are passed in, so tests run this with made-up ones.
import { parseMessage } from "./messages";
import type { NetMessage } from "./messages";

/** One member's line to the other member of the room. */
export interface RoomTransport {
  /** Resolves true when the relay passed it to the other member's open stream. Never rejects. */
  send(message: NetMessage): Promise<boolean>;
  /** Called for every well-formed message from the other member, and for the relay's "peer" messages. */
  onMessage(listener: (message: NetMessage) => void): void;
  /**
   * The member is leaving the room: stops the link and tells the relay (the leave call), so the other member hears
   * of it at once and a guest's seat is free at once. A guest's kept seat is forgotten with it.
   */
  close(): void;
}

/** The part of EventSource this uses. */
export interface EventStream {
  /** `lastEventId` is the message's number at this seat (what EventSource calls the event id); the relay's opening line has none. */
  onmessage: ((event: { data: unknown; lastEventId?: string }) => void) | null;
  /** Optional: when the stream reports an error the link moves to polling. */
  onerror?: (() => void) | null;
  close(): void;
}

export interface NetDeps {
  /** `keepalive` is set on the leave call only: the browser then finishes the request although the page has gone. */
  readonly fetch: (url: string, init: { method: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal; keepalive?: boolean }) => Promise<{
    readonly ok: boolean;
    readonly status: number;
    json(): Promise<unknown>;
  }>;
  readonly openStream: (url: string) => EventStream;
  /** How long a new stream has to deliver its first message before the link polls instead. Default STREAM_PROOF_MS. */
  readonly streamProofMs?: number;
  /** How long a stream that has sent a beat may then say nothing before the link polls instead. Default STREAM_QUIET_MS. */
  readonly streamQuietMs?: number;
  /** Never open the event stream: long polling from the start. Default: the build's VITE_ROOMS_POLL setting. */
  readonly pollOnly?: boolean;
  /**
   * The browser's navigator.sendBeacon: a POST that goes out although the page is closing, and whose answer nobody
   * reads. True when the browser took it. The leave call goes this way when it is given; a string body leaves as
   * text/plain, which the relay's leave route reads as JSON. Without it, or when it says no, deps.fetch is used
   * with keepalive.
   */
  readonly beacon?: (url: string, body: string) => boolean;
  /**
   * Calls `gone` when the page is being thrown away (the browser's "pagehide", not one that is only put aside to be
   * shown again) and returns what stops the watching. The link closes itself then, which sends the leave call.
   * For a host that is safe by the relay's rules: the host keeps its seat and token and the room stays.
   * For a guest it gives the seat up, also when the page is only being loaded again: the new page's kept token is
   * refused, joinRoomAgain forgets it and joins as new, with no wait because the seat is free. That costs a reload
   * nothing, and a guest who shuts the tab frees the seat and is reported at once, not 20 seconds later.
   * Without it only close() sends the leave call, and a guest's reload comes back on its kept token.
   */
  readonly onPageGone?: (gone: () => void) => () => void;
}

/**
 * Set to "1" in a build whose page reaches the relay through a proxy that keeps a stream open on the relay's side
 * after the browser has gone (Vercel's rewrite does). The relay then never sees a member leave: a guest who dropped
 * is refused its seat and a guest is not told the host left. Polls end on their own, so the relay's 20 s rule works.
 */
const BUILD_POLL_ONLY = (import.meta as { env?: Record<string, unknown> }).env?.VITE_ROOMS_POLL === "1";

/** The relay writes a line the moment a stream opens, so a stream that has said nothing after this long is not getting through. */
export const STREAM_PROOF_MS = 3_000;
/**
 * The relay puts a "beat" on every open stream each few seconds (HEARTBEAT_MS in server/routes/rooms.ts). A stream
 * that has sent one and then says nothing for this long has died without telling the page (a phone that left the
 * Wi-Fi, a laptop that slept), so the link polls instead. A relay that sends no beats is never judged this way.
 */
export const STREAM_QUIET_MS = 12_000;
/** The longest a POST to the relay may take. After it the request is given up and counts as unreachable. */
export const POST_TIMEOUT_MS = 8_000;
/** The wait after a poll fails before the next one. */
const POLL_RETRY_MS = 1_000;

export type RoomError = "unknown_room" | "room_full" | "too_many_rooms" | "slow_down" | "unreachable";

function field(value: unknown, name: string): string | null {
  if (typeof value !== "object" || value === null) return null;
  const found = (value as Record<string, unknown>)[name];
  return typeof found === "string" && found !== "" ? found : null;
}

async function post(deps: NetDeps, url: string, body?: unknown): Promise<{ status: number; data: unknown } | null> {
  try {
    const response = await deps.fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
      // A relay that takes the request and never answers would leave the room screen waiting for ever.
      signal: AbortSignal.timeout(POST_TIMEOUT_MS),
    });
    return { status: response.status, data: await response.json().catch(() => null) };
  } catch {
    return null;
  }
}

/** Letters only, upper case: what the host reads out and the guest types. */
export function cleanCode(text: string): string {
  return text.replace(/[^a-z]/gi, "").toUpperCase().slice(0, 8);
}

export async function createRoom(deps: NetDeps, base = ""): Promise<{ code: string; token: string } | RoomError> {
  const answer = await post(deps, `${base}/api/rooms`);
  if (!answer) return "unreachable";
  if (answer.status === 429) return "slow_down";
  if (answer.status === 503) return "too_many_rooms";
  const code = field(answer.data, "code");
  const token = field(answer.data, "token");
  return answer.status === 200 && code && token ? { code, token } : "unreachable";
}

export async function joinRoom(deps: NetDeps, code: string, base = ""): Promise<{ code: string; token: string } | RoomError> {
  const cleaned = cleanCode(code);
  if (cleaned === "") return "unknown_room";
  const answer = await post(deps, `${base}/api/rooms/${cleaned}/join`);
  if (!answer) return "unreachable";
  if (answer.status === 429) return "slow_down";
  if (answer.status === 404) return "unknown_room";
  if (answer.status === 409) return "room_full";
  const token = field(answer.data, "token");
  return answer.status === 200 && token ? guestSeat({ code: cleaned, token }, null) : "unreachable";
}

/** The part of sessionStorage used to keep a guest's seat for the tab. A private window may throw on any call. */
export interface SeatStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const SEAT_KEY = "odyssey.room.seat";

/**
 * The rooms joinRoom and joinRoomAgain handed out, each with the place its seat is kept (null: nowhere). openRoom
 * looks its room up here: only a guest's link may take a seat again after the relay gave the first one away, and
 * the new seat is kept in the same place. A host's room (from createRoom) is never in here.
 */
const guestSeats = new WeakMap<object, SeatStore | null>();

function guestSeat(room: { code: string; token: string }, store: SeatStore | null): { code: string; token: string } {
  guestSeats.set(room, store);
  return room;
}

function keepSeat(store: SeatStore | null, room: { code: string; token: string }): void {
  try {
    store?.setItem(SEAT_KEY, JSON.stringify({ code: room.code, token: room.token }));
  } catch {
    // No storage: this page joins as new next time.
  }
}

function forgetSeat(store: SeatStore): void {
  try {
    store.removeItem(SEAT_KEY);
  } catch {
    // Storage is closed to this page: there is nothing kept to forget.
  }
}

function keptSeat(store: SeatStore, code: string): string | null {
  try {
    const kept: unknown = JSON.parse(store.getItem(SEAT_KEY) ?? "null");
    return field(kept, "code") === code ? field(kept, "token") : null;
  } catch {
    return null;
  }
}

/**
 * joinRoom for a page that may have been in this room a moment ago (a reload, a phone that was locked). The seat it
 * was given is kept in `store` (the tab's sessionStorage). If the relay still takes that token, the page is back on
 * its own seat at once, where a fresh join would be refused as "room full" until the relay frees the seat 20 seconds
 * later. The check is an "ask" to the host, which also brings the start of a fight that is on. A token the relay no
 * longer takes is forgotten and the page joins as new.
 */
export async function joinRoomAgain(deps: NetDeps, code: string, store: SeatStore | null, base = ""): Promise<{ code: string; token: string } | RoomError> {
  const cleaned = cleanCode(code);
  const token = store === null || cleaned === "" ? null : keptSeat(store, cleaned);
  if (token !== null) {
    const answer = await post(deps, `${base}/api/rooms/${cleaned}/send`, { token, message: { type: "ask" } });
    if (!answer) return "unreachable";
    if (answer.status === 200) return guestSeat({ code: cleaned, token }, store);
    if (answer.status === 429) return "slow_down";
    try {
      store?.removeItem(SEAT_KEY);
    } catch {
      // Storage is closed to this page: there is nothing kept to forget.
    }
  }
  const room = await joinRoom(deps, cleaned, base);
  if (typeof room === "string") return room;
  keepSeat(store, room);
  return guestSeat(room, store);
}

/**
 * Opens the member's line to the other member. The event stream is tried first. When it says nothing for
 * deps.streamProofMs, or reports an error, the link switches to long polling for good: the next poll asks for
 * everything after the newest message number heard, so nothing is lost and nothing is heard twice.
 *
 * A guest's link (a room from joinRoom or joinRoomAgain) also gets back in after it was away for longer than the
 * relay holds a seat (AWAY_MS in server/lib/rooms.ts): when the relay no longer takes its token, it joins the room
 * again, keeps the new seat where the old one was kept, and carries on. The host is told the guest is here, which
 * makes it say again which fight is on. If the room is gone or the seat went to somebody else, the listeners hear
 * "peer: false" once, so the guest's screen says the host left and does not stand on a frozen frame.
 */
export function openRoom(deps: NetDeps, room: { code: string; token: string }, base = ""): RoomTransport {
  const listeners: ((message: NetMessage) => void)[] = [];
  const code = cleanCode(room.code);
  const path = `${base}/api/rooms/${code}`;
  const isGuest = guestSeats.has(room);
  const seatStore = guestSeats.get(room) ?? null;
  /** A guest's token changes when it takes a seat again. */
  let token = room.token;
  const query = (): string => `token=${encodeURIComponent(token)}`;
  /** The newest message number heard; the relay numbers each member's messages 1, 2, 3 and so on. */
  let last = 0;
  let peer: boolean | null = null;
  const state = { closed: false, polling: false };
  // A call, so the checks after an await are not narrowed to "still open".
  const isClosed = (): boolean => state.closed;
  let inFlight: AbortController | null = null;
  /** Set when the relay refused this guest's token and gave it no new seat: there is no seat left to give back. */
  let seatLost = false;
  /** Set while this guest is joining again (sitAgain): its old token is dead and it has no new one yet. */
  let sitting = false;

  /**
   * Tells the relay the holder of `seat` has gone. Nothing waits for the answer, and nothing is done about a failure:
   * the relay then finds out by itself, AWAY_MS after the last poll. Asked with keepalive, so it gets out of a page
   * that is closing. By the beacon when the page gave one.
   */
  const sayLeft = (seat: string): void => {
    const url = `${path}/leave`;
    const body = JSON.stringify({ token: seat });
    try {
      if (deps.beacon?.(url, body) === true) return;
    } catch {
      // No beacon after all: the request below.
    }
    try {
      // No Content-Type: a string then leaves as text/plain like a beacon's, which needs no preflight from another origin.
      void Promise.resolve(deps.fetch(url, { method: "POST", body, keepalive: true })).catch(() => undefined);
    } catch {
      // No way out to the relay: see above.
    }
  };

  const hear = (raw: unknown): void => {
    const message = parseMessage(raw);
    if (!message) return;
    if (message.type === "peer") peer = message.joined;
    for (const listener of listeners) listener(message);
  };

  /** Hears what a poll brought. False when the answer was not one. */
  const takePoll = (data: unknown): boolean => {
    if (typeof data !== "object" || data === null || !("messages" in data) || !Array.isArray(data.messages)) return false;
    for (const entry of data.messages as unknown[]) {
      if (typeof entry !== "object" || entry === null || !("seq" in entry) || typeof entry.seq !== "number" || entry.seq <= last) continue;
      last = entry.seq;
      hear("message" in entry ? entry.message : null);
    }
    if ("seq" in data && typeof data.seq === "number") last = Math.max(last, data.seq);
    // The relay says where the other member stands now; a peer message in the list may be older than that.
    if ("peer" in data && typeof data.peer === "boolean" && data.peer !== peer) hear({ type: "peer", joined: data.peer });
    return true;
  };

  /** Tells the listeners the host is not here, once: the room is gone, or this guest's seat went to somebody else. */
  const hostLost = (): void => {
    if (!isClosed() && peer !== false) hear({ type: "peer", joined: false });
  };

  /**
   * The relay gave this guest's seat away: joins the room again. True when the link has a seat and can go on. False
   * when the room is gone or full (the listeners are told the host is not here), or the link was closed meanwhile.
   */
  const sitAgain = async (): Promise<boolean> => {
    sitting = true;
    while (!isClosed()) {
      const seat = await joinRoom(deps, code, base);
      if (isClosed()) {
        // The link was closed while the join was on its way: the seat it brought is given straight back.
        if (typeof seat !== "string") sayLeft(seat.token);
        return false;
      }
      if (typeof seat !== "string") {
        token = seat.token;
        // A new seat's messages are numbered from 1 again, and where the host stands is not known yet.
        last = 0;
        peer = null;
        sitting = false;
        keepSeat(seatStore, seat);
        return true;
      }
      if (seat === "unknown_room" || seat === "room_full") {
        seatLost = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_RETRY_MS));
    }
    hostLost();
    return false;
  };

  const pollLoop = async (): Promise<void> => {
    while (!isClosed()) {
      const ask = new AbortController();
      inFlight = ask;
      let again = false;
      try {
        const response = await deps.fetch(`${path}/poll?${query()}&after=${String(last)}`, { method: "GET", signal: ask.signal });
        if (isClosed()) return;
        if (response.status === 404 || response.status === 401) {
          if (!isGuest) return;
          if (response.status === 404) {
            seatLost = true;
            hostLost();
            return;
          }
          if (!(await sitAgain())) return;
          continue;
        }
        const data = response.ok ? await response.json() : null;
        if (isClosed()) return;
        again = !takePoll(data);
      } catch {
        again = true;
      }
      if (again) await new Promise((resolve) => setTimeout(resolve, POLL_RETRY_MS));
    }
  };

  const pollOnly = deps.pollOnly ?? BUILD_POLL_ONLY;
  const stream: EventStream = pollOnly ? { onmessage: null, onerror: null, close() { /* never opened */ } } : deps.openStream(`${path}/events?${query()}`);
  /** Set once the relay has sent a beat on this stream; from then on a long silence means the stream is dead. */
  let beating = false;
  let quiet: ReturnType<typeof setTimeout> | undefined;
  const usePolling = (): void => {
    if (state.closed || state.polling) return;
    state.polling = true;
    clearTimeout(proof);
    clearTimeout(quiet);
    stream.onmessage = null;
    stream.onerror = null;
    // The poll is on its way before the stream is cut, so the relay never sees the member leave.
    void pollLoop();
    stream.close();
  };
  const proof = pollOnly ? undefined : setTimeout(usePolling, deps.streamProofMs ?? STREAM_PROOF_MS);
  if (pollOnly) {
    state.polling = true;
    void pollLoop();
  }
  stream.onerror = usePolling;
  stream.onmessage = (event) => {
    clearTimeout(proof);
    if (typeof event.data !== "string") return;
    let said: unknown;
    try {
      said = JSON.parse(event.data);
    } catch {
      // Not JSON: not ours.
      return;
    }
    const beat = field(said, "type") === "beat";
    if (beat) beating = true;
    if (beating) {
      clearTimeout(quiet);
      quiet = setTimeout(usePolling, deps.streamQuietMs ?? STREAM_QUIET_MS);
    }
    // The beat is the relay's own and carries no number: nothing for the listeners.
    if (beat) return;
    if (event.lastEventId !== undefined && /^\d+$/.test(event.lastEventId)) {
      const id = Number(event.lastEventId);
      if (id <= last) return;
      last = id;
    }
    hear(said);
  };
  /**
   * The leave call, once, for the seat this link holds now. A guest that took a seat again says it for the new seat
   * only: the old token is dead at the relay already, and the new seat is the one to give back. A guest whose token
   * the relay refused and who got no new seat (seatLost), or who is in the middle of taking one, has none to give back.
   */
  let saidLeft = false;
  const leave = (): void => {
    if (saidLeft) return;
    saidLeft = true;
    if (seatLost || sitting) return;
    sayLeft(token);
    // The token is dead at the relay now: forgotten, so the next page joins as new without first being refused.
    if (isGuest && seatStore !== null && keptSeat(seatStore, code) === token) forgetSeat(seatStore);
  };
  const close = (): void => {
    if (state.closed) return;
    state.closed = true;
    stopWatching?.();
    clearTimeout(proof);
    clearTimeout(quiet);
    stream.onmessage = null;
    stream.onerror = null;
    stream.close();
    inFlight?.abort();
    // After the poll is given up: the relay takes a host's next poll as the host being back.
    leave();
  };
  // The page is being thrown away: the link is closed and the other member is told now. Closed, not only a leave:
  // the relay ends the held poll, and the next poll would bring a host back and send a guest to join again.
  const stopWatching = deps.onPageGone?.(close);
  return {
    async send(message) {
      const answer = await post(deps, `${path}/send`, { token, message });
      // The relay no longer takes this guest's token: the poll loop finds that out too, and takes a seat again.
      if (answer?.status === 401 && isGuest) usePolling();
      return answer?.status === 200 && typeof answer.data === "object" && answer.data !== null && "delivered" in answer.data
        ? answer.data.delivered === true
        : false;
    },
    onMessage(listener) {
      listeners.push(listener);
    },
    close,
  };
}
