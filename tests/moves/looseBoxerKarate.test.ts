// Cross, hook, uppercut, reverse punch, knife hand and hammer fist, asked for: the right limb going roughly the right
// way counts, at any size or speed. The same movement does not count unasked, and the wrong side or way does not count.
import { expect, test } from "vitest";
import type { PoseFrame, PoseHistory } from "../../src/core/types";
import { createPoseInput } from "../../src/input/poseInput";
import { MOVES } from "../../src/moves/registry";
import { EMPTY_HISTORY, pushFrame } from "../../src/pose/signals";
import { LEFT_OUT, READY, RIGHT_OUT, STANDING, blend, pose, recording } from "../poseFixture";
import type { BodyPose } from "../poseFixture";
import { SEEDS, shaken } from "./looseMoves";

/** Every move struck at each frame, as the fight reads the pose when the prompt is `ask` from the first frame on. */
function struck(frames: readonly PoseFrame[], ask: string | null): Set<string> {
  const read = createPoseInput(MOVES);
  let history: PoseHistory = EMPTY_HISTORY;
  const seen = new Set<string>();
  for (const frame of frames) {
    history = pushFrame(history, frame);
    if (frame.t < 20 * 33 + 600) continue;
    for (const s of read(history, ask).struck) seen.add(s.move);
  }
  return seen;
}

/** The guard for 600 ms, then a slow 500 ms move toward `to` (`share` of the way), held 400 ms. */
function slow(from: BodyPose, to: BodyPose, share: number): PoseFrame[] {
  const end = blend(from, to, share);
  return recording([[from, 600], [from, 300], [end, 500], [end, 400]]);
}

const rightUp = { rightUpper: [0.3, 0.1, -0.2], rightFore: [0, -1, -0.1] } as const;
const leftUp = { leftUpper: [-0.3, 0.1, -0.2], leftFore: [0, -1, -0.1] } as const;
const rightAcross = { rightUpper: [-0.2, 0.5, -0.5], rightFore: [-1, -0.1, -0.2] } as const;
const leftAcross = { leftUpper: [0.2, 0.5, -0.5], leftFore: [1, -0.1, -0.2] } as const;
const rightOut = { rightUpper: [1, 0.1, 0], rightFore: [1, 0, 0] } as const;
const leftOut = { leftUpper: [-1, 0.1, 0], leftFore: [-1, 0, 0] } as const;
const rightDown = { rightUpper: [0.07, 1, 0], rightFore: [0, 1, 0] } as const;
const leftDown = { leftUpper: [-0.07, 1, 0], leftFore: [0, 1, 0] } as const;

interface Case {
  readonly id: string;
  /** Rough versions of the move, from the guard, with how far along the way they go. */
  readonly rough: readonly (readonly [Partial<BodyPose>, number])[];
  /** Movements that must not count when this move is asked. */
  readonly wrong: Record<string, Partial<BodyPose>>;
}

const CASES: readonly Case[] = [
  {
    id: "cross", rough: [[RIGHT_OUT, 0.4], [RIGHT_OUT, 1]],
    wrong: { "left arm out": LEFT_OUT, "right hand up": rightUp, "right hand dropped": rightDown },
  },
  {
    id: "reverse_punch", rough: [[RIGHT_OUT, 0.4], [RIGHT_OUT, 1]],
    wrong: { "left arm out": LEFT_OUT, "right hand up": rightUp, "right hand dropped": rightDown },
  },
  {
    id: "hook", rough: [[leftAcross, 1], [rightAcross, 1], [rightAcross, 0.6]],
    wrong: { "left arm out": LEFT_OUT, "right arm out": RIGHT_OUT, "right hand up": rightUp, "left hand to the side": leftOut, "right hand to the side": rightOut },
  },
  {
    id: "uppercut", rough: [[rightUp, 1], [rightUp, 0.6]],
    wrong: { "left hand up": leftUp, "right arm out": RIGHT_OUT, "right hand dropped": rightDown, "right hand to the side": rightOut },
  },
  {
    id: "knife_hand", rough: [[rightOut, 1], [rightOut, 0.4]],
    wrong: { "left hand to the side": leftOut, "right hand across": rightAcross, "right arm out": RIGHT_OUT, "right hand up": rightUp },
  },
  {
    id: "hammer_fist", rough: [[leftDown, 1], [leftDown, 0.6]],
    wrong: { "right hand dropped": rightDown, "left hand up": leftUp, "left arm out": LEFT_OUT, "left hand to the side": leftOut },
  },
];

for (const { id, rough, wrong } of CASES) {
  test(`${id}: a rough, small, slow version counts when asked (a), not unasked or on another prompt (b)`, () => {
    for (const [change, share] of rough) {
      const frames = slow(READY, pose(change, READY), share);
      expect(struck(frames, id), `${id} ${share}`).toContain(id);
      // A full-size move is strict enough to count unasked; only the small ones show the loose rule is gated by the prompt.
      if (share < 1) {
        expect(struck(frames, null)).not.toContain(id);
        expect(struck(frames, "block")).not.toContain(id);
      }
    }
  });

  test(`${id}: the wrong side or the wrong way does not count when asked (c)`, () => {
    for (const [name, change] of Object.entries(wrong)) {
      expect(struck(slow(READY, pose(change, READY), 1), id), name).not.toContain(id);
    }
  });

  test.each(SEEDS)(`${id}: standing still with random shake of a tenth of a shoulder width does not count (d), seed %i`, (seed) => {
    for (const stance of [READY, STANDING]) expect(struck(shaken(recording([[stance, 33], [stance, 3000]]), seed, 0.1), id)).not.toContain(id);
  });
}
