// Two players on one camera: which tracked body is which player.
// MediaPipe returns the bodies in a frame in no fixed order, and the order can change from one frame to the next.
// This keeps player 0 (who started on screen left) and player 1 (screen right) on the same bodies. Pure: no camera.
import type { Landmark } from "../core/types";
import { JOINT, joint } from "./signals";

/** How long a player may go unseen and still be remembered, in milliseconds. */
export const MEMORY_MS = 500;
/** A lone body further than this from a remembered player (as a share of the picture) is somebody else. */
const SAME_BODY_REACH = 0.3;

/** Where a player was last seen, and when. */
export interface PlayerMemory {
  readonly x: number;
  readonly y: number;
  readonly t: number;
}

export type PlayerMemories = readonly [PlayerMemory | null, PlayerMemory | null];

export interface PlayerAssignment {
  /** For player 0 and player 1: the index of their body in this frame's list, or null if they are not in it. */
  readonly bodies: readonly [number | null, number | null];
  /** Pass this back in with the next frame. */
  readonly memory: PlayerMemories;
}

export const NO_PLAYERS: PlayerAssignment = { bodies: [null, null], memory: [null, null] };

interface Seen {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

/** The middle of the torso, and the shoulder width as a measure of how near the camera the body is. */
function see(body: readonly Landmark[], index: number): Seen {
  const leftShoulder = joint(body, JOINT.leftShoulder);
  const rightShoulder = joint(body, JOINT.rightShoulder);
  const leftHip = joint(body, JOINT.leftHip);
  const rightHip = joint(body, JOINT.rightHip);
  return {
    index,
    x: (leftShoulder.x + rightShoulder.x + leftHip.x + rightHip.x) / 4,
    y: (leftShoulder.y + rightShoulder.y + leftHip.y + rightHip.y) / 4,
    size: Math.hypot(leftShoulder.x - rightShoulder.x, leftShoulder.y - rightShoulder.y),
  };
}

function gap(memory: PlayerMemory, seen: Seen): number {
  return Math.hypot(memory.x - seen.x, memory.y - seen.y);
}

function remember(seen: Seen | null, old: PlayerMemory | null, t: number): PlayerMemory | null {
  return seen ? { x: seen.x, y: seen.y, t } : old;
}

function result(first: Seen | null, second: Seen | null, old: PlayerMemories, t: number): PlayerAssignment {
  return {
    bodies: [first?.index ?? null, second?.index ?? null],
    memory: [remember(first, old[0], t), remember(second, old[1], t)],
  };
}

/**
 * Says which body is player 0 and which is player 1.
 * `bodies` holds the image landmarks of each body MediaPipe found in this frame (mirrored, like PoseFrame.image).
 * `t` is the frame time in milliseconds. `previous` is what this function returned for the frame before.
 */
export function assignPlayers(
  bodies: readonly (readonly Landmark[])[],
  t: number,
  previous: PlayerAssignment = NO_PLAYERS,
): PlayerAssignment {
  const alive = (memory: PlayerMemory | null) => (memory && t - memory.t <= MEMORY_MS ? memory : null);
  const old: PlayerMemories = [alive(previous.memory[0]), alive(previous.memory[1])];
  // With more than two bodies in the picture, the two nearest the camera are the players.
  const seen = bodies
    .map(see)
    .sort((a, b) => b.size - a.size)
    .slice(0, 2);
  const [a, b] = seen;
  const [zero, one] = old;

  if (!a) return result(null, null, old, t);

  if (!b) {
    if (zero && one) return gap(zero, a) <= gap(one, a) ? result(a, null, old, t) : result(null, a, old, t);
    // One player remembered: the body is that player if it is where they were, and the other player if not.
    if (one) return gap(one, a) <= SAME_BODY_REACH ? result(null, a, old, t) : result(a, null, old, t);
    if (zero) return gap(zero, a) <= SAME_BODY_REACH ? result(a, null, old, t) : result(null, a, old, t);
    // Nobody remembered: someone alone is player 0, wherever they stand.
    return result(a, null, old, t);
  }

  if (zero && one) {
    // Both remembered: each body goes to the player it moved least from, taken as a pair.
    const kept = gap(zero, a) + gap(one, b);
    const swapped = gap(zero, b) + gap(one, a);
    return kept <= swapped ? result(a, b, old, t) : result(b, a, old, t);
  }
  const known = zero ?? one;
  if (known) {
    // One remembered: the nearer body is that player, the other body takes the free place.
    const [near, far] = gap(known, a) <= gap(known, b) ? [a, b] : [b, a];
    return zero ? result(near, far, old, t) : result(far, near, old, t);
  }
  // A fresh pair: screen left is player 0.
  return a.x <= b.x ? result(a, b, old, t) : result(b, a, old, t);
}
