// Makes the friend on the phone the second player of an ordinary two-player fight. FightScreen already takes a
// HostLink for the online rooms (src/net/host.ts); this builds the very same link on a transport that never leaves
// the page: what the host "sends" (which fight, the state, the events) is kept here for the picture that goes back
// to the phone, and the friend's strikes, read from their camera, come in as the guest's messages. So the rules of
// a room fight hold unchanged: both strike, only the host defends, and the same strike made together hits twice as hard.
import type { CombatEvent, CombatInput, CombatState } from "../core/types";
import { createHostLink } from "../net/host";
import type { HostLink } from "../net/host";
import type { NetMessage } from "../net/messages";
import type { RoomTransport } from "../net/transport";

export interface FriendFight {
  readonly enemyId: string;
  readonly styleId: string;
  readonly seed: number;
}

/** The phone's side of the link. */
export interface FriendSide {
  /** The friend is (or is no longer) on the call with their camera on. */
  setHere(here: boolean): void;
  /** The friend's strikes this frame, from their camera. Held defends are ignored: only the host defends. */
  sendInput(input: CombatInput): void;
  /** The fight that is on, or null between fights. */
  fight(): FriendFight | null;
  /** The newest state of that fight, or null. */
  state(): CombatState | null;
  /** Events since the last call, oldest first, for the grade word. */
  takeEvents(): readonly CombatEvent[];
  /** Called when a fight starts (with it) and when it ends or is left (with null). */
  onFight(listener: (fight: FriendFight | null) => void): void;
}

export interface FriendLink {
  /** Hand this to FightScreen as its `link`. */
  readonly host: HostLink;
  readonly friend: FriendSide;
}

export function createFriendLink(): FriendLink {
  let toHost: ((message: NetMessage) => void) | null = null;
  let fight: FriendFight | null = null;
  let state: CombatState | null = null;
  let events: CombatEvent[] = [];
  let closed = false;
  const listeners: ((fight: FriendFight | null) => void)[] = [];
  const tell = (): void => { listeners.forEach((listener) => { listener(fight); }); };

  const transport: RoomTransport = {
    send(message) {
      if (closed) return Promise.resolve(false);
      switch (message.type) {
        case "start":
          fight = { enemyId: message.enemyId, styleId: message.styleId, seed: message.seed };
          state = null;
          events = [];
          tell();
          break;
        case "state":
          state = message.state;
          events = [...events, ...message.events].slice(-64);
          break;
        case "stop":
          fight = null;
          state = null;
          tell();
          break;
        // "end": the last state stays up (won or lost) until the next fight starts. "keep" is for the relay only.
        default:
          break;
      }
      return Promise.resolve(true);
    },
    onMessage(listener) { toHost = listener; },
    close() {
      closed = true;
      fight = null;
      state = null;
      tell();
    },
  };

  const host = createHostLink(transport);
  return {
    host,
    friend: {
      setHere(here) { if (!closed) toHost?.({ type: "peer", joined: here }); },
      sendInput(input) {
        if (closed) return;
        for (const strike of input.struck) toHost?.({ type: "strike", move: strike.move, quality: strike.quality });
      },
      fight: () => fight,
      state: () => state,
      takeEvents() {
        const out = events;
        events = [];
        return out;
      },
      onFight(listener) { listeners.push(listener); },
    },
  };
}
