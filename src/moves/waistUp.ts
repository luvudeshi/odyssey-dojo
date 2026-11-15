// Waist-up play (issue #239): what the fight may ask a player whose legs the camera cannot see.
// docs/waist-up.md has the table of which moves still count; NEEDS_LEGS below is that table's "no" rows, and
// tests/waistUp.test.ts fails if the two differ. Nothing here reads a detector: it is a list, a vote and a swap.
import type { FightingStyle, PoseFrame, PoseHistory } from "../core/types";
import { JOINT, joint } from "../pose/signals";
import { MOVES } from "./registry";

/** The moves that cannot count when the camera sees the player from the waist up. */
export const NEEDS_LEGS: readonly string[] = ["front_kick", "knee"];

/** A point counts as seen from this visibility up, the same line the kicks draw. */
const SEEN = 0.5;
/** Legs come into view when they were seen in more than this share of the last second. */
const SHARE_IN = 0.5;
/** Once in view they stay in view until the share drops under this, so one bad frame does not flip the answer. */
const SHARE_STAY = 0.3;
/** Fewer frames than this is too little to say the legs are there. */
const FEWEST_FRAMES = 5;

function seen(frame: PoseFrame, index: number): boolean {
  const point = joint(frame.image, index);
  return point.visibility >= SEEN && point.x > 0 && point.x < 1 && point.y > 0 && point.y < 1;
}

/** One frame: both knees and at least one ankle seen, inside the picture. */
export function legsInFrame(frame: PoseFrame): boolean {
  return (
    seen(frame, JOINT.leftKnee) &&
    seen(frame, JOINT.rightKnee) &&
    (seen(frame, JOINT.leftAnkle) || seen(frame, JOINT.rightAnkle))
  );
}

/**
 * True when both knees and at least one ankle were seen in most of the history, which holds the last second.
 * Pass the previous answer as `was` and it is steady: legs that were in view stay in view until they are seen
 * in under three frames in ten, so a flickering knee does not flip the answer every frame.
 */
export function legsInView(history: PoseHistory, was = false): boolean {
  const frames = history.frames;
  if (frames.length < FEWEST_FRAMES) return false;
  const share = frames.filter(legsInFrame).length / frames.length;
  return was ? share >= SHARE_STAY : share > SHARE_IN;
}

/** False for a move the camera cannot read right now: one that needs the legs when they are out of view. */
export function askable(moveId: string, legsSeen: boolean): boolean {
  return legsSeen || !NEEDS_LEGS.includes(moveId);
}

/**
 * The hand strikes nearest each leg move, nearest first: the ones aimed at the same place on the body.
 * A front kick is a straight push to the middle; a knee comes up from below at close range.
 */
const NEAREST: Readonly<Record<string, readonly string[]>> = {
  front_kick: ["spear_thrust", "cross", "reverse_punch", "double_palm", "jab", "chain_punch", "uppercut"],
  knee: ["uppercut", "rising_palm", "hook", "hammer_fist", "cross", "spear_thrust", "reverse_punch", "double_palm"],
};

/** The defends to fall back on, plainest first. All four count waist up. */
const DEFENDS_IN_ORDER: readonly string[] = ["block", "duck", "dodge_left", "dodge_right"];

/**
 * The move to ask for in place of `moveId` when the legs are out of view. A move that counts waist up comes back
 * as it is. A strike is swapped for the nearest hand strike in `style`; a defend for the nearest defend.
 * `fitting` is optional: the strikes the open weak spot takes. A swap from that list is preferred, so the swapped
 * strike still fits the weak spot whenever the style has a hand strike that does.
 * If the style has no hand strike at all, `moveId` comes back unchanged; no style in src/styles/defs is like that.
 */
export function swapFor(moveId: string, style: FightingStyle, fitting: readonly string[] = []): string {
  if (askable(moveId, false)) return moveId;
  if (MOVES.get(moveId)?.kind === "defend") {
    return DEFENDS_IN_ORDER.find((id) => askable(id, false)) ?? moveId;
  }
  const hands = style.strikes.filter((id) => askable(id, false));
  const onSpot = hands.filter((id) => fitting.includes(id));
  const pool = onSpot.length > 0 ? onSpot : hands;
  const nearest = (NEAREST[moveId] ?? []).find((id) => pool.includes(id));
  return nearest ?? pool[0] ?? moveId;
}
