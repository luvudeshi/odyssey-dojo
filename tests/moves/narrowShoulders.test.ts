// Adult arms on narrow shoulders (issue #178). tests/moves/anyBody.test.ts scales the whole body evenly, so
// shoulder width and arm length always keep the fixture's ratio there. Here the shoulders are 0.34 m and 0.30 m
// wide with 0.55 m and 0.60 m arms, and the steepest jab and cross that still count are pinned.
//
// The punch: hands up in a guard, then one arm snapped straight, aimed a given number of degrees above or below
// level. Every replay goes through the real pose input, so "counts" means what the game means.
//
// What sets the numbers (src/moves/handSignals.ts, the lenient strikes of the lenient-strikes PR): an arm is out
// while its upper arm is lifted between PUNCH_LIFT (30) and 140 degrees from hanging, so a straight arm counts
// from 59 degrees below level (56 with 0.60 m arms) to at least 49 above on every body here. The fist's height band (PUNCH_HEIGHT torso
// lengths) is wider than that, and the over-the-head check is measured on the same 3D ruler, so neither shoulder
// width nor arm length moves the angles. The bent-elbow reading (LIFT_BENT) waits for the upper arm to stop
// rising, or a straight arm on its way over the head would count up to about 90 degrees. Before, the band was SHOULDER_HEIGHT (0.3 m on the 0.5 m torso) and the
// pins were 45 up / 36 down with 0.55 m arms and 41 up / 32 down with 0.60 m arms.
import { describe, expect, test } from "vitest";
import type { PoseFrame } from "../../src/core/types";
import { baselineOf } from "../../src/pose/signals";
import type { Build } from "../helpers/anyBody";
import { CALIBRATION_FRAMES, FIXTURE_BUILD, builtFrame, builtRecording, fired } from "../helpers/anyBody";
import type { BodyPose, Vec3 } from "../poseFixture";
import { LEFT_OUT, READY, STANDING, bodyFrame, pose } from "../poseFixture";

type Side = "left" | "right";

/** Straight at the camera, a touch inward as LEFT_OUT and RIGHT_OUT are, tipped `degreesUp` above level. */
function aim(side: Side, degreesUp: number): Vec3 {
  const angle = (degreesUp * Math.PI) / 180;
  const inward = side === "left" ? 0.0995 : -0.0995;
  return [inward * Math.cos(angle), -Math.sin(angle), -0.995 * Math.cos(angle)];
}

/** The guard with one arm straight out along `aim`. */
function punchAt(side: Side, degreesUp: number): BodyPose {
  const out = aim(side, degreesUp);
  return pose(side === "left" ? { leftUpper: out, leftFore: out } : { rightUpper: out, rightFore: out }, READY);
}

/** Hands up, a wait long enough that raising them is forgotten, then the punch in 130 ms and held. */
function punchOn(build: Build, side: Side, degreesUp: number): PoseFrame[] {
  const out = punchAt(side, degreesUp);
  return builtRecording(build, [[READY, 300], [READY, 600], [out, 130], [out, 200]]);
}

interface Case {
  readonly name: string;
  readonly build: Build;
  /** The steepest punch that counts, in whole degrees above and below level. */
  readonly up: number;
  readonly down: number;
}

const FIXTURE: Case = { name: "0.40 m shoulders, 0.55 m arms (the fixture)", build: FIXTURE_BUILD, up: 49, down: 59 };
const NARROW: readonly Case[] = [
  { name: "0.34 m shoulders, 0.55 m arms", build: { shoulders: 0.34, arm: 0.55, torso: 0.5 }, up: 49, down: 59 },
  { name: "0.30 m shoulders, 0.55 m arms", build: { shoulders: 0.3, arm: 0.55, torso: 0.5 }, up: 49, down: 59 },
  { name: "0.34 m shoulders, 0.60 m arms", build: { shoulders: 0.34, arm: 0.6, torso: 0.5 }, up: 49, down: 56 },
  { name: "0.30 m shoulders, 0.60 m arms", build: { shoulders: 0.3, arm: 0.6, torso: 0.5 }, up: 49, down: 56 },
];
const PUNCHES: readonly (readonly [string, Side])[] = [["jab", "left"], ["cross", "right"]];
/** "Within a few degrees" of the fixture's angles. */
const FEW = 4;
/** How far past the steepest punch that counts the sweep goes on looking for anything that fires. */
const BEYOND = 20;

test("the helper draws the fixture's own body when given the fixture's build", () => {
  for (const at of [STANDING, READY, pose(LEFT_OUT, READY), punchAt("right", 30)]) {
    const got = builtFrame(FIXTURE_BUILD, 99, at);
    const want = bodyFrame(99, at);
    for (const [index, point] of want.world.entries()) {
      expect(got.world[index]?.x).toBeCloseTo(point.x, 10);
      expect(got.world[index]?.y).toBeCloseTo(point.y, 10);
      expect(got.world[index]?.z).toBeCloseTo(point.z, 10);
      expect(got.image[index]?.x).toBeCloseTo(want.image[index]?.x ?? NaN, 10);
      expect(got.image[index]?.y).toBeCloseTo(want.image[index]?.y ?? NaN, 10);
    }
  }
});

test.each(NARROW)("$name: the baseline reads the narrow shoulders and the same torso", ({ build }) => {
  const baseline = baselineOf(builtRecording(build, []).slice(0, CALIBRATION_FRAMES));
  expect(baseline.shoulderWidth3d).toBeCloseTo(build.shoulders, 10);
  expect(baseline.torsoLength3d).toBeCloseTo(0.5, 10);
  // The picture agrees with the 3D body: 0.4 of the frame width per metre.
  expect(baseline.shoulderWidth).toBeCloseTo(build.shoulders * 0.4, 10);
});

describe.each([FIXTURE, ...NARROW])("$name", ({ build, up, down }) => {
  // Left and right are distinct: the left fist is the jab alone, the right fist the cross alone.
  test.each(PUNCHES)("a %s counts from level to the pinned angles, as itself and nothing else", (move, side) => {
    for (let degrees = -down; degrees <= up; degrees++) {
      expect(fired(punchOn(build, side, degrees)), `${String(degrees)} degrees above level`).toEqual([move]);
    }
  });

  // Aimed up there is no steepest limit any more: a fist thrown up toward a camera above it counts, and so does a
  // straight arm on its way overhead (it is a rough punch on the way). Aimed down the arm must still be lifted.
  test.each(PUNCHES)("a %s any steeper down does not count, and nothing else fires in its place", (_move, side) => {
    for (let past = 1; past <= BEYOND; past++) {
      expect(fired(punchOn(build, side, -down - past)), `${String(down + past)} degrees below level`).toEqual([]);
    }
  });

  test("the angles are within a few degrees of the fixture's", () => {
    expect(Math.abs(up - FIXTURE.up)).toBeLessThanOrEqual(FEW);
    expect(Math.abs(down - FIXTURE.down)).toBeLessThanOrEqual(FEW);
  });

  test("standing, and waiting with the hands up, fire nothing", () => {
    expect(fired(builtRecording(build, [[STANDING, 1000]]))).toEqual([]);
    expect(fired(builtRecording(build, [[READY, 300], [READY, 1500]]))).toEqual([]);
  });
});

test("shoulder width alone does not move the angles: every 0.55 m arm matches the fixture exactly", () => {
  for (const { build, up, down } of NARROW.filter((narrow) => narrow.build.arm === FIXTURE.build.arm)) {
    expect([build.shoulders, up, down]).toEqual([build.shoulders, FIXTURE.up, FIXTURE.down]);
  }
});
