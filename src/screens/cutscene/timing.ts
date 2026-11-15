// The boss cutscene's clock: time in ms -> which beat and how far through it. Pure, so it is tested without a browser.
export type CutBeat = "open" | "reveal" | "name" | "exit" | "done";

/** Where each beat ends, in ms. The big beat (the name, and the horn) lands where "name" starts. */
export const OPEN_END = 1100;
export const NAME_AT = 1800;
export const EXIT_AT = 3500;
export const CUT_MS = 4500;
/** The still title card used under reduced motion. */
export const STILL_MS = 2000;
/** The camera arrives at the fight shot here. */
export const MOVE_MS = 4000;

export interface CutFrame { beat: CutBeat; p: number }

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

export function beatAt(ms: number): CutFrame {
  if (ms < OPEN_END) return { beat: "open", p: clamp01(ms / OPEN_END) };
  if (ms < NAME_AT) return { beat: "reveal", p: (ms - OPEN_END) / (NAME_AT - OPEN_END) };
  if (ms < EXIT_AT) return { beat: "name", p: (ms - NAME_AT) / (EXIT_AT - NAME_AT) };
  if (ms < CUT_MS) return { beat: "exit", p: (ms - EXIT_AT) / (CUT_MS - EXIT_AT) };
  return { beat: "done", p: 1 };
}

const smooth = (x: number): number => x * x * (3 - 2 * x);

/** How far the cinema bars are in: 0 (away) to 1 (fully in). They slide in over 400 ms and out over the exit beat. */
export function barsAt(ms: number): number {
  if (ms >= EXIT_AT) return 1 - smooth(clamp01((ms - EXIT_AT) / 800));
  return smooth(clamp01(ms / 400));
}

/** How far the camera is along its one shot, 0 to 1, slow at both ends. */
export function moveAt(ms: number): number {
  const x = clamp01(ms / MOVE_MS);
  return x * x * x * (x * (6 * x - 15) + 10);
}

/** How visible the name plate is, 0 to 1: it opens on the big beat and goes with the exit. */
export function plateAt(ms: number): number {
  if (ms < NAME_AT) return 0;
  if (ms >= EXIT_AT) return 1 - clamp01((ms - EXIT_AT) / 500);
  return smooth(clamp01((ms - NAME_AT) / 450));
}
