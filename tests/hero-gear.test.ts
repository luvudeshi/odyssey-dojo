// Which gear is in the spartan's hands: nothing at rest, a spear only for a Hoplite's spear moves, the stake only for the stake.
import { expect, test } from "vitest";
import { STYLES } from "../src/styles/registry";
import { MOVES } from "../src/moves/registry";
import { TIMING } from "../src/render/hero/gear/timing";
import { heldGear, spearSlung } from "../src/render/hero/gearRule";
import type { HeroInput } from "../src/render/hero/heroClips";

const calm: HeroInput = { held: new Set(), struckMove: "", sinceStrike: Infinity, sinceHurt: Infinity, won: false, lost: false, finisherMove: null };
const strike = (move: string, sinceStrike = 0.1, extra: Partial<HeroInput> = {}): HeroInput => ({ ...calm, struckMove: move, sinceStrike, ...extra });

test("both hands are empty at rest, while blocking and while ducking", () => {
  expect(heldGear(TIMING, calm, "hoplite")).toBe("none");
  expect(heldGear(TIMING, { ...calm, held: new Set(["block"]) }, "hoplite")).toBe("none");
  expect(heldGear(TIMING, strike("spear_thrust", 0.1, { held: new Set(["duck"]) }), "hoplite")).toBe("none");
});

test("a Hoplite draws the spear for the spear thrust and the overhead strike, and stows it when the clip ends", () => {
  expect(heldGear(TIMING, strike("spear_thrust"), "hoplite")).toBe("spear");
  expect(heldGear(TIMING, strike("overhead_strike"), "hoplite")).toBe("spear");
  expect(heldGear(TIMING, strike("spear_thrust", 5), "hoplite")).toBe("none");
  expect(heldGear(TIMING, strike("overhead_strike", 5), "hoplite")).toBe("none");
});

test("every other style throws those moves with empty hands", () => {
  for (const style of STYLES.filter((s) => s.id !== "hoplite")) {
    expect(heldGear(TIMING, strike("spear_thrust"), style.id), style.id).toBe("none");
    expect(heldGear(TIMING, strike("overhead_strike"), style.id), style.id).toBe("none");
  }
});

test("punches, hooks, kicks, palms and every other move play with empty hands in every style", () => {
  const empty = [...MOVES.values()].filter((m) => !["spear_thrust", "overhead_strike", "stake_thrust"].includes(m.id));
  expect(empty.length).toBeGreaterThan(10);
  for (const style of STYLES) for (const move of empty) expect(heldGear(TIMING, strike(move.id), style.id), `${style.id} ${move.id}`).toBe("none");
});

test("the stake is in his hands for the stake finisher only, in any style", () => {
  for (const style of STYLES) {
    expect(heldGear(TIMING, strike("stake_thrust", 0.1, { finisherMove: "stake_thrust" }), style.id)).toBe("stake");
    expect(heldGear(TIMING, strike("stake_thrust", 5), style.id)).toBe("none");
  }
});

test("defeat and victory put everything away", () => {
  expect(heldGear(TIMING, strike("spear_thrust", 0.1, { lost: true }), "hoplite")).toBe("none");
  expect(heldGear(TIMING, strike("spear_thrust", 5, { won: true }), "hoplite")).toBe("none");
});

test("the spear is slung on the back for a Hoplite only, and only while it is not in his hand", () => {
  expect(spearSlung("hoplite", "none")).toBe(true);
  expect(spearSlung("hoplite", "stake")).toBe(true);
  expect(spearSlung("hoplite", "spear")).toBe(false);
  for (const id of ["boxer", "karate", "kung_fu", "pankration", ""]) expect(spearSlung(id, "none"), id).toBe(false);
});
