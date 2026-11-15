// The owner asked for rougher defends to count: a real body seen waist-up, sloppy, on a weak camera. Each defend
// is played ideal and in sloppy forms, at the smallest and largest shoulder widths a webcam gives, through the
// real pose input. Each must still be held, and must not set off another defend, the finisher or a god gesture.
// Standing, resting and fidgeting must fire nothing at all.
import { describe, expect, test } from "vitest";
import type { PoseFrame } from "../../src/core/types";
import { JOINT } from "../../src/pose/signals";
import { DEFENDS, GOD_GESTURES, firedIn } from "../helpers/crossFire";
import type { Arm, Key, Pose } from "../helpers/poses";
import { DOWN, GUARD, frameOf, pose, sequence, standing } from "../helpers/poses";
import { CAMERAS, partWay } from "../helpers/roughCamera";

const J = JOINT;
const NOT_A_DEFEND = new Set(["stake_thrust", ...GOD_GESTURES]);

const keys = (...pairs: [number, Pose][]): Key[] => pairs.map(([t, p]) => ({ t, pose: p }));

/** The forearm turned about the elbow in the picture, outward for the left arm (and so for the mirrored right). */
function turned(arm: Arm, degrees: number): Arm {
  const a = (degrees * Math.PI) / 180;
  const dx = arm.wrist[0] - arm.elbow[0];
  const dy = arm.wrist[1] - arm.elbow[1];
  const wrist = [arm.elbow[0] + dx * Math.cos(a) - dy * Math.sin(a), arm.elbow[1] + dx * Math.sin(a) + dy * Math.cos(a)] as const;
  return { ...arm, wrist };
}

/** Hands loosely at the chest: about a third of the way from hanging to a guard. */
const LOOSE = partWay(DOWN, GUARD, 0.35);

/** Held for half a second after a 300 ms move into it. */
const hold = (p: Pose): Key[] => keys([0, pose(DOWN)], [300, p], [800, p]);

/**
 * The seated lean the owner's camera saw: the shoulders move a little and the head a lot further. Built frame by
 * frame, since `pose` moves the head with the shoulders.
 */
function headLean(frames: readonly PoseFrame[], head: { dx: number; dy: number }): PoseFrame[] {
  return frames.map((frame, index) => {
    if (index < 20) return frame;
    const image = frame.image.map((point, joint) => (joint === J.nose ? { ...point, x: point.x + head.dx, y: point.y + head.dy } : point));
    return { ...frame, image };
  });
}

interface Variant {
  readonly name: string;
  readonly frames: PoseFrame[];
}

const MOVE_FRAMES: Record<string, Variant[]> = {
  block: [
    { name: "ideal", frames: sequence(hold(pose(GUARD))) },
    // 60% of the way from a loose guard, where a fighter's hands wait. Measured from arms hanging, 60% puts the
    // hands where the loose guard below already is, and that must fire nothing.
    { name: "60% of the way up from a loose guard", frames: sequence(hold(pose(partWay(LOOSE, GUARD, 0.6)))) },
    { name: "forearms 30 degrees off upright", frames: sequence(hold(pose(turned(GUARD, 30)))) },
    { name: "forearms 30 degrees the other way", frames: sequence(hold(pose(turned(GUARD, -30)))) },
  ],
  duck: [
    { name: "ideal", frames: sequence(hold(pose(DOWN, DOWN, 0, 0.12))) },
    { name: "60% of the drop", frames: sequence(hold(pose(DOWN, DOWN, 0, 0.072))) },
    { name: "seated bend forward, head down", frames: headLean(sequence(hold(pose(DOWN, DOWN, 0, 0.03))), { dx: 0, dy: 0.13 }) },
  ],
  dodge_left: [
    { name: "ideal", frames: sequence(hold(pose(DOWN, DOWN, -0.12, 0))) },
    { name: "60% of the step", frames: sequence(hold(pose(DOWN, DOWN, -0.072, 0))) },
    { name: "seated lean, head further", frames: headLean(sequence(hold(pose(DOWN, DOWN, -0.03, 0))), { dx: -0.07, dy: 0 }) },
  ],
  dodge_right: [
    { name: "ideal", frames: sequence(hold(pose(DOWN, DOWN, 0.12, 0))) },
    { name: "60% of the step", frames: sequence(hold(pose(DOWN, DOWN, 0.072, 0))) },
    { name: "seated lean, head further", frames: headLean(sequence(hold(pose(DOWN, DOWN, 0.03, 0))), { dx: 0.07, dy: 0 }) },
  ],
};

describe("every defend counts when done roughly, and sets off nothing it should not", () => {
  const cases = Object.entries(MOVE_FRAMES).flatMap(([move, variants]) =>
    variants.flatMap((variant) => CAMERAS.map((camera) => ({ move, variant: variant.name, camera: camera.name, frames: camera.see(variant.frames) }))),
  );
  test.each(cases)("$move, $variant, $camera", ({ move, frames }) => {
    const fired = firedIn(frames);
    expect(fired).toContain(move);
    expect(fired.filter((id) => DEFENDS.includes(id) && id !== move)).toEqual([]);
    expect(fired.filter((id) => NOT_A_DEFEND.has(id))).toEqual([]);
  });
});

/** Arms resting on a desk: elbows out and low, forearms lying forward. */
const DESK: Arm = { elbow: [0.36, 0.55], wrist: [0.44, 0.6], elbow3: [-0.28, -0.15, -0.1], wrist3: [-0.12, -0.1, -0.35] };

/** Frames that stand, rest and fidget, with the calibration frames first. */
function idle(make: (i: number) => Pose, ms = 2500): PoseFrame[] {
  const frames: PoseFrame[] = [];
  for (let i = 0; i * 33 <= ms; i++) frames.push(frameOf(i * 33, i < 20 ? pose(DOWN) : make(i)));
  return frames;
}

const IDLE: Record<string, PoseFrame[]> = {
  "standing with the small wobble a person has": standing(2500),
  "arms resting on a desk": idle(() => pose(DESK)),
  "a loose guard, hands at the chest": idle(() => pose(LOOSE)),
  "shifting in the seat": idle((i) => pose(DOWN, DOWN, 0.025 * Math.sin(i / 5), 0.015 * Math.sin(i / 7))),
  "rocking a little on a desk": idle((i) => pose(DESK, DESK, 0.02 * Math.sin(i / 4), 0.01 * Math.cos(i / 6))),
};

describe("standing, resting and fidgeting fire nothing", () => {
  const cases = Object.entries(IDLE).flatMap(([name, frames]) => CAMERAS.map((camera) => ({ name, camera: camera.name, frames: camera.see(frames) })));
  test.each(cases)("$name, $camera", ({ frames }) => {
    expect(firedIn(frames)).toEqual([]);
  });
});
