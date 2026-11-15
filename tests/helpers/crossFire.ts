// Every move done right once, at three body sizes, replayed the way the game reads a webcam, to see which OTHER
// moves fire in the same window (issue #191). tests/moves/crossFire.test.ts asserts on the result and
// docs/cross-fire.md holds the table this file draws.
import type { PoseFrame } from "../../src/core/types";
import { MOVES } from "../../src/moves/registry";
import { baselineOf } from "../../src/pose/signals";
import { STYLES } from "../../src/styles/registry";
import { replay } from "../../tools/recorder/replay";
import { GOD_GOOD } from "../godMoveSequences";
import type { Body } from "./anyBody";
import { CALIBRATION_FRAMES, body, recordingOn, shouldersAt } from "./anyBody";
import type { Arm, Key, Leg } from "./poses";
import {
  ACROSS, CHOP, COCKED, DOWN, GUARD, HIP, HOOK_IN, HOOK_OUT, LATERAL, LEG_CHAMBER, LEG_DOWN, LEG_KICK, LEG_KNEE,
  OVERHEAD, PALM, PUNCH, STAKE_CHEST, STAKE_DOWN, pose, sequence, withLegs,
} from "./poses";

const both = (arm: Arm) => pose(arm, arm);
const left = (arm: Arm) => pose(arm, DOWN);
const right = (arm: Arm) => pose(DOWN, arm);
const keys = (...pairs: [number, ReturnType<typeof pose>][]): Key[] => pairs.map(([t, p]) => ({ t, pose: p }));
const leg = (shape: Leg = LEG_DOWN) => withLegs(pose(DOWN), LEG_DOWN, shape);

/**
 * Each move done right: the same performances as tests/coachPractice.test.ts and tests/moves/detectors.test.ts,
 * which do not export their tables.
 */
export const PERFORMANCES: Record<string, Key[]> = {
  jab: keys([0, pose(DOWN)], [150, left(COCKED)], [300, left(PUNCH)]),
  cross: keys([0, pose(DOWN)], [150, right(COCKED)], [300, right(PUNCH)]),
  hook: keys([0, left(HOOK_OUT)], [100, left(HOOK_OUT)], [250, left(HOOK_IN)]),
  uppercut: keys([0, pose(DOWN)], [250, right(GUARD)]),
  rising_palm: keys([0, pose(DOWN)], [250, left(GUARD)]),
  hammer_fist: keys([0, pose(DOWN)], [300, left(OVERHEAD)], [500, left(CHOP)]),
  overhead_strike: keys([0, pose(DOWN)], [300, right(OVERHEAD)], [500, right(CHOP)]),
  knife_hand: keys([0, pose(DOWN)], [200, right(ACROSS)], [450, right(LATERAL)]),
  reverse_punch: keys([0, pose(DOWN)], [150, pose(HIP, COCKED)], [300, pose(HIP, PUNCH)]),
  spear_thrust: keys([0, pose(DOWN)], [150, both(COCKED)], [300, both(PUNCH)]),
  double_palm: keys([0, pose(DOWN)], [150, both(COCKED)], [300, both(PALM)]),
  chain_punch: keys(
    [0, pose(DOWN)], [100, left(COCKED)], [250, left(PUNCH)], [350, right(COCKED)], [500, right(PUNCH)],
  ),
  stake_thrust: keys([0, pose(DOWN)], [300, both(STAKE_CHEST)], [500, both(STAKE_DOWN)]),
  front_kick: keys([0, leg()], [100, leg()], [300, leg(LEG_CHAMBER)], [450, leg(LEG_KICK)]),
  knee: keys([0, leg()], [100, leg()], [300, leg(LEG_KNEE)], [500, leg(LEG_KNEE)]),
  block: keys([0, pose(DOWN)], [250, both(GUARD)], [450, both(GUARD)]),
  duck: keys([0, pose(DOWN)], [300, pose(DOWN, DOWN, 0, 0.12)], [500, pose(DOWN, DOWN, 0, 0.12)]),
  dodge_left: keys([0, pose(DOWN)], [300, pose(DOWN, DOWN, -0.12, 0)], [500, pose(DOWN, DOWN, -0.12, 0)]),
  dodge_right: keys([0, pose(DOWN)], [300, pose(DOWN, DOWN, 0.12, 0)], [500, pose(DOWN, DOWN, 0.12, 0)]),
  ...GOD_GOOD,
};

