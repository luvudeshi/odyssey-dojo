// The same made-up move seen on a different body: smaller or taller, nearer or further, or off to one side.
// Every change is applied to the WHOLE recording, the standing frames that set the baseline included, because
// a small person is small from the first frame. (tests/helpers/noisyCamera.ts covers the other case: a player
// who moves after calibration.)
import type { PoseFrame } from "../../src/core/types";
import { createPoseInput } from "../../src/input/poseInput";
import { MOVES } from "../../src/moves/registry";
import { EMPTY_HISTORY, pushFrame } from "../../src/pose/signals";
import { CLEAN, seeded, seenBy } from "./noisyCamera";

export interface Body {
  readonly name: string;
  /**
   * Body size against the fixture's adult. Scales the picture about the body centre AND the 3D points about
   * the hips: a child is smaller in the picture and has shorter limbs in metres.
   */
  readonly size: number;
  /**
   * How much bigger the same body looks because it stands nearer (below 1: further away). Scales the picture
   * only: the 3D points are metres from the hips and do not change with distance.
   */
  readonly zoom: number;
  /** How far the whole body stands to the side, as a share of the frame width. Negative is screen left. */
  readonly shift: number;
}

/** Shoulder width of the fixture's standing person, as a share of the frame width. */
export const FIXTURE_SHOULDERS = 0.16;

export function body(name: string, changes: Partial<Omit<Body, "name">>): Body {
  return { name, size: 1, zoom: 1, shift: 0, ...changes };
}

/** The zoom that makes the fixture's shoulders take up `share` of the frame width. */
export function shouldersAt(share: number): number {
  return share / FIXTURE_SHOULDERS;
}

/** One frame as this body would give it. Points pushed outside the picture are left there, as the tracker leaves them. */
export function frameOn(who: Body, frame: PoseFrame): PoseFrame {
  // With no jitter the noisy camera only scales the picture about the body centre.
  const scaled = seenBy(CLEAN, frame, who.size * who.zoom, seeded(1));
  return {
    t: scaled.t,
    image: scaled.image.map((point) => ({ ...point, x: point.x + who.shift })),
    world: scaled.world.map((point) => ({
      ...point,
      x: point.x * who.size,
      y: point.y * who.size,
      z: point.z * who.size,
    })),
  };
}

export function recordingOn(who: Body, frames: readonly PoseFrame[]): PoseFrame[] {
  return frames.map((frame) => frameOn(who, frame));
}

/**
 * Every move the game would read over the recording, in alphabetical order: strikes thrown and defends held,
 * through the real pose input (ON at 0.7), fed one frame at a time the way the fight screen does.
 */
export function fired(frames: readonly PoseFrame[]): string[] {
  const read = createPoseInput(MOVES);
  const seen = new Set<string>();
  let history = EMPTY_HISTORY;
  for (const frame of frames) {
    history = pushFrame(history, frame);
    const input = read(history);
    for (const id of input.held) seen.add(id);
    for (const strike of input.struck) seen.add(strike.move);
  }
  return [...seen].sort();
}
