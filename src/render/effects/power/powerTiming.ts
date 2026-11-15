// When each beat of a divine power happens. Pure, so it is tested without a browser.
// Every power has three beats: a wind-up (WINDUP_S), the strike, and a hit on the monster at a fixed time (`hit`),
// then an aftermath that fades out by `total`. Times are seconds after battle.powerAt.
import type { GodId } from "../../../ai/gods/gods";

export const WINDUP_S = 0.3;

export interface PowerSpan {
  /** Seconds after the power fired when it visibly hits the monster. */
  readonly hit: number;
  /** Seconds after which nothing of the effect is left on screen. */
  readonly total: number;
  /** Seconds after `hit` of further, smaller hits (Hermes lands several). */
  readonly echoes: readonly number[];
}

export const POWER_SPAN: Readonly<Record<GodId, PowerSpan>> = {
  zeus: { hit: 0.55, total: 1.7, echoes: [] },
  poseidon: { hit: 0.95, total: 1.9, echoes: [] },
  athena: { hit: 0.75, total: 1.5, echoes: [] },
  hermes: { hit: 0.8, total: 1.5, echoes: [0.09, 0.18] },
  artemis: { hit: 0.85, total: 1.6, echoes: [] },
  apollo: { hit: 0.85, total: 2.0, echoes: [] },
};

export type PowerPhase = "idle" | "windup" | "strike" | "aftermath";

export interface PowerClock {
  god: GodId | null;
  /** Seconds since the power fired; 0 when idle. */
  t: number;
  phase: PowerPhase;
  /** 0..1 through the wind-up, then it stays 1. */
  wind: number;
  /** 0..1 from the end of the wind-up to the hit. */
  strike: number;
  /** 0..1 from the hit to the end. */
  after: number;
}

export function makeClock(): PowerClock {
  return { god: null, t: 0, phase: "idle", wind: 0, strike: 0, after: 0 };
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** Fills `out` for `god` at wall-clock `now`, the power having fired at `powerAt`. Idle before it, after the end, or with no god. */
export function readClock(out: PowerClock, god: GodId | null, powerAt: number, now: number): PowerClock {
  const t = now - powerAt;
  out.god = god;
  if (god === null || !(t >= 0) || t >= POWER_SPAN[god].total) {
    out.t = 0; out.phase = "idle"; out.wind = 0; out.strike = 0; out.after = 0;
    return out;
  }
  const { hit, total } = POWER_SPAN[god];
  out.t = t;
  out.wind = clamp01(t / WINDUP_S);
  out.strike = clamp01((t - WINDUP_S) / (hit - WINDUP_S));
  out.after = clamp01((t - hit) / (total - hit));
  out.phase = t < WINDUP_S ? "windup" : t < hit ? "strike" : "aftermath";
  return out;
}

/** Slow start, fast end, for a thing that is thrown. */
export const easeIn = (x: number): number => clamp01(x) ** 2.2;
/** Fast start, slow end, for a thing that settles. */
export const easeOut = (x: number): number => 1 - (1 - clamp01(x)) ** 2.4;
export const smooth = (x: number): number => { const c = clamp01(x); return c * c * (3 - 2 * c); };
/** 0 at both ends, 1 in the middle of a..b: for flashes that rise and fall. */
export function bump(x: number, a: number, b: number): number {
  return smooth((x - a) / Math.max(1e-6, (b - a) / 2)) * (1 - smooth((x - (a + b) / 2) / Math.max(1e-6, (b - a) / 2)));
}
export { clamp01 };
