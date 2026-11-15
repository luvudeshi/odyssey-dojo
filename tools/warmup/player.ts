// A made-up player for the warm-up screen, in place of the camera: the frames a webcam would give for somebody who
// copies the move guide's figure at once, late, or not at all. The demo page (./main.tsx) and
// tests/coachWarmupGrades.test.ts both use it, so what the page shows is what the tests check.
import { HANDS_DOWN, guideFor, poseAt, poseOf, towardOf } from "../../src/coach/guide";
import type { PoseFrame } from "../../src/core/types";
import { MOVES } from "../../src/moves/registry";
import { bodyFrame } from "../guide/body";

/** How the made-up player answers a step: at once, late in the step, or not at all. */
export type Play = "good" | "late" | "none";
export const PLAYS: readonly Play[] = ["good", "late", "none"];
/** How long after the step starts the move begins. */
export const DELAY_MS: Readonly<Record<Play, number>> = { good: 250, late: 1750, none: Infinity };
/** Two of each, so a single run shows every grade, a best move and a work-on list. */
export const MIXED: Readonly<Record<string, Play>> = {
  jab: "good", cross: "late", block: "none", dodge_left: "good", dodge_right: "late", duck: "none",
};

const STANDING = poseOf(HANDS_DOWN);
const STILL = towardOf({ t: 0, pose: STANDING, toward: 0, forward: [] });

/** The frame at time `t`: standing with the hands down, or `sinceStepMs` into copying `moveId` the way `play` says. */
export function frameFor(t: number, moveId: string | null, play: Play, sinceStepMs: number): PoseFrame {
  const move = moveId === null ? undefined : MOVES.get(moveId);
  const guide = move ? guideFor(move) : null;
  const into = sinceStepMs - DELAY_MS[play];
  if (!guide || !(into >= 0)) return bodyFrame(t, STANDING, STILL);
  const { pose, toward } = poseAt(guide, into);
  return bodyFrame(t, pose, toward);
}
