// The cross-fire table (issue #191): every move done right at three body sizes, and every OTHER move the game
// reads in the same window. Inside what one player can be asked for in one fight (a style's strikes, the four
// defends and the six god gestures) no move may set off another, apart from the pairs in LEFT, which are pinned
// as they are so that the day one stops firing this file says so. docs/cross-fire.md holds the table.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { MOVES } from "../../src/moves/registry";
import { STYLES } from "../../src/styles/registry";
import {
  DEFENDS, GOD_GESTURES, ORDER, PERFORMANCES, SIZES, crossFire, firedIn, inScope, markdown, pairsOf,
} from "../helpers/crossFire";
import { READY, pose, recording } from "../poseFixture";

const TABLE = crossFire();
const PAIRS = pairsOf(TABLE);
const EVERY_SIZE = SIZES.map((_, index) => index);

/** In-scope pairs that still fire, each with why it is left. The reasons are spelled out in docs/cross-fire.md. */
const LEFT: Record<string, string> = {
  "overhead_strike>thunderbolt": "the same motion by design: the right-hand thunderbolt is the overhead strike",
  "hammer_fist>thunderbolt": "the same motion by design: the left-hand thunderbolt is the hammer fist",
  "double_palm>aegis_push": "the same motion by design: both palms pushed out from the chest",
  "thunderbolt>uppercut": "raising the hand passes the chin with a bent elbow; telling it from an uppercut needs a real trace",
  "thunderbolt>overhead_strike": "the same motion by design",
  "aegis_push>spear_thrust": "a thrust with the hands close; the hand spacing that splits them needs a real trace",
  "aegis_push>double_palm": "the same motion by design",
  "swift_dash>dodge_right": "a dash is a fast side step, and a side step is a dodge, by design",
};

/** Pairs that fire but can never be asked of one player in one fight: two styles' strikes, or the finisher. */
const OUTSIDE: readonly string[] = [
  "hook>rising_palm", "overhead_strike>uppercut", "reverse_punch>cross", "knife_hand>cross", "knife_hand>uppercut",
  "hammer_fist>rising_palm", "double_palm>spear_thrust", "chain_punch>jab", "chain_punch>cross",
  "stake_thrust>aegis_push",
];

/** In-scope pairs that fired before #191 and were separated in the detectors. */
const FIXED: readonly string[] = [
  "cross>uppercut", "double_palm>rising_palm", "chain_punch>rising_palm", "block>uppercut", "block>rising_palm",
  "moon_arrow>uppercut", "sun_burst>spear_thrust",
];

test("the table is 26 by 26: every move in the registry, once, with a performance", () => {
  expect(ORDER).toHaveLength(26);
  expect([...ORDER].sort()).toEqual([...MOVES.keys()].sort());
  expect(Object.keys(PERFORMANCES).sort()).toEqual([...MOVES.keys()].sort());
  expect(STYLES.flatMap((style) => [...style.strikes]).every((id) => MOVES.has(id))).toBe(true);
  expect([...DEFENDS, ...GOD_GESTURES].every((id) => MOVES.has(id))).toBe(true);
});

test("prints the table, and docs/cross-fire.md holds the same one", () => {
  const drawn = markdown(TABLE);
  console.log(`\n${drawn}\n`);
  expect(readFileSync("docs/cross-fire.md", "utf8").replace(/\r\n/g, "\n")).toContain(drawn);
});

test.each(ORDER)("%s fires on its own performance at all three sizes", (id) => {
  expect(TABLE.get(id)?.get(id)).toEqual(EVERY_SIZE);
});

describe("inside one style's strikes, the four defends and the six god gestures", () => {
  test("no move sets off another, apart from the pairs left and pinned", () => {
    expect(PAIRS.filter(inScope)).toEqual(Object.keys(LEFT));
  });

  // Each of these asserts the cross-fire as it is today. One going quiet is good news: take it out of LEFT and
  // out of the doc.
  test.each(Object.entries(LEFT))("%s still fires at all three sizes (%s)", (pair) => {
    const [done = "", seen = ""] = pair.split(">");
    expect(inScope(pair)).toBe(true);
    expect(TABLE.get(done)?.get(seen)).toEqual(EVERY_SIZE);
  });

  test.each(FIXED)("%s no longer fires at any size", (pair) => {
    const [done = "", seen = ""] = pair.split(">");
    expect(inScope(pair)).toBe(true);
    expect(TABLE.get(done)?.has(seen)).toBe(false);
  });
});

test("outside that, the pairs that fire are the ones listed, at all three sizes", () => {
  expect(PAIRS.filter((pair) => !inScope(pair))).toEqual(OUTSIDE);
  for (const pair of OUTSIDE) {
    const [done = "", seen = ""] = pair.split(">");
    expect(TABLE.get(done)?.get(seen), pair).toEqual(EVERY_SIZE);
  }
});

// Found in #178: with the hands only just raised, a punch aimed upward passed the chin with the elbow still
// bent and also read as the rising strike of the same hand. The arm bones here are aimed, as in poseFixture.ts.
describe.each([20, 30, 40])("a punch aimed %i degrees above level, 300 ms after the hands come up", (degrees) => {
  const up = -Math.tan((degrees * Math.PI) / 180);
  test("a cross is a cross and not an uppercut", () => {
    const cross = pose({ rightUpper: [-0.1, up, -1], rightFore: [-0.1, up, -1] }, READY);
    expect(firedIn(recording([[READY, 300], [cross, 130], [cross, 200]]))).toEqual(["cross"]);
  });
  test("a jab is a jab and not a rising palm", () => {
    const jab = pose({ leftUpper: [0.1, up, -1], leftFore: [0.1, up, -1] }, READY);
    expect(firedIn(recording([[READY, 300], [jab, 130], [jab, 200]]))).toEqual(["jab"]);
  });
});
