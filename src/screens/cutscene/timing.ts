// The boss cutscene's clock: time in ms -> which beat it is in and how far through that beat. Pure, so a test can run it.

export type Beat = "dark" | "reveal" | "name" | "exit" | "card" | "done";

/** The painting rises from black; the name slams in; the picture cracks open. Beat ends, in ms from the start. */
export const DARK_END = 400;
export const REVEAL_END = 1800;
export const NAME_END = 3700;
export const TOTAL_MS = 4700;
/** The big beat: the name slams, the screen shakes once, the second flash goes off. */
export const SLAM_MS = REVEAL_END;
/** With reduced motion the scene is one still card. */
export const REDUCED_MS = 2000;

export interface Position {
  readonly beat: Beat;
  /** 0 at the start of the beat, 1 at its end. */
  readonly t: number;
}

const within = (ms: number, from: number, to: number): number => (ms - from) / (to - from);

export function cutBeat(ms: number, reduced: boolean): Position {
  if (reduced) return ms >= REDUCED_MS ? { beat: "done", t: 1 } : { beat: "card", t: Math.max(0, ms) / REDUCED_MS };
  if (ms < DARK_END) return { beat: "dark", t: Math.max(0, within(ms, 0, DARK_END)) };
  if (ms < REVEAL_END) return { beat: "reveal", t: within(ms, DARK_END, REVEAL_END) };
  if (ms < NAME_END) return { beat: "name", t: within(ms, REVEAL_END, NAME_END) };
  if (ms < TOTAL_MS) return { beat: "exit", t: within(ms, NAME_END, TOTAL_MS) };
  return { beat: "done", t: 1 };
}

/** Piecewise-linear value through [ms, value] points, 0 outside them. Used for flashes and flicker. */
export function curve(ms: number, points: readonly (readonly [number, number])[]): number {
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (a && b && ms >= a[0] && ms <= b[0]) return a[1] + ((b[1] - a[1]) * (ms - a[0])) / (b[0] - a[0]);
  }
  return 0;
}

export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
export const easeOut = (x: number): number => 1 - (1 - clamp01(x)) ** 3;
export const easeIn = (x: number): number => clamp01(x) ** 2.2;
