// The host's side of an online fight. The host runs the engine; this turns what the guest sends into engine
// input and sends the fight back. Pure apart from the transport it is given.
import type { CombatEvent, CombatInput, CombatState, Strike } from "../core/types";
import type { HostMessage } from "./messages";
import type { RoomTransport } from "./transport";

/** How long a strike waits for the other player's, so two strikes a moment apart still land together. */
export const TOGETHER_MS = 400;
/** State goes out about 15 times a second; a frame with events goes out at once. */
export const STATE_EVERY_MS = 66;
const MAX_WAITING = 16;
/** A room is removed 30 minutes after its last send; a "keep" every 5 minutes lets a quiet room live while the host is open. */
export const KEEP_EVERY_MS = 5 * 60_000;
/** A guest that asks which fight is on is answered at most this often, so asking fast cannot make the host send fast. */
export const ANSWER_EVERY_MS = 1_000;

interface Waiting {
  readonly strike: Strike;
  readonly at: number;
}

export interface HostLink {
  /** True only for a link to a guest on another screen (an online room), not for two players on one camera or a FaceTime call. */
  readonly room?: true;
  /** True while the guest's stream is open. */
  guestHere(): boolean;
  /**
   * Tells the guest which fight begins. It is kept while that fight is on and sent again, with the newest state,
   * whenever the relay says the guest is here (joined late, or back after its page closed) or the guest asks, so a
   * guest who was not there for the first one still gets into the fight. It is forgotten when the fight ends, the
   * host stops it, the next one starts or the link closes: a guest who comes after that is told nothing.
   */
  start(enemyId: string, styleId: string, seed: number): void;
  /**
   * The input to hand `step` this frame: the host's own (`local`, player 0) plus the guest's strikes as player 1.
   * The engine doubles damage only when both players' strikes are in the same frame, so a strike is held back up to
   * TOGETHER_MS for the other player's strike with the same move; then both are released in one frame.
   */
  takeInput(local: CombatInput, nowMs: number): CombatInput;
  /** Call after every `step`. Sends the state when it is due, and always when something happened. */
  publish(state: CombatState, events: readonly CombatEvent[], nowMs: number): void;
  /** The host left the fight (quit to the map): tells the guest, so it is not left on a frozen frame. */
  stop(): void;
  close(): void;
}

/** The state a two-player fight starts from. */
export function forTwo(state: CombatState): CombatState {
  return { ...state, players: 2 };
}

export function createHostLink(transport: RoomTransport, room = false): HostLink {
  let here = false;
  let arrived: Strike[] = [];
  let waiting: Waiting[] = [];
  let seq = 0;
  let lastSentAt = -Infinity;
  let unsent: CombatEvent[] = [];
  let ended = false;
  /** The fight that is on, as it was announced; null between fights. */
  let live: Extract<HostMessage, { type: "start" }> | null = null;
  /** The newest state sent in that fight, so a guest who comes back while the host is paused has something to draw. */
  let lastState: CombatState | null = null;
  /** Each start gets the next number, beginning somewhere random so two host pages do not share them. */
  let fightId = Math.floor(Math.random() * 1_000_000_000);
  let asked = false;
  let answeredAt = -Infinity;

  const sendState = (state: CombatState, nowMs: number): void => {
    seq += 1;
    lastSentAt = nowMs;
    lastState = state;
    void transport.send({ type: "state", seq, state, events: unsent });
    unsent = [];
  };
  /** Says again which fight is on. The guest drops it when it is already in that fight. */
  const sayAgain = (): boolean => {
    if (live === null) return false;
    void transport.send(live);
    return true;
  };

  const keep = setInterval(() => { void transport.send({ type: "keep" }); }, KEEP_EVERY_MS);

  transport.onMessage((message) => {
    if (message.type === "peer") {
      here = message.joined;
      // No frame may be running (the host can be paused), so the last state goes with it, under a new number.
      if (here && sayAgain() && lastState !== null) sendState(lastState, lastSentAt);
    } else if (message.type === "ask") asked = true;
    else if (message.type === "strike" && arrived.length < MAX_WAITING) {
      arrived.push({ move: message.move, quality: message.quality, player: 1 });
    }
  });

  return {
    ...(room ? { room: true as const } : {}),
    guestHere: () => here,
    start(enemyId, styleId, seed) {
      seq = 0;
      lastSentAt = -Infinity;
      unsent = [];
      waiting = [];
      arrived = [];
      ended = false;
      lastState = null;
      asked = false;
      fightId += 1;
      live = { type: "start", enemyId, styleId, seed, id: fightId };
      void transport.send(live);
    },
    takeInput(local, nowMs) {
      const fresh = [...local.struck.map((strike) => ({ ...strike, player: 0 as const })), ...arrived];
      arrived = [];
      waiting = [...waiting, ...fresh.map((strike) => ({ strike, at: nowMs }))].slice(-MAX_WAITING);
      const release = (entry: Waiting): boolean =>
        nowMs - entry.at >= TOGETHER_MS ||
        waiting.some((other) => other.strike.move === entry.strike.move && other.strike.player !== entry.strike.player);
      const struck = waiting.filter(release).map((entry) => entry.strike);
      waiting = waiting.filter((entry) => !struck.includes(entry.strike));
      return { held: local.held, struck };
    },
    publish(state, events, nowMs) {
      if (ended) return;
      unsent = [...unsent, ...events].slice(-32);
      const over = state.phase.kind === "won" || state.phase.kind === "lost";
      const answer = asked && nowMs - answeredAt >= ANSWER_EVERY_MS && sayAgain();
      if (answer) {
        asked = false;
        answeredAt = nowMs;
      }
      if (!over && !answer && events.length === 0 && nowMs - lastSentAt < STATE_EVERY_MS) return;
      sendState(state, nowMs);
      if (over) {
        ended = true;
        live = null;
        void transport.send({ type: "end", won: state.phase.kind === "won" });
      }
    },
    stop() {
      ended = true;
      live = null;
      void transport.send({ type: "stop" });
    },
    close() {
      live = null;
      clearInterval(keep);
      transport.close();
    },
  };
}
