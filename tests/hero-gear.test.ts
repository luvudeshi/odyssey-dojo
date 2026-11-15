// Which gear is in the spartan's hands: nothing at rest, the stake only for the stake finisher. No style holds a spear.
import { expect, test } from "vitest";
import { MOVES } from "../src/moves/registry";
import { TIMING } from "../src/render/hero/gear/timing";
import { heldGear } from "../src/render/hero/gearRule";
import type { HeroInput } from "../src/render/hero/heroClips";

const calm: HeroInput = { held: new Set(), struckMove: "", sinceStrike: Infinity, sinceHurt: Infinity, won: false, lost: false, finisherMove: null };
const strike = (move: string, sinceStrike = 0.1, extra: Partial<HeroInput> = {}): HeroInput => ({ ...calm, struckMove: move, sinceStrike, ...extra });

test("both hands are empty at rest, while blocking and while ducking", () => {
  expect(heldGear(TIMING, calm)).toBe("none");
  expect(heldGear(TIMING, { ...calm, held: new Set(["block"]) })).toBe("none");
  expect(heldGear(TIMING, strike("spear_thrust", 0.1, { held: new Set(["duck"]) }))).toBe("none");
});

test("the spear moves, punches, hooks, kicks, palms and every other move play with empty hands", () => {
  const empty = [...MOVES.values()].filter((m) => m.id !== "stake_thrust");
  expect(empty.length).toBeGreaterThan(10);
  for (const move of empty) expect(heldGear(TIMING, strike(move.id)), move.id).toBe("none");
});

test("the stake is in his hands for the stake finisher only, and stowed when its clip ends", () => {
  expect(heldGear(TIMING, strike("stake_thrust", 0.1, { finisherMove: "stake_thrust" }))).toBe("stake");
  expect(heldGear(TIMING, strike("stake_thrust", 5))).toBe("none");
});

test("defeat and victory put everything away", () => {
  expect(heldGear(TIMING, strike("stake_thrust", 0.1, { lost: true }))).toBe("none");
  expect(heldGear(TIMING, strike("stake_thrust", 5, { won: true }))).toBe("none");
});
