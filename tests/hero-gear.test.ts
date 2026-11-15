// Which gear is in the spartan's hands: nothing at rest, never a spear (no style fights with one now), the stake only for the stake.
import { expect, test } from "vitest";
import { STYLES } from "../src/styles/registry";
import { MOVES } from "../src/moves/registry";
import { TIMING } from "../src/render/hero/gear/timing";
import { heldGear, spearSlung } from "../src/render/hero/gearRule";
import type { HeroInput } from "../src/render/hero/heroClips";

const calm: HeroInput = { held: new Set(), struckMove: "", sinceStrike: Infinity, sinceHurt: Infinity, won: false, lost: false, finisherMove: null };
const strike = (move: string, sinceStrike = 0.1, extra: Partial<HeroInput> = {}): HeroInput => ({ ...calm, struckMove: move, sinceStrike, ...extra });

test("both hands are empty at rest, while blocking and while ducking, in every style", () => {
  for (const style of STYLES) {
    expect(heldGear(TIMING, calm, style.id), style.id).toBe("none");
    expect(heldGear(TIMING, { ...calm, held: new Set(["block"]) }, style.id), style.id).toBe("none");
    expect(heldGear(TIMING, strike("spear_thrust", 0.1, { held: new Set(["duck"]) }), style.id), style.id).toBe("none");
  }
});

test("no style fights with a spear: the spear thrust and the overhead strike are thrown with empty hands", () => {
  for (const id of [...STYLES.map((s) => s.id), "hoplite", "pankration", ""]) {
    expect(heldGear(TIMING, strike("spear_thrust"), id), id).toBe("none");
    expect(heldGear(TIMING, strike("overhead_strike"), id), id).toBe("none");
    expect(heldGear(TIMING, strike("spear_thrust", 5), id), id).toBe("none");
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
  for (const style of STYLES) {
    expect(heldGear(TIMING, strike("stake_thrust", 0.1, { lost: true }), style.id), style.id).toBe("none");
    expect(heldGear(TIMING, strike("stake_thrust", 5, { won: true }), style.id), style.id).toBe("none");
  }
});

test("no spear is slung on his back, in any style and whatever is in his hand", () => {
  for (const id of [...STYLES.map((s) => s.id), "hoplite", "pankration", ""]) {
    for (const held of ["none", "stake", "spear"] as const) expect(spearSlung(id, held), `${id} ${held}`).toBe(false);
  }
});
