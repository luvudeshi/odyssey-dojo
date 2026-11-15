// What the two browsers in an online room say to each other (agreed in issue #29). The relay passes these on
// unread, so everything that arrives is checked here before the game uses it.
import type { CombatEvent, CombatState } from "../core/types";

export type GuestMessage =
  | { readonly type: "strike"; readonly move: string; readonly quality: number }
  | { readonly type: "held"; readonly moves: readonly string[] };

export type HostMessage =
  | { readonly type: "start"; readonly enemyId: string; readonly styleId: string; readonly seed: number }
  | { readonly type: "state"; readonly seq: number; readonly state: CombatState; readonly events: readonly CombatEvent[] }
  | { readonly type: "end"; readonly won: boolean }
  /** The host left the fight for the quest map; the room stays open for the next one. */
  | { readonly type: "stop" }
  /** Sent now and then by an idle host so the relay keeps the room; the guest ignores it (parseMessage drops it). */
  | { readonly type: "keep" };

/** Sent by the relay itself: whether the other member's stream is open. */
export interface PeerMessage {
  readonly type: "peer";
  readonly joined: boolean;
}

export type NetMessage = GuestMessage | HostMessage | PeerMessage;

const MAX_ID = 64;
const MAX_HELD = 8;
const MAX_EVENTS = 32;
const PHASES = ["intro", "recover", "defend", "strike", "finisher", "won", "lost"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_ID;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Enough of a CombatState that drawing it cannot throw: the numbers are numbers and the phase is a known one. */
function isState(value: unknown): value is CombatState {
  if (!isRecord(value) || !isRecord(value.phase)) return false;
  const numbers = [value.playerHp, value.enemyHp, value.combo, value.score, value.seed, value.phaseIndex, value.power];
  if (!numbers.every(isNumber) || !isRecord(value.mastery)) return false;
  if (value.players !== 1 && value.players !== 2) return false;
  const phase = value.phase;
  if (typeof phase.kind !== "string" || !PHASES.includes(phase.kind)) return false;
  if (phase.kind === "won" || phase.kind === "lost") return true;
  if (!isNumber(phase.msLeft)) return false;
  if (phase.kind === "intro" || phase.kind === "recover") return true;
  if (!isNumber(phase.totalMs)) return false;
  if (phase.kind === "defend") return isRecord(phase.attack) && isId(phase.attack.id) && isId(phase.attack.counter);
  if (!isId(phase.move)) return false;
  return phase.kind === "finisher" || (isRecord(phase.weakSpot) && isId(phase.weakSpot.id));
}

function isEvent(value: unknown): value is CombatEvent {
  return isRecord(value) && typeof value.type === "string";
}

/** The message, cleaned, or null when it is not one of ours. Never throws, whatever the other side sent. */
export function parseMessage(value: unknown): NetMessage | null {
  if (!isRecord(value)) return null;
  switch (value.type) {
    case "peer":
      return typeof value.joined === "boolean" ? { type: "peer", joined: value.joined } : null;
    case "strike":
      if (!isId(value.move) || !isNumber(value.quality)) return null;
      return { type: "strike", move: value.move, quality: Math.min(1, Math.max(0, value.quality)) };
    case "held":
      if (!Array.isArray(value.moves) || value.moves.length > MAX_HELD || !value.moves.every(isId)) return null;
      return { type: "held", moves: value.moves };
    case "start":
      if (!isId(value.enemyId) || !isId(value.styleId) || !isNumber(value.seed)) return null;
      return { type: "start", enemyId: value.enemyId, styleId: value.styleId, seed: value.seed };
    case "state":
      if (!isNumber(value.seq) || !isState(value.state) || !Array.isArray(value.events)) return null;
      if (value.events.length > MAX_EVENTS || !value.events.every(isEvent)) return null;
      return { type: "state", seq: value.seq, state: value.state, events: value.events };
    case "end":
      return typeof value.won === "boolean" ? { type: "end", won: value.won } : null;
    case "stop":
      return { type: "stop" };
    default:
      return null;
  }
}
