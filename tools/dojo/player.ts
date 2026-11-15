// A made-up player for the dojo's demo page and its tests: the frames a webcam would give for somebody doing a move
// well, sloppily, or hardly at all. Built on the guide's own figure (tools/guide/body.ts), so "well" is exactly what
// the outline shows.
import type { Guide, GuideJoint, GuidePose, Toward } from "../../src/coach/guide";
import { guideFor, poseAt } from "../../src/coach/guide";
import { gradeAttempt } from "../../src/coach/dojo";
import type { Baseline, MoveDef, PoseFrame } from "../../src/core/types";
import { MOVES } from "../../src/moves/registry";
import { baselineOf } from "../../src/pose/signals";
import { bodyFrame } from "../guide/body";

export type Effort = "good" | "sloppy" | "miss";

/** How far from the start pose toward the figure's pose each effort goes, and how slowly (1 is the figure's own speed). */
/** How far from the start pose toward the figure's pose a body goes (1 is all the way), and how slowly (1 is the figure's own speed). */
export interface Shape {
  readonly reach: number;
  readonly slow: number;
}
export const GOOD: Shape = { reach: 1, slow: 1 };

/** The body `ms` after it began the move: once through the guide's loop, then back in the start pose. */
export function effortFrame(guide: Guide, shape: Shape, t: number, ms: number): PoseFrame {
  const { reach, slow } = shape;
  const start = poseAt(guide, 0);
  const at = ms / slow;
  if (ms < 0 || at >= guide.loopMs) return bodyFrame(t, start.pose, start.toward);
  const now = poseAt(guide, at);
  const mix = (a: number, b: number): number => a + (b - a) * reach;
  const pose = Object.fromEntries(
    (Object.keys(now.pose) as GuideJoint[]).map((name) => [name, [mix(start.pose[name][0], now.pose[name][0]), mix(start.pose[name][1], now.pose[name][1])]]),
  ) as unknown as GuidePose;
  const toward = Object.fromEntries(Object.entries(now.toward).map(([end, value]) => [end, value * reach])) as unknown as Toward;
  return bodyFrame(t, pose, toward);
}

/** A whole attempt at 30 frames a second: standing for `standMs`, then the move, then standing until `totalMs`. */
export function attempt(guide: Guide, shape: Shape, standMs = 700, totalMs = 2400, fromT = 0): PoseFrame[] {
  const frames: PoseFrame[] = [];
  for (let ms = 0; ms <= totalMs; ms += 33) frames.push(effortFrame(guide, shape, fromT + ms, ms - standMs));
  return frames;
}

/** The standing measure of a body in the guide's start pose. */
export function standingBaseline(guide: Guide): Baseline {
  return baselineOf(attempt(guide, GOOD, 700, 660));
}

const REACHES = Array.from({ length: 49 }, (_, index) => 0.98 - index * 0.02);

/**
 * The shape that earns each grade for this move, found by trying: the figure's own shape is "good"; "sloppy" is the
 * middle of the reaches graded Good (a little short and slow); "miss" is a reach well short of any that counts. Null where no reach gives that grade (some moves are Excellent however short they fall).
 */
export function shapesFor(move: MoveDef, guide: Guide): Readonly<Record<Effort, Shape | null>> {
  const baseline = standingBaseline(guide);
  const tier = (shape: Shape): string => gradeAttempt(move, attempt(guide, shape), baseline).grade.tier;
  const slow = (reach: number): Shape => ({ reach, slow: 1.5 });
  const sloppy = REACHES.filter((reach) => tier(slow(reach)) === "good");
  // Well short of the nearest reach that counts, so a frame landing differently on the page does not tip it over.
  const short = REACHES.find((reach) => tier(slow(reach)) === "needs_work" && tier(slow(reach + 0.08)) === "needs_work" && tier(slow(reach + 0.04)) === "needs_work");
  const miss = short !== undefined && short <= 0.6 ? short : REACHES.find((reach) => reach <= 0.24 && tier(slow(reach)) === "needs_work");
  return {
    good: tier(GOOD) === "excellent" ? GOOD : null,
    sloppy: sloppy.length > 0 ? slow(sloppy[Math.floor(sloppy.length / 2)] ?? 0.8) : null,
    miss: miss === undefined ? null : slow(miss),
  };
}

/** How long after "go" the made-up player starts to move. */
export const REACT_MS = 350;
/** What the made-up player does on each repetition of a move, from 0: one of each grade. */
export const PLAN: readonly Effort[] = ["good", "sloppy", "miss"];

/**
 * A made-up player who follows the session: standing in the move's start pose until it is their turn, then doing the
 * move the way `plan` says for that repetition. Call the result once per frame with the time and where the session is.
 */
export function scriptedPlayer(plan: (repIndex: number, moveId: string) => Effort = (repIndex) => PLAN[repIndex % PLAN.length] ?? "good") {
  const shapes = new Map<string, ReturnType<typeof shapesFor>>();
  let turn = "";
  let beganAt = 0;
  return (now: number, at: { readonly phase: string; readonly moveId: string; readonly repIndex: number }): PoseFrame | null => {
    const move = MOVES.get(at.moveId);
    const guide = move ? guideFor(move) : null;
    if (!move || !guide) return null;
    const found = shapes.get(move.id) ?? shapesFor(move, guide);
    shapes.set(move.id, found);
    const mine = `${at.moveId}#${String(at.repIndex)}`;
    if (at.phase === "go" && turn !== mine) {
      turn = mine;
      beganAt = now;
    }
    const effort = plan(at.repIndex, at.moveId);
    // Where no shape earns the grade: the figure's own for a sloppy one, standing still for a miss.
    const shape = found[effort] ?? (effort === "miss" ? { reach: 0, slow: 1 } : GOOD);
    return effortFrame(guide, shape, now, at.phase === "go" && turn === mine ? now - beganAt - REACT_MS : -1);
  };
}
