// What must NOT count on a prompt, whatever the player's shake, sway or the arms coming back from a block:
// random jitter, arms falling or returning, a body swaying about the middle, and a return to centre after a dodge.
import { expect, test } from "vitest";
import type { PoseFrame } from "../../src/core/types";
import { STANDING, READY, bodyFrame, pose, recording } from "../poseFixture";
import type { BodyPose } from "../poseFixture";
import { BOTH_UP, MOVEMENTS, SEEDS, counted, shaken, watch } from "./looseMoves";

const DEFENDS = ["block", "duck", "dodge_left", "dodge_right", "jump"];
const PROMPTED = [...Object.keys(MOVEMENTS), "high_block", "low_block"];

test.each(SEEDS)("seed %i: standing or in the guard for 3 s with 0.1 shoulder widths of random shake counts for no prompted move", (seed) => {
  for (const stance of [STANDING, READY]) {
    const frames = shaken(recording([[stance, 33], [stance, 3000]]), seed, 0.1);
    for (const ask of PROMPTED) {
      const seen = watch(frames, ask, DEFENDS.includes(ask) || ask === "high_block" || ask === "low_block");
      expect(counted(seen, ask), `${ask} from ${stance === STANDING ? "standing" : "ready"}`).toBe(false);
    }
  }
});

test("a small slow real movement still counts through the same shake", () => {
  for (const ask of ["jab", "cross", "double_palm", "block", "hammer_fist"]) {
    expect(counted(watch(shaken(MOVEMENTS[ask] ?? [], 7, 0.05), ask, ask === "block"), ask), ask).toBe(true);
  }
});

// Arms dropping back from a block, the prompt opening the instant the block is met.
const FALL_MS = [150, 300, 500, 800];
const DROP_FROM_BLOCK = (to: BodyPose, ms: number): PoseFrame[] => recording([[BOTH_UP, 400], [BOTH_UP, 500], [to, ms], [to, 600]]);

test.each(FALL_MS)("block then drop over %i ms: no both-arm or punch prompt counts", (ms) => {
  for (const to of [STANDING, READY]) {
    for (const ask of ["double_palm", "spear_thrust", "chain_punch", "cross", "reverse_punch"]) {
      expect(counted(watch(DROP_FROM_BLOCK(to, ms), ask), ask), `${ask} to ${to === STANDING ? "standing" : "ready"}`).toBe(false);
    }
  }
});

test.each(FALL_MS)("block then drop over %i ms: the stake thrust counts no more often than its strict detector", (ms) => {
  for (const to of [STANDING, READY]) {
    const frames = DROP_FROM_BLOCK(to, ms);
    expect(counted(watch(frames, "stake_thrust"), "stake_thrust")).toBe(counted(watch(frames, null), "stake_thrust"));
  }
});

// The body swaying about the middle, and coming back to it.
const sway = (axis: "step" | "drop", amplitude: number): PoseFrame[] =>
  Array.from({ length: 110 }, (_, i) => bodyFrame(i * 33, pose({ [axis]: i < 20 ? 0 : amplitude * Math.sin(((i - 20) * 33 * 2 * Math.PI) / 500) })));

test("swaying 0.1 m side to side every 500 ms, or bobbing 0.075 m, makes no defend count that the strict detector does not already count", () => {
  for (const frames of [sway("step", 0.1), sway("drop", 0.075)]) {
    for (const ask of DEFENDS) expect(counted(watch(frames, ask, true), ask), ask).toBe(counted(watch(frames, null, true), ask));
  }
});

test("a smaller sway (0.06 m, a 0.045 m bob) is under what the strict detector reads, and counts for no defend even when asked", () => {
  for (const frames of [sway("step", 0.06), sway("drop", 0.045)]) {
    for (const ask of DEFENDS) expect(counted(watch(frames, ask, true), ask), ask).toBe(false);
  }
});

test.each([300, 600, 900])("a %i ms return to centre after a held dodge, duck or jump counts for no defend that the held pose did not already", (ms) => {
  for (const away of [pose({ step: 0.3 }), pose({ step: -0.3 }), pose({ drop: 0.3 }), pose({ drop: -0.3 })]) {
    const held = recording([[away, 600], [away, 700]]);
    const back = recording([[away, 600], [away, 700], [STANDING, ms], [STANDING, 600]]);
    for (const ask of DEFENDS) {
      // The prompt opens as the return starts, so only what the return itself adds is counted.
      if (!counted(watch(held, ask, true), ask)) expect(counted(watch(back, ask, true), ask), `${ask} after ${JSON.stringify([away.step, away.drop])}`).toBe(false);
    }
  }
});
