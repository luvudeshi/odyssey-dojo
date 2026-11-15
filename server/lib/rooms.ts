// Online rooms, in memory only: a host and one guest pass JSON messages to each other through the server.
// Nothing here reads a message. What the two browsers say to each other is their own contract (issue #29).
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const MAX_ROOMS = 50;
/**
 * A room is removed IDLE_MS after its last call: create, join, a stream opening, or a send that was let through.
 * An open stream alone does not keep a room alive, and neither does the server's heartbeat on it: a tab left open
 * overnight holds a stream, and a heartbeat is the server talking, not a player. Two connected players between
 * fights send nothing, so IDLE_MS is how long that pause may last; the next fight's first message starts it again.
 * A client that wants a quiet room kept longer sends any small message now and then: every send that gets through counts.
 */
export const IDLE_MS = 30 * 60_000;
export const MAX_MESSAGE_BYTES = 16 * 1024;
/** The host sends state about 15 times a second, and a frame with an event goes out at once: 60 a second at worst. This leaves room. */
export const SENDS_PER_SECOND = 120;
const SEND_WINDOW_MS = 1_000;
/** No I, L or O: a code read aloud or off a screen cannot be mistyped. 23^4 = 279,841 codes; ./roomLimits has the guessing odds. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 4;

export type RelayMessage = Readonly<Record<string, unknown>>;
export interface Listener {
  readonly message: (message: RelayMessage) => void;
  /** The room is gone, or this member opened a newer stream. */
  readonly end: () => void;
}
export interface Attached { readonly peerJoined: boolean; readonly detach: () => void }
export type Refusal = "unknown" | "denied";
export type RoomStore = ReturnType<typeof createRoomStore>;

interface Member { readonly token: string; listener: Listener | null; sendsFromMs: number; sends: number }
interface Room { readonly owner: string; readonly host: Member; guest: Member | null; activeMs: number }
interface Seat { readonly room: Room; readonly self: Member; readonly other: () => Member | null }

/** The one message the relay itself sends: whether the other member's event stream is open. */
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

function newMember(): Member {
  return { token: randomBytes(18).toString("base64url"), listener: null, sendsFromMs: 0, sends: 0 };
}

export function createRoomStore(now: () => number = Date.now) {
  const rooms = new Map<string, Room>();

  /** Removes rooms idle for IDLE_MS and ends their streams. Every other call sweeps first. */
  const sweep = (): void => {
    for (const [code, room] of rooms) {
      if (now() - room.activeMs < IDLE_MS) continue;
      rooms.delete(code);
      // The seats are emptied first, so a stream that detaches as it ends finds nobody to tell.
      const open = [room.host, room.guest].flatMap((member) => member?.listener ?? []);
      room.host.listener = null;
      if (room.guest !== null) room.guest.listener = null;
      for (const listener of open) listener.end();
    }
  };

  /** The caller's seat and the other one, which is empty until a guest joins. Codes are matched without regard to case. */
  const seat = (code: string, token: string): Seat | Refusal => {
    sweep();
    const room = rooms.get(code.toUpperCase());
    if (room === undefined) return "unknown";
    if (sameToken(token, room.host.token)) return { room, self: room.host, other: () => room.guest };
    if (room.guest !== null && sameToken(token, room.guest.token)) return { room, self: room.guest, other: () => room.host };
    return "denied";
  };

  return {
    sweep,
    size: (): number => rooms.size,
    /** How many live rooms `owner` created. */
    heldBy: (owner: string): number => {
      sweep();
      return [...rooms.values()].filter((room) => room.owner === owner).length;
    },
    /**
     * For an owner at its cap. Removes the one of its rooms that has no stream open and was used longest ago (a host
     * who pressed Back leaves one behind) and returns 0. When somebody is connected to every one, nothing is removed
     * and the answer is the seconds until the first of them would expire.
     */
    freeOne: (owner: string): number => {
      sweep();
      const held = [...rooms].filter(([, room]) => room.owner === owner).sort(([, a], [, b]) => a.activeMs - b.activeMs);
      const empty = held.find(([, room]) => room.host.listener === null && (room.guest?.listener ?? null) === null);
      if (empty !== undefined) rooms.delete(empty[0]);
      const oldest = held[0];
      return empty !== undefined || oldest === undefined ? 0 : Math.max(1, Math.ceil((oldest[1].activeMs + IDLE_MS - now()) / 1000));
    },
    /** A new room and its host token, or null when the server already holds MAX_ROOMS. `owner` is who it counts against. */
    create: (owner = ""): { code: string; token: string } | null => {
      sweep();
      if (rooms.size >= MAX_ROOMS) return null;
      let code = "";
      do {
        code = Array.from({ length: CODE_LENGTH }, () => ALPHABET.charAt(randomInt(ALPHABET.length))).join("");
      } while (rooms.has(code));
      const host = newMember();
      rooms.set(code, { owner, host, guest: null, activeMs: now() });
      return { code, token: host.token };
    },
    join: (code: string): { token: string } | "unknown" | "full" => {
      sweep();
      const room = rooms.get(code.toUpperCase());
      if (room === undefined) return "unknown";
      if (room.guest !== null) return "full";
      room.guest = newMember();
      room.activeMs = now();
      return { token: room.guest.token };
    },
    /** Starts delivering the other member's messages to `listener`. A member has one stream: a newer one replaces the older. */
    attach: (code: string, token: string, listener: Listener): Attached | Refusal => {
      const found = seat(code, token);
      if (typeof found === "string") return found;
      const { room, self, other } = found;
      const tell = (joined: boolean): void => { other()?.listener?.message(peerEvent(joined)); };
      const older = self.listener;
      self.listener = listener;
      room.activeMs = now();
      if (older === null) tell(true);
      else older.end();
      return {
        peerJoined: (other()?.listener ?? null) !== null,
        detach: () => {
          // A stream that was replaced, or whose room expired, has nothing left to undo.
          if (self.listener !== listener) return;
          self.listener = null;
          tell(false);
        },
      };
    },
    /**
     * A message sent while the other member has no stream open is "dropped": nothing is queued, to keep this simple.
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
      const target = found.other()?.listener ?? null;
      if (target === null) return "dropped";
      target.message(message);
      return "sent";
    },
  };
}
