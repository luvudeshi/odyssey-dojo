// What the friend's picture says at this moment of the fight, as plain data: the compositor only draws it.
// In a two-player fight only the host defends (src/net/guest.ts), so on a defend the friend is told to wait.
import { fallsLine } from "../enemies/wording";
import type { CombatEvent, CombatState, EnemySpec, MoveDef, MoveDiagram } from "../core/types";

/** Health the heroes start with; the same number as PLAYER_HP in the combat engine (tests/facetimeFrame.test.ts holds them together). */
export const HERO_HP = 100;
/** How long a grade word stays up. */
export const GRADE_MS = 900;

export type FrameTone = "strike" | "finish" | "defend" | "calm" | "won" | "lost";

export interface FrameHud {
  readonly enemyName: string;
  /** 0..1 */
  readonly enemyShare: number;
  readonly heroShare: number;
  readonly tone: FrameTone;
  /** The small word over the card: STRIKE, FINISH, HOLD ON... */
  readonly tag: string;
  /** The big word: the move's prompt. */
  readonly word: string;
  /** One line of help under it. */
  readonly line: string;
  /** 0..1 of the time left for this prompt, or null when nothing is counted down. */
  readonly timer: number | null;
  readonly diagram: MoveDiagram | null;
  /** "4:07", or null when no call clock runs. */
  readonly clock: string | null;
  /** GOOD / GREAT / PERFECT / TOGETHER, or null. */
  readonly grade: string | null;
}

export interface FrameHudInput {
  readonly state: CombatState | null;
  readonly enemy: EnemySpec | null;
  readonly moves: ReadonlyMap<string, MoveDef>;
  readonly clock: string | null;
  readonly grade: string | null;
}

const share = (value: number, of: number): number => (of > 0 && Number.isFinite(value) ? Math.min(1, Math.max(0, value / of)) : 0);

const WAITING: Omit<FrameHud, "clock" | "grade"> = {
  enemyName: "Odyssey Dojo", enemyShare: 0, heroShare: 0, tone: "calm", tag: "ODYSSEY DOJO", word: "STAND BACK",
  line: "Step back until your whole body is in the picture. The fight starts soon.", timer: null, diagram: null,
};

export function frameHud(input: FrameHudInput): FrameHud {
  const { state, enemy, moves, clock, grade } = input;
  if (!state || !enemy) return { ...WAITING, clock, grade: null };
  const base = { enemyName: enemy.name, enemyShare: share(state.enemyHp, enemy.hp), heroShare: share(state.playerHp, HERO_HP), clock, grade };
  const phase = state.phase;
  switch (phase.kind) {
    case "won":
      return { ...base, tone: "won", tag: "VICTORY", word: fallsLine(enemy.id, enemy.name).toUpperCase(), line: "Well fought. Stay on the call for the next fight.", timer: null, diagram: null };
    case "lost":
      return { ...base, tone: "lost", tag: "DEFEATED", word: "STRUCK DOWN", line: "Stay on the call. Your friend can start again.", timer: null, diagram: null };
    case "intro":
    case "recover":
      return { ...base, tone: "calm", tag: "GET READY", word: "WATCH", line: "Hands up. Your move is coming.", timer: null, diagram: null };
    case "defend": {
      const counter = moves.get(phase.attack.counter);
      return {
        ...base, tone: "defend", tag: "YOUR FRIEND DEFENDS", word: counter?.prompt ?? "DEFEND",
        line: `${phase.attack.name} is coming. Get ready to strike.`, timer: share(phase.msLeft, phase.totalMs), diagram: null,
      };
    }
    case "strike":
    case "finisher": {
      const move = moves.get(phase.move);
      const finish = phase.kind === "finisher";
      return {
        ...base, tone: finish ? "finish" : "strike", tag: finish ? "FINISH IT" : "STRIKE NOW", word: move?.prompt ?? phase.move.toUpperCase(),
        line: move?.hint ?? "", timer: share(phase.msLeft, phase.totalMs), diagram: move?.diagram ?? null,
      };
    }
  }
}

/** The word to flash for what just happened, or null. Two strikes landing together beat any grade. */
export function gradeWord(events: readonly CombatEvent[], rate: (quality: number) => string | null): string | null {
  let word: string | null = null;
  for (const event of events) {
    if (event.type !== "enemyHit") continue;
    if (event.together) return "TOGETHER!";
    word = rate(event.quality) ?? word;
  }
  return word;
}