/**
 * Three body sizes (tests/helpers/anyBody.ts): a child, the fixture's adult, and a tall adult who stands back far
 * enough for the feet to stay in the picture, so the kicks can be read on all three.
 */
export const SIZES: readonly Body[] = [
  body("child (0.6x)", { size: 0.6 }),
  body("adult (1x)", {}),
  body("tall (1.4x, standing back)", { size: 1.4, zoom: shouldersAt(0.12) / 1.4 }),
];
/** One letter per size, for the table. */
export const SIZE_LETTERS = ["c", "a", "t"] as const;

export const DEFENDS: readonly string[] = ["block", "duck", "dodge_left", "dodge_right"];
export const GOD_GESTURES: readonly string[] = [
  "thunderbolt", "trident_sweep", "aegis_push", "swift_dash", "moon_arrow", "sun_burst",
];
/** Row and column order of the table: each style's strikes, the defends, the god gestures, then the rest. */
export const ORDER: readonly string[] = (() => {
  const first = [...STYLES.flatMap((style) => [...style.strikes]), ...DEFENDS, ...GOD_GESTURES];
  return [...new Set([...first, ...[...MOVES.keys()].sort()])];
})();

/**
 * Every move the game reads over the frames, in alphabetical order. The baseline is taken from the standing
 * frames, as calibration does, and the recording goes through tools/recorder/replay.ts: strikes thrown and
 * defends held at 0.7, through the real pose input.
 */
export function firedIn(frames: readonly PoseFrame[]): string[] {
  const baseline = baselineOf(frames.slice(0, CALIBRATION_FRAMES));
  const result = replay({ move: "", person: "made up", n: 1, baseline, frames }, MOVES);
  return [...new Set([...result.strikes, ...result.held])].sort();
}

/** What the game reads when `who` does the move right. */
export function performed(id: string, who: Body): string[] {
  return firedIn(recordingOn(who, sequence(PERFORMANCES[id] ?? [])));
}

/** For each move done right: every move that fired, and at which of the three sizes (indexes into SIZES). */
export type CrossFire = ReadonlyMap<string, ReadonlyMap<string, readonly number[]>>;

export function crossFire(): CrossFire {
  const table = new Map<string, Map<string, number[]>>();
  for (const done of ORDER) {
    const row = new Map<string, number[]>();
    SIZES.forEach((who, index) => {
      for (const seen of performed(done, who)) row.set(seen, [...(row.get(seen) ?? []), index]);
    });
    table.set(done, row);
  }
  return table;
}

/** "jab>cross" for every move that fired on another move's performance, in table order. */
export function pairsOf(table: CrossFire): string[] {
  return ORDER.flatMap((done) => ORDER.filter((seen) => seen !== done && table.get(done)?.has(seen)).map((seen) => `${done}>${seen}`));
}

/**
 * The pairs the issue asks to be clean: both moves can be asked of one player in one fight, which is one style's
 * strikes with the four defends and the six god gestures.
 */
export function inScope(pair: string): boolean {
  const [done = "", seen = ""] = pair.split(">");
  return STYLES.some((style) => {
    const set = [...style.strikes, ...DEFENDS, ...GOD_GESTURES];
    return set.includes(done) && set.includes(seen);
  });
}

/**
 * The table as Markdown. Rows are the move done, columns the move read (numbered, to fit a page). A cell holds
 * the sizes at which it fired: c child, a adult, t tall; a dot is none. The diagonal is the move itself.
 */
export function markdown(table: CrossFire): string {
  const cell = (done: string, seen: string): string => {
    const sizes = table.get(done)?.get(seen) ?? [];
    return sizes.length === 0 ? "." : sizes.map((index) => SIZE_LETTERS[index] ?? "?").join("");
  };
  const head = `| done \\ read | ${ORDER.map((_, index) => String(index + 1)).join(" | ")} |`;
  const rule = `|---|${ORDER.map(() => "---").join("|")}|`;
  const rows = ORDER.map((done, index) => `| ${String(index + 1)} ${done} | ${ORDER.map((seen) => cell(done, seen)).join(" | ")} |`);
  return [head, rule, ...rows].join("\n");
}
