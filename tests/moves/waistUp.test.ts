// The waist-up table (issue #220): every move's correct performance read with the hips and legs unseen, and the
// four defends at a seated framing. The results are pinned as they are today, so the day a detector starts needing
// a hip, or a kick starts counting without legs, this file says so. docs/waist-up.md holds the tables.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { legsVisible } from "../../src/moves/legSignals";
import { MOVES } from "../../src/moves/registry";
import { DEFENDS, ORDER, PERFORMANCES } from "../helpers/crossFire";
import { sequence } from "../helpers/poses";
import {
  LEGS_IN_VIEW, LOWER_FIRST, LOWER_LAST, SEATED_SHOULDER_Y, SEATED_WIDTH, SIZE_PERFORMED, SIZE_SMALL, TRIP_BOTTOM,
  TRIP_CENTRE, TRIP_SIDE, UNSEEN, frozenBelow, seated, seatedMarkdown, seatedTable, unseenBelow, waistUpMarkdown,
  waistUpTable,
} from "../helpers/waistUp";
import { JOINT, shoulderCenter, shoulderWidth } from "../../src/pose/signals";

const TABLE = waistUpTable();
const SEATED = seatedTable();
const DOC = readFileSync("docs/waist-up.md", "utf8").replace(/\r\n/g, "\n");

/** The moves a waist-up player cannot do: the two that read the legs. */
const NEED_LEGS = ["front_kick", "knee"];

describe("the frames a waist-up camera gives", () => {
  const frames = sequence(PERFORMANCES.front_kick ?? []);
  const lower = Array.from({ length: LOWER_LAST - LOWER_FIRST + 1 }, (_, index) => LOWER_FIRST + index);

  test("landmarks 23 to 32 are unseen in the picture and on the 3D body, and nothing else changes", () => {
    const hidden = unseenBelow(frames);
    hidden.forEach((frame, at) => {
      const before = frames[at];
      frame.image.forEach((point, index) => {
        const was = before?.image[index];
        expect(point).toEqual(lower.includes(index) ? { ...was, visibility: UNSEEN } : was);
      });
      for (const index of lower) expect(frame.world[index]?.visibility).toBe(UNSEEN);
    });
    expect(hidden.some(legsVisible)).toBe(false);
    expect(frames.some(legsVisible)).toBe(true);
  });

  test("frozen, they also stay where they were while standing, through the whole kick", () => {
    const held = frozenBelow(frames);
    const first = frames[0];
    for (const frame of held) {
      for (const index of lower) {
        expect(frame.image[index]).toEqual({ ...first?.image[index], visibility: UNSEEN });
        expect(frame.world[index]).toEqual({ ...first?.world[index], visibility: UNSEEN });
      }
    }
    // The kicking foot moved in the performance itself.
    expect(frames.at(-1)?.image[JOINT.rightAnkle]).not.toEqual(first?.image[JOINT.rightAnkle]);
  });

  test("seated, the shoulders are 0.6 of the picture wide and the hips are below it and unseen", () => {
    const close = seated(sequence(PERFORMANCES.block ?? []));
    const first = close[0];
    expect(first).toBeDefined();
    if (!first) return;
    expect(shoulderWidth(first)).toBeCloseTo(SEATED_WIDTH, 10);
    expect(shoulderCenter(first).x).toBeCloseTo(0.5, 10);
    expect(shoulderCenter(first).y).toBeCloseTo(SEATED_SHOULDER_Y, 10);
    for (const index of [JOINT.leftHip, JOINT.rightHip]) {
      expect(first.image[index]?.visibility).toBe(UNSEEN);
      expect(first.image[index]?.y).toBeGreaterThan(1);
    }
    // The head is still in the picture.
    expect(first.image[JOINT.nose]?.y).toBeGreaterThan(0);
  });
});

test("the table has every move in the registry, once", () => {
  expect(TABLE.map((row) => row.move)).toEqual(ORDER);
  expect(TABLE.map((row) => row.move).sort()).toEqual([...MOVES.keys()].sort());
});

test("prints both tables, and docs/waist-up.md holds the same ones", () => {
  const moves = waistUpMarkdown(TABLE);
  const defends = seatedMarkdown(SEATED);
  process.stdout.write(`\n${moves}\n\n${defends}\n\n`);
  expect(DOC).toContain(moves);
  expect(DOC).toContain(defends);
});

test.each(ORDER)("%s counts on its own performance with the whole body in view", (id) => {
  expect(TABLE.find((row) => row.move === id)?.full.counts).toBe(true);
});

describe("waist up: hips and legs unseen, and unseen and frozen", () => {
  test("the moves that cannot count are the two kicks, in both variants", () => {
    expect(TABLE.filter((row) => !row.unseen.counts).map((row) => row.move)).toEqual(NEED_LEGS);
    expect(TABLE.filter((row) => !row.frozen.counts).map((row) => row.move)).toEqual(NEED_LEGS);
  });

  test.each(NEED_LEGS)("%s reads nothing at all, and what fails is the legs-in-view check", (id) => {
    const row = TABLE.find((each) => each.move === id);
    expect(row?.unseen.peak).toBe(0);
    expect(row?.frozen.peak).toBe(0);
    expect(row?.fails).toBe(LEGS_IN_VIEW);
  });

  test.each(ORDER.filter((id) => !NEED_LEGS.includes(id)))("%s counts as surely as with the whole body", (id) => {
    const row = TABLE.find((each) => each.move === id);
    expect(row?.fails).toBeNull();
    expect(row?.unseen).toEqual(row?.full);
    expect(row?.frozen).toEqual(row?.full);
  });
});

describe("the four defends, seated: shoulders 0.6 of the picture wide, hips not visible", () => {
  const row = (id: string, size: string) => SEATED.find((each) => each.move === id && each.size === size);

  test("all four are in the table, and every row counts: no defend's detector needs a hip", () => {
    expect([...new Set(SEATED.map((each) => each.move))]).toEqual(DEFENDS);
    expect(SEATED.every((each) => each.reading.counts)).toBe(true);
  });

  test("the block trips nothing", () => {
    expect(row("block", "as performed")?.trips).toEqual([]);
  });

  test("a duck just big enough stays in the picture; the suite's own duck takes the shoulders out of the bottom", () => {
    expect(row("duck", SIZE_SMALL)?.trips).toEqual([]);
    expect(row("duck", SIZE_PERFORMED)?.trips).toEqual([TRIP_BOTTOM]);
  });

  test.each(["dodge_left", "dodge_right"])("%s at any size that counts leaves the picture and the presence range", (id) => {
    expect(row(id, SIZE_SMALL)?.trips).toEqual([TRIP_SIDE, TRIP_CENTRE]);
    expect(row(id, SIZE_PERFORMED)?.trips).toEqual([TRIP_SIDE, TRIP_CENTRE]);
  });
});
