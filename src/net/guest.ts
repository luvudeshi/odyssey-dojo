// The guest's side of an online fight. The guest runs no engine: it sends its strikes and draws what the host says.
import type { CombatEvent, CombatInput, CombatState } from "../core/types";
import type { RoomTransport } from "./transport";

export interface GuestView {
  readonly state: CombatState;
  /** Everything that happened since the last call to `view`, oldest first, for sounds and effects. */
  readonly events: readonly CombatEvent[];
}

export interface GuestLink {
  /** True while the host's stream is open. */
  hostHere(): boolean;
  /** The fight the host started, or null before it starts. */
  fight(): { readonly enemyId: string; readonly styleId: string; readonly seed: number } | null;
  /** The newest state from the host, or null before the first one. Events are handed over once. */
  view(): GuestView | null;
  /** null while the fight is on, then whether it was won. */
  result(): boolean | null;
  /** Sends this frame's strikes to the host. Defenses stay with the host: only player 0 defends. */
  sendInput(input: CombatInput): void;
  close(): void;
}

export function createGuestLink(transport: RoomTransport): GuestLink {
  let here = false;
  let fight: ReturnType<GuestLink["fight"]> = null;
  let state: CombatState | null = null;
  let seq = 0;
  let events: CombatEvent[] = [];
  let result: boolean | null = null;

  transport.onMessage((message) => {
    switch (message.type) {
      case "peer":
        here = message.joined;
        break;
      case "start":
        fight = { enemyId: message.enemyId, styleId: message.styleId, seed: message.seed };
        state = null;
        seq = 0;
        events = [];
        result = null;
        break;
      case "state":
        // Streams keep order, but a reconnect can replay: never go back to an older state.
        if (message.seq <= seq) break;
        seq = message.seq;
        state = message.state;
        events = [...events, ...message.events].slice(-64);
        break;
      case "end":
        result = message.won;
        break;
      default:
        break;
    }
  });

  return {
    hostHere: () => here,
    fight: () => fight,
    view() {
      if (!state) return null;
      const out = { state, events };
      events = [];
      return out;
    },
    result: () => result,
    sendInput(input) {
      for (const strike of input.struck) void transport.send({ type: "strike", move: strike.move, quality: strike.quality });
    },
    close() {
      transport.close();
    },
  };
}
