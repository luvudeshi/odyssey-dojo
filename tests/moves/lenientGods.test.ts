// The owner asked for the finisher and the six god gestures to take rough attempts too. Each is played ideal and
// done short, on a clear camera and on a waist-up one with arm joints at visibility 0.35 and no hips or legs, at
// shoulder widths 0.15 and 0.6, through the real pose input. Each must still be thrown, and must not set off a
// defend or another god gesture. tests/moves/crossFire.test.ts keeps every strike's ideal from setting one off.
import { describe, expect, test } from "vitest";
import { DEFENDS, GOD_GESTURES, PERFORMANCES, firedIn } from "../helpers/crossFire";
import type { Key, Pose } from "../helpers/poses";
import { CHOP, DOWN, OVERHEAD, STAKE_CHEST, STAKE_DOWN, pose, sequence } from "../helpers/poses";
import { CAMERAS, partWay } from "../helpers/roughCamera";
import { AT_CHEST, DRAWN, GOD_GOOD, LOOSED, PUSHED, SWEEP_ACROSS, SWEEP_OUT, TOGETHER, WIDE } from "../godMoveSequences";

const keys = (...pairs: [number, Pose][]): Key[] => pairs.map(([t, p]) => ({ t, pose: p }));
/** 60% of the way from where a gesture starts to where it ends. */
const SHORT = 0.6;

const VARIANTS: Record<string, Record<string, Key[]>> = {
  stake_thrust: {
    ideal: PERFORMANCES.stake_thrust ?? [],
    "driven 60% of the way down": keys([0, pose(DOWN)], [300, pose(STAKE_CHEST)], [500, pose(partWay(STAKE_CHEST, STAKE_DOWN, SHORT))]),
  },
  thunderbolt: {
    ideal: GOD_GOOD.thunderbolt ?? [],
    "thrown down slowly, 600 ms after the hand was up": keys([0, pose(DOWN)], [300, pose(DOWN, OVERHEAD)], [500, pose(DOWN, OVERHEAD)], [900, pose(DOWN, CHOP)]),
  },
  trident_sweep: {
    ideal: GOD_GOOD.trident_sweep ?? [],
    "swept 60% of the way across": keys(
      [0, pose(DOWN)], [300, pose(SWEEP_OUT, SWEEP_ACROSS)], [400, pose(SWEEP_OUT, SWEEP_ACROSS)],
      [600, pose(partWay(SWEEP_OUT, SWEEP_ACROSS, SHORT), partWay(SWEEP_ACROSS, SWEEP_OUT, SHORT))],
    ),
  },
  aegis_push: {
    ideal: GOD_GOOD.aegis_push ?? [],
    "pushed 60% of the way out": keys([0, pose(DOWN)], [250, pose(AT_CHEST)], [400, pose(partWay(AT_CHEST, PUSHED, SHORT))]),
  },
  swift_dash: {
    ideal: GOD_GOOD.swift_dash ?? [],
  },
  moon_arrow: {
    ideal: GOD_GOOD.moon_arrow ?? [],
    "a quick draw, held a tenth of a second": keys([0, pose(DOWN)], [300, pose(WIDE, DRAWN)], [430, pose(WIDE, DRAWN)], [530, pose(WIDE, LOOSED)]),
  },
  sun_burst: {
    ideal: GOD_GOOD.sun_burst ?? [],
    "flung 60% of the way wide": keys([0, pose(DOWN)], [250, pose(TOGETHER)], [400, pose(TOGETHER)], [550, pose(partWay(TOGETHER, WIDE, SHORT))]),
  },
};

const NOT_THIS = (move: string) => (id: string) => id !== move && (DEFENDS.includes(id) || GOD_GESTURES.includes(id) || id === "stake_thrust");
/**
 * Pairs the cross-fire table already accepts by design (docs/cross-fire.md): a dash is a step, and a step is a
 * dodge; the stake's grip at the chest is the push's start, and its arms end straight.
 */
const ACCEPTED: Record<string, readonly string[]> = { swift_dash: ["dodge_right"], stake_thrust: ["aegis_push"] };

describe("the finisher and every god gesture count when done roughly, and set off no defend or other gesture", () => {
  const cases = Object.entries(VARIANTS).flatMap(([move, variants]) =>
    Object.entries(variants).flatMap(([variant, steps]) =>
      CAMERAS.map((camera) => ({ move, variant, camera: camera.name, frames: camera.see(sequence(steps)) }))),
  );
  test.each(cases)("$move, $variant, $camera", ({ move, frames }) => {
    const fired = firedIn(frames);
    expect(fired).toContain(move);
    const accepted = ACCEPTED[move] ?? [];
    expect(fired.filter(NOT_THIS(move)).filter((id) => !accepted.includes(id))).toEqual([]);
  });
});
