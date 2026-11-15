// A god gesture set off by accident (issue #33). The combat engine acts on one move the player was not asked for:
// a strike whose id is in POWER_MOVES, thrown while the power meter is full, spends the meter (src/combat/engine.ts).
// tests/ghostVsDetectors.test.ts found that following a move guide's figure sets off some other move for 19 of 26.
// This asks the narrower question: which of those other moves is a god gesture?
//
// Two made-up players, both read through the real pose input (strikes thrown at 0.7), on three cameras:
// - GUIDES: a body that follows each of the 26 guide figures exactly, twice round the loop (tools/guide/body.ts,
//   the same player tests/ghostVsDetectors.test.ts uses for its guide half).
// - DEFENDS: the fixture's person going into a defend in 300 ms, holding it for 2 seconds, and dropping back out in
//   250 ms. Jump cannot be held, so it is a hop and then 2 seconds standing.
// A god gesture's own guide setting off that same gesture is the move asked for, so it is not listed.
//
// The table is pinned. The pins are a measurement, not a requirement: when a detector or a guide changes, measure
// again and write down what it gives. The Markdown table is printed when the file runs.
//
// What this cannot tell: the frames are made up. No real body, no real camera, no tracker noise, and the figure is
// followed exactly and at the guide's own speed, which no person does.
import { describe, expect, test } from "vitest";
import { guideFor } from "../src/coach/guide";
import { POWER_MOVES } from "../src/combat/engine";
import type { PoseFrame } from "../src/core/types";
import { createPoseInput } from "../src/input/poseInput";
import { MOVES } from "../src/moves/registry";
import { EMPTY_HISTORY, pushFrame } from "../src/pose/signals";
import { STAND_FRAMES, following } from "../tools/guide/body";
import { GOD_GOOD } from "./godMoveSequences";
import type { Key, Pose } from "./helpers/poses";
import { DOWN, GUARD, pose, sequence } from "./helpers/poses";
import { CAMERAS } from "./helpers/roughCamera";

const FRAME_MS = 33;
/** Still frames at the start of every recording: the baseline. Nothing can fire in them. */
const STILL_FRAMES = 20;
const HOLD_MS = 2000;
const INTO_MS = 300;
const OUT_MS = 250;
const AFTER_MS = 500;
const LOOPS = 2;

/** The power moves thrown over the frames, in alphabetical order, with the time each was first thrown. */
function powerThrown(frames: readonly PoseFrame[]): Map<string, number> {
  const read = createPoseInput(MOVES);
  const thrown = new Map<string, number>();
  let history = EMPTY_HISTORY;
  for (const frame of frames) {
    history = pushFrame(history, frame);
    for (const strike of read(history).struck) {
      if (POWER_MOVES.has(strike.move) && !thrown.has(strike.move)) thrown.set(strike.move, frame.t);
    }
  }
  return new Map([...thrown].sort(([a], [b]) => a.localeCompare(b)));
}

const IDS = [...MOVES.keys()].sort();
const DEFEND_IDS = IDS.filter((id) => MOVES.get(id)?.kind === "defend");

/**
 * One cell per camera, in the order of CAMERAS: the power moves set off, comma separated, or "" for none.
 * A guide row has one more cell: when the clear camera first reads it, in milliseconds into the loop.
 */
type Cells = readonly string[];

function guideCells(id: string): Cells {
  const def = MOVES.get(id);
  const guide = def && guideFor(def);
  if (!guide) throw new Error(`no guide for ${id}`);
  const frames = following(guide, LOOPS);
  const start = (STAND_FRAMES - 1) * FRAME_MS;
  const cells = CAMERAS.map((camera) => [...powerThrown(camera.see(frames)).keys()].filter((move) => move !== id).join(", "));
  // When it is first thrown, on the clear camera: milliseconds into the guide's loop, which is `loopMs` long.
  const when = [...powerThrown(frames)].filter(([move]) => move !== id).map(([, t]) => `${String(t - start)} of ${String(guide.loopMs)} ms`).join(", ");
  return [...cells, when];
}

const keys = (...pairs: [number, Pose][]): Key[] => pairs.map(([t, p]) => ({ t, pose: p }));
/** Into the pose, held for 2 seconds, back out, and standing a moment after. */
const held = (p: Pose): Key[] =>
  keys([0, pose(DOWN)], [INTO_MS, p], [INTO_MS + HOLD_MS, p], [INTO_MS + HOLD_MS + OUT_MS, pose(DOWN)], [INTO_MS + HOLD_MS + OUT_MS + AFTER_MS, pose(DOWN)]);

/** The same shapes tests/moves/lenientDefends.test.ts calls ideal. */
const HELD: Record<string, Key[]> = {
  block: held(pose(GUARD)),
  dodge_left: held(pose(DOWN, DOWN, -0.12, 0)),
  dodge_right: held(pose(DOWN, DOWN, 0.12, 0)),
  duck: held(pose(DOWN, DOWN, 0, 0.12)),
  jump: [...(GOD_GOOD.jump ?? []), { t: (GOD_GOOD.jump?.at(-1)?.t ?? 0) + HOLD_MS, pose: pose(DOWN) }],
};
/** When the player starts to drop back out of the hold. A hop has no hold to let go of. */
const LET_GO = STILL_FRAMES * FRAME_MS + INTO_MS + HOLD_MS;

