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
import type { Build } from "../helpers/anyBody";
import { FIXTURE_BUILD, builtRecording } from "../helpers/anyBody";
import type { Step } from "../poseFixture";
import { READY, pose } from "../poseFixture";

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
  process.stdout.write(`\n${drawn}\n\n`);
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

// Found in #178: on narrow shoulders with long arms, a punch aimed 20 degrees or more above level soon after the
// hands come up passed the chin with the elbow still bent, and also read as the rising strike of the same hand.
// Without the wait it did so on the fixture's own build too.
const BUILDS: readonly (readonly [string, Build])[] = [
  ["0.40 m shoulders, 0.55 m arms (the fixture)", FIXTURE_BUILD],
  ["0.30 m shoulders, 0.60 m arms", { shoulders: 0.3, arm: 0.6, torso: 0.5 }],
  ["0.28 m shoulders, 0.55 m arms", { shoulders: 0.28, arm: 0.55, torso: 0.5 }],
];
describe.each(BUILDS)("a punch aimed upward soon after the hands come up, on %s", (_name, build) => {
  const punched = (side: "left" | "right", degrees: number, wait: number): string[] => {
    const up = -Math.tan((degrees * Math.PI) / 180);
    const aim = [side === "left" ? 0.1 : -0.1, up, -1] as const;
    const out = pose(side === "left" ? { leftUpper: aim, leftFore: aim } : { rightUpper: aim, rightFore: aim }, READY);
    // Hands up in 300 ms, held for `wait`, then the punch in 130 ms and held.
    const steps: Step[] = [[READY, 300], [READY, wait], [out, 130], [out, 200]];
    return firedIn(builtRecording(build, steps.filter(([, ms]) => ms > 0)));
  };
  test.each([20, 30, 40])("at %i degrees a cross is a cross and not an uppercut, a jab a jab and not a rising palm", (degrees) => {
    for (const wait of [0, 300]) {
      expect(punched("right", degrees, wait), `cross, ${String(wait)} ms wait`).toEqual(["cross"]);
      expect(punched("left", degrees, wait), `jab, ${String(wait)} ms wait`).toEqual(["jab"]);
    }
  });
});
