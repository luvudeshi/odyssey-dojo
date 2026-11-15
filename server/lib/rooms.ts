// Online rooms, in memory only: a host and one guest pass JSON messages to each other through the server.
// Nothing here reads a message. What the two browsers say to each other is their own contract (issue #29).
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const MAX_ROOMS = 50;
/**
 * A room is removed IDLE_MS after its last call: create, join, a stream opening, a poll starting, or a send that was let through.
 * An open stream alone does not keep a room alive, and neither does the server's heartbeat on it: a tab left open
 * overnight holds a stream, and a heartbeat is the server talking, not a player. Two connected players between
 * fights send nothing, so IDLE_MS is how long that pause may last; the next fight's first message starts it again.
 * A client that wants a quiet room kept longer sends any small message now and then: every send that gets through counts.
 * A poll loop starts a poll every 20 seconds or faster, so a tab left polling does keep its room alive.
 */
export const IDLE_MS = 30 * 60_000;
export const MAX_MESSAGE_BYTES = 16 * 1024;
/** The host sends state about 15 times a second, and a frame with an event goes out at once: 60 a second at worst. This leaves room. */
export const SENDS_PER_SECOND = 120;
const SEND_WINDOW_MS = 1_000;
/**
 * Every message delivered to a seat is numbered, and the newest BACKLOG_MESSAGES are kept, so a client that polls (or
 * switches from the stream to polling) can ask for "everything after N". The host sends about 15 states a second and
 * the send limit is 120 a second, so 256 covers 2 to 17 seconds of play, far more than the gap between two polls.
 * It also bounds memory: 256 messages of at most MAX_MESSAGE_BYTES is 4 MB at worst per seat.
 * That only holds because the backlog keeps each message as its JSON text and reads it back when a poll answers.
 * Kept as the objects they parse to, 16 KB of "[],[],[]..." or "{},{},{}..." took 50 to 85 MB a seat, and a dozen
 * such rooms ran a server with a 1 GB heap out of memory.
 */
export const BACKLOG_MESSAGES = 256;
/** A long poll that finds nothing new answers with an empty list after this long. */
export const POLL_HOLD_MS = 20_000;
/**
 * A member with no stream open and no poll for this long has gone: the other member is told, and a guest's seat is
 * given back so a new guest can join. A reconnect with the same token inside this time keeps the seat. The host's seat is never given back.
 */
export const AWAY_MS = 20_000;
/** No I, L or O: a code read aloud or off a screen cannot be mistyped. 23^4 = 279,841 codes; ./roomLimits has the guessing odds. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 4;

export type RelayMessage = Readonly<Record<string, unknown>>;
export interface Listener {
  /** `seq` is the message's number at this seat; a stream sends it as the event id. */
  readonly message: (message: RelayMessage, seq: number) => void;
  /** The room is gone, or this member opened a newer stream. */
  readonly end: () => void;
}
export interface Attached { readonly peerJoined: boolean; readonly detach: () => void }
export interface PollResult {
  /** The newest number delivered to this seat so far. */
  readonly seq: number;
  readonly messages: readonly { readonly seq: number; readonly message: RelayMessage }[];
  /** Whether the other member is connected now. */
  readonly peer: boolean;
}
/** `stop(true)` answers a held poll with an empty list now; `stop(false)` only lets it go, for a client that hung up. */
export interface Polling { readonly stop: (answer: boolean) => void }
export type Refusal = "unknown" | "denied";
export type RoomStore = ReturnType<typeof createRoomStore>;

interface Poll { readonly after: number; readonly reply: (result: PollResult) => void; readonly result: () => PollResult }
interface Member {
  readonly token: string;
  listener: Listener | null;
  poll: Poll | null;
  /** Whether the other member has been told this one is connected. */
  here: boolean;
  /** When this member last opened, closed or finished a stream or a poll. */
  seenMs: number;
  seq: number;
  /** Each message as its JSON text: see BACKLOG_MESSAGES. */
  readonly backlog: { readonly seq: number; readonly text: string }[];
  sendsFromMs: number;
  sends: number;
  /** Set when this member said it is leaving (the leave call). Only the host's seat is kept after that, closed. */
  left: boolean;
}
interface Room {
  readonly owner: string;
  readonly host: Member;
  guest: Member | null;
  activeMs: number;
  /** The token of the guest who last left by the leave call, so the same call made twice is answered the same way. */
  leftGuest: string | null;
}
interface Seat { readonly room: Room; readonly self: Member; readonly other: () => Member | null }