/** "thunderbolt" while going in and holding, "thunderbolt (letting go)" when first thrown on the way back out. */
function defendCells(id: string): Cells {
  const frames = sequence(HELD[id] ?? []);
  return CAMERAS.map((camera) =>
    [...powerThrown(camera.see(frames))].map(([move, t]) => (id !== "jump" && t > LET_GO ? `${move} (letting go)` : move)).join(", "),
  );
}

const GUIDE_ROWS = new Map(IDS.map((id) => [id, guideCells(id)]));
const DEFEND_ROWS = new Map(DEFEND_IDS.map((id) => [id, defendCells(id)]));

const NONE: Cells = ["", "", "", ""];
/**
 * The truth today: the power moves each guide's figure sets off, per camera (clear, waist-up far, waist-up near),
 * then when the clear camera first reads it.
 */
const GUIDE_EXPECTED: Record<string, Cells> = {
  aegis_push: NONE,
  block: ["thunderbolt", "thunderbolt", "thunderbolt", "858 of 960 ms"],
  chain_punch: ["trident_sweep", "trident_sweep", "trident_sweep", "594 of 960 ms"],
  cross: NONE,
  dodge_left: ["swift_dash", "swift_dash", "swift_dash", "231 of 960 ms"],
  dodge_right: ["swift_dash", "swift_dash", "swift_dash", "231 of 960 ms"],
  double_palm: ["aegis_push", "aegis_push", "aegis_push", "231 of 960 ms"],
  duck: NONE,
  front_kick: NONE,
  hammer_fist: ["thunderbolt", "thunderbolt", "thunderbolt", "429 of 960 ms"],
  hook: ["thunderbolt", "thunderbolt", "thunderbolt", "891 of 960 ms"],
  jab: NONE,
  jump: NONE,
  knee: NONE,
  knife_hand: NONE,
  moon_arrow: NONE,
  overhead_strike: ["thunderbolt", "thunderbolt", "thunderbolt", "429 of 960 ms"],
  reverse_punch: NONE,
  rising_palm: ["thunderbolt", "thunderbolt", "thunderbolt", "924 of 960 ms"],
  spear_thrust: NONE,
  stake_thrust: NONE,
  sun_burst: ["thunderbolt", "thunderbolt", "thunderbolt", "891 of 960 ms"],
  swift_dash: NONE,
  thunderbolt: NONE,
  trident_sweep: NONE,
  uppercut: ["thunderbolt", "thunderbolt", "thunderbolt", "924 of 960 ms"],
};

/** The truth today for each defend held 2 seconds (jump: a hop, then 2 seconds standing). */
const DASH_OUT = "swift_dash (letting go)";
const DEFEND_EXPECTED: Record<string, Cells> = {
  block: ["", "", ""],
  dodge_left: [DASH_OUT, DASH_OUT, DASH_OUT],
  dodge_right: [DASH_OUT, DASH_OUT, DASH_OUT],
  duck: ["", "", ""],
  jump: ["", "", ""],
};

function markdown(title: string, rows: ReadonlyMap<string, Cells>, extra: readonly string[] = []): string {
  const head = `| ${[title, ...CAMERAS.map((camera) => camera.name), ...extra].join(" | ")} |`;
  const rule = `|${" --- |".repeat(CAMERAS.length + 1 + extra.length)}`;
  const lines = [...rows].map(([id, cells]) => `| ${id} | ${cells.map((cell) => cell || "none").join(" | ")} |`);
  return [head, rule, ...lines].join("\n");
}

const print = (text: string): void => {
  (globalThis as { process?: { stdout?: { write(text: string): void } } }).process?.stdout?.write(`\n${text}\n`);
};

describe("a god gesture set off by following a move guide's figure", () => {
  test("the table (printed)", () => {
    print(markdown("guide followed twice round", GUIDE_ROWS, ["first thrown, clear camera"]));
    expect(GUIDE_ROWS.size).toBe(26);
  });
  test("every guide is pinned", () => {
    expect(Object.keys(GUIDE_EXPECTED).sort()).toEqual(IDS);
  });
  test.each(IDS)("%s", (id) => {
    expect(GUIDE_ROWS.get(id)).toEqual(GUIDE_EXPECTED[id]);
  });
  test("11 of the 26 figures set off a god gesture that was not asked for, all of them the first time round", () => {
    const some = IDS.filter((id) => GUIDE_ROWS.get(id)?.some((cell) => cell !== ""));
    expect(some).toHaveLength(11);
    // Three of them are defends, which a fight asks for while the meter is filling.
    expect(some.filter((id) => DEFEND_IDS.includes(id))).toEqual(["block", "dodge_left", "dodge_right"]);
    // One god gesture's guide sets off a different god gesture: sun_burst reads as thunderbolt too.
    expect(some.filter((id) => POWER_MOVES.has(id))).toEqual(["sun_burst"]);
  });
});

describe("a god gesture set off by holding a defend for 2 seconds", () => {
  test("the table (printed)", () => {
    print(markdown("defend held 2 s", DEFEND_ROWS));
    expect(DEFEND_IDS).toEqual(["block", "dodge_left", "dodge_right", "duck", "jump"]);
  });
  test("every defend is pinned", () => {
    expect(Object.keys(DEFEND_EXPECTED).sort()).toEqual(DEFEND_IDS);
    expect(Object.keys(HELD).sort()).toEqual(DEFEND_IDS);
  });
  test.each(DEFEND_IDS)("%s", (id) => {
    expect(DEFEND_ROWS.get(id)).toEqual(DEFEND_EXPECTED[id]);
  });
});