/** The one message the relay itself sends: whether the other member is connected. */
export function peerEvent(joined: boolean): RelayMessage {
  return { type: "peer", joined };
}

export function isRelayMessage(value: unknown): value is RelayMessage {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Compares digests, so the time taken says nothing about the token or its length. */
function sameToken(given: string, held: string): boolean {
  const digest = (text: string): Buffer => createHash("sha256").update(text).digest();
  return timingSafeEqual(digest(given), digest(held));
}

function newMember(nowMs: number): Member {
  return { token: randomBytes(18).toString("base64url"), listener: null, poll: null, here: false, seenMs: nowMs, seq: 0, backlog: [], sendsFromMs: 0, sends: 0, left: false };
}

export function createRoomStore(now: () => number = Date.now) {
  const rooms = new Map<string, Room>();

  /** Numbers a message for `member`, keeps it in the backlog, and hands it to the open stream and the held poll, if any. */
  const deliver = (member: Member, message: RelayMessage): void => {
    member.seq += 1;
    member.backlog.push({ seq: member.seq, text: JSON.stringify(message) });
    if (member.backlog.length > BACKLOG_MESSAGES) member.backlog.shift();
    member.listener?.message(message, member.seq);
    const waiting = member.poll;
    if (waiting === null || member.seq <= waiting.after) return;
    member.poll = null;
    waiting.reply(waiting.result());
  };

  const gone = (member: Member): boolean => member.listener === null && member.poll === null && now() - member.seenMs >= AWAY_MS;

  /**
   * Removes rooms idle for IDLE_MS and ends their streams and polls. In the others, a member away for AWAY_MS is
   * announced to the other one, and a guest away that long loses the seat. Every other call sweeps first.
   */
  const sweep = (): void => {
    for (const [code, room] of rooms) {
      if (now() - room.activeMs < IDLE_MS) {
        if (room.host.here && gone(room.host)) {
          room.host.here = false;
          if (room.guest !== null) deliver(room.guest, peerEvent(false));
        }
        if (room.guest !== null && gone(room.guest)) {
          const guest = room.guest;
          // The seat is emptied before the host is told, so a held poll this answers says the guest is not here.
          room.guest = null;
          if (guest.here) deliver(room.host, peerEvent(false));
        }
        continue;
      }
      rooms.delete(code);
      // The seats are emptied first, so a stream that detaches as it ends finds nobody to tell.
      const members = [room.host, room.guest].flatMap((member) => member ?? []);
      const open = members.flatMap((member) => member.listener ?? []);
      const held = members.flatMap((member) => member.poll ?? []);
      for (const member of members) {
        member.listener = null;
        member.poll = null;
      }
      for (const listener of open) listener.end();
      for (const poll of held) poll.reply(poll.result());
    }
  };

  /** The caller's seat and the other one, which is empty until a guest joins. Codes are matched without regard to case. */
  const seat = (code: string, token: string): Seat | Refusal => {
    sweep();
    const room = rooms.get(code.toUpperCase());
    if (room === undefined) return "unknown";
    // A host who left has closed its seat: a poll of its that was still on the way must not bring it back.
    if (sameToken(token, room.host.token)) return room.host.left ? "denied" : { room, self: room.host, other: () => room.guest };
    if (room.guest !== null && sameToken(token, room.guest.token)) return { room, self: room.guest, other: () => room.host };
    return "denied";
  };

  /** The caller is connected now (a stream opened or a poll began): the other member hears of it the first time. */
  const arrive = ({ self, other }: Seat): void => {
    self.seenMs = now();
    if (self.here) return;
    self.here = true;
    const peer = other();
    if (peer !== null) deliver(peer, peerEvent(true));
  };

  /** Ends the member's stream and answers its held poll: it has said it is going, so nothing more is coming for it. */
  const hangUp = (member: Member): void => {
    const stream = member.listener;
    const held = member.poll;
    // Emptied first, so the stream's detach and the poll's stop find nothing left to undo.
    member.listener = null;
    member.poll = null;
    stream?.end();
    held?.reply(held.result());
  };

  /** Nobody is connected to the room, and it was last used `graceMs` ago or longer. */
  const leftBehind = (room: Room, graceMs: number): boolean => !room.host.here && room.guest?.here !== true && now() - room.activeMs >= graceMs;

  return {
    sweep,
    size: (): number => rooms.size,
    /** How many live rooms `owner` created. */
    heldBy: (owner: string): number => {
      sweep();
      return [...rooms.values()].filter((room) => room.owner === owner).length;
    },
    /**
     * For an owner at its cap. Removes the one of its rooms that nobody is connected to and was used longest ago (a host
     * who pressed Back leaves one behind) and returns 0. When somebody is connected to every one, nothing is removed
     * and the answer is the seconds until the first of them would expire.
     * With `graceMs`, a room used more recently than that is left alone as well: where many people are one owner
     * (PUBLIC_ROOMS=1), a room made a moment ago belongs to a host whose page has not connected yet.
     */
    freeOne: (owner: string, graceMs = 0): number => {
      sweep();
      const held = [...rooms].filter(([, room]) => room.owner === owner).sort(([, a], [, b]) => a.activeMs - b.activeMs);
      const empty = held.find(([, room]) => leftBehind(room, graceMs));
      if (empty !== undefined) rooms.delete(empty[0]);
      const oldest = held[0];
      return empty !== undefined || oldest === undefined ? 0 : Math.max(1, Math.ceil((oldest[1].activeMs + IDLE_MS - now()) / 1000));
    },
    /**
     * For when every room that callers other than `except` may hold is taken (PUBLIC_ROOMS=1). Removes the one of their
     * rooms that nobody is connected to and that was used longest ago, at least `graceMs` ago, and says whether it found one.
     * Without this, rooms that strangers made and left would keep new hosts out for IDLE_MS.
     */
    freeOther: (except: string, graceMs: number): boolean => {
      sweep();
      const empty = [...rooms].filter(([, room]) => room.owner !== except && leftBehind(room, graceMs)).sort(([, a], [, b]) => a.activeMs - b.activeMs)[0];
      if (empty !== undefined) rooms.delete(empty[0]);
      return empty !== undefined;
    },
    /** A new room and its host token, or null when the server already holds MAX_ROOMS. `owner` is who it counts against. */
    create: (owner = ""): { code: string; token: string } | null => {
      sweep();
      if (rooms.size >= MAX_ROOMS) return null;
      let code = "";
      do {
        code = Array.from({ length: CODE_LENGTH }, () => ALPHABET.charAt(randomInt(ALPHABET.length))).join("");
      } while (rooms.has(code));
      const host = newMember(now());
      rooms.set(code, { owner, host, guest: null, activeMs: now(), leftGuest: null });
      return { code, token: host.token };
    },
    join: (code: string): { token: string } | "unknown" | "full" => {
      sweep();
      const room = rooms.get(code.toUpperCase());
      // A room its host closed takes nobody: a friend who walked in would wait for a host who cannot come back.
      if (room === undefined || room.host.left) return "unknown";
      if (room.guest !== null) return "full";
      room.guest = newMember(now());
      room.activeMs = now();
      return { token: room.guest.token };
    },
    /** Starts delivering the other member's messages to `listener`. A member has one stream: a newer one replaces the older. */
    attach: (code: string, token: string, listener: Listener): Attached | Refusal => {
      const found = seat(code, token);
      if (typeof found === "string") return found;
      const { room, self, other } = found;
      const older = self.listener;
      self.listener = listener;
      room.activeMs = now();
      arrive(found);
      older?.end();
      return {
        peerJoined: other()?.here === true,
        detach: () => {
          // A stream that was replaced, or whose room expired, has nothing left to undo.
          if (self.listener !== listener) return;
          self.listener = null;
          self.seenMs = now();
          // A client that moved from the stream to polling is still here.
          if (self.poll !== null || !self.here) return;
          self.here = false;
          const peer = other();
          if (peer !== null) deliver(peer, peerEvent(false));
        },
      };
    },
    /**
     * Answers `reply` with the messages after number `after` at once when there are any; otherwise holds it until one
     * arrives, `stop(true)` is called (the route's timer) or the room is removed. A member has one poll: a newer one
     * answers the older with an empty list. A poll closes the member's stream, which a client only does once it has
     * given up on it. Counts as use of the room, and as the member being here.
     */
    poll: (code: string, token: string, after: number, reply: (result: PollResult) => void): Polling | Refusal => {
      const found = seat(code, token);
      if (typeof found === "string") return found;
      const { room, self, other } = found;
      const from = Math.min(after, self.seq);
      const result = (): PollResult => ({
        seq: self.seq,
        messages: self.backlog.filter((entry) => entry.seq > from).map((entry) => ({ seq: entry.seq, message: JSON.parse(entry.text) as RelayMessage })),
        peer: other()?.here === true,
      });
      room.activeMs = now();
      const stream = self.listener;
      self.listener = null;
      stream?.end();
      arrive(found);
      const older = self.poll;
      self.poll = null;
      older?.reply(older.result());
      if (self.seq > from) {
        reply(result());
        return { stop: () => undefined };
      }
      const waiting: Poll = { after: from, reply, result };
      self.poll = waiting;
      return {
        stop: (answer) => {
          if (self.poll !== waiting) return;
          self.poll = null;
          self.seenMs = now();
          if (answer) reply(result());
        },
      };
    },
    /**
     * The member says it is going, so nobody has to wait AWAY_MS to find out (a proxy in front of the server can hide
     * a stream closing, and a poll says nothing when it stops). The other member is told at once, as when a stream closes.
     * The host's seat is closed for good: its token is refused from then on, except by this call, and the room takes
     * no new guest. A guest's seat is given back at once, so the code takes a new guest. Made twice with the same
     * token it changes nothing the second time. Not counted as use of the room.
     */
    leave: (code: string, token: string): "left" | Refusal => {
      sweep();
      const room = rooms.get(code.toUpperCase());
      if (room === undefined) return "unknown";
      if (sameToken(token, room.host.token)) {
        const host = room.host;
        if (host.left) return "left";
        host.left = true;
        hangUp(host);
        host.seenMs = now();
        const wasHere = host.here;
        // Before the guest is told, so a poll this answers says the host is not here.
        host.here = false;
        if (wasHere && room.guest !== null) deliver(room.guest, peerEvent(false));
        return "left";
      }
      const guest = room.guest;
      if (guest !== null && sameToken(token, guest.token)) {
        room.guest = null;
        room.leftGuest = guest.token;
        hangUp(guest);
        if (guest.here) deliver(room.host, peerEvent(false));
        return "left";
      }
      return room.leftGuest !== null && sameToken(token, room.leftGuest) ? "left" : "denied";
    },
    /**
     * A message sent while the other member is not connected is "dropped": it is kept for a poll to read, but the sender is told nobody got it.
     * A member's sends past SENDS_PER_SECOND are "slow": they reach nobody and do not count as use of the room.
     */
    send: (code: string, token: string, message: RelayMessage): "sent" | "dropped" | "slow" | Refusal => {
      const found = seat(code, token);
      if (typeof found === "string") return found;
      const { self } = found;
      if (now() - self.sendsFromMs >= SEND_WINDOW_MS) {
        self.sendsFromMs = now();
        self.sends = 0;
      }
      if (self.sends >= SENDS_PER_SECOND) return "slow";
      self.sends += 1;
      found.room.activeMs = now();
      const target = found.other();
      if (target === null) return "dropped";
      deliver(target, message);
      return target.here ? "sent" : "dropped";
    },
  };
}
