// Which rough movements count on another move's prompt. The table pins every overlap; a change that adds one fails here.
import { expect, test } from "vitest";
import { STYLES } from "../../src/styles/registry";
import { LEFT_OUT, READY, STANDING, pose, recording } from "../poseFixture";
import { MOVEMENTS, counted, watch } from "./looseMoves";

const STRIKES = Object.keys(MOVEMENTS).filter((id) => !["block", "duck", "dodge_left", "dodge_right", "jump"].includes(id));
const DEFENDS = ["block", "duck", "dodge_left", "dodge_right", "jump"];
const FINISHERS = ["stake_thrust", "spear_thrust", "overhead_strike"];

/** Every other move whose prompt the rough movement of `a` counts on. */
const countsOn = (a: string, pool: readonly string[]): string[] => pool.filter((b) => b !== a && counted(watch(MOVEMENTS[a] ?? [], b), b));

// Left to right: the move thrown, and the prompts it also counts on. Each kept overlap says why.
const EXPECTED_STRIKES: Record<string, readonly string[]> = {
  jab: ["chain_punch", "spear_thrust"], // a left arm going forward is a left-arm punch for chain punch and spear thrust (either arm)
  cross: ["reverse_punch", "chain_punch", "spear_thrust"], // the same right-arm punch: a flat picture cannot tell a cross from a reverse punch
  reverse_punch: ["cross", "chain_punch", "spear_thrust"],
  hook: [],
  uppercut: [],
  knife_hand: [],
  hammer_fist: ["jab"], // the jab counts any clear left-arm movement, by the owner's request
  double_palm: ["spear_thrust", "stake_thrust"], // both arms out: the same movement for all three
  chain_punch: ["cross", "reverse_punch", "spear_thrust"],
  spear_thrust: ["double_palm", "stake_thrust"],
  stake_thrust: ["double_palm", "spear_thrust"],
  rising_palm: ["jab"], // any left-arm movement is a jab
  overhead_strike: [],
  front_kick: ["knee"], // both are a knee or ankle rising; the pose cannot tell a kick from a knee
  knee: ["front_kick"],
};

test.each(STRIKES)("%s: the prompts its rough movement also counts on are the pinned ones", (a) => {
  expect(counted(watch(MOVEMENTS[a] ?? [], a), a), "counts on its own prompt").toBe(true);
  expect(countsOn(a, STRIKES)).toEqual(EXPECTED_STRIKES[a]);
});

test("a rough movement of a defend counts on no other defend, and on no strike", () => {
  for (const a of DEFENDS) {
    expect(counted(watch(MOVEMENTS[a] ?? [], a, true), a), a).toBe(true);
    expect(countsOn(a, [...DEFENDS, ...STRIKES]), a).toEqual([]);
  }
});

test("no strike movement counts on a defend prompt", () => {
  for (const a of STRIKES) expect(countsOn(a, DEFENDS), a).toEqual([]);
});

test("in every style, the overlaps among its strikes are the pinned ones, and a finisher only overlaps the pinned strikes", () => {
  for (const style of STYLES) {
    for (const a of style.strikes) {
      const within = countsOn(a, style.strikes);
      expect(within, `${style.id}: ${a}`).toEqual((EXPECTED_STRIKES[a] ?? []).filter((b) => style.strikes.includes(b)));
      for (const f of FINISHERS.filter((each) => each !== a)) {
        expect(counted(watch(MOVEMENTS[a] ?? [], f), f), `${style.id}: ${a} on the ${f} finisher`).toBe((EXPECTED_STRIKES[a] ?? []).includes(f));
      }
    }
  }
});

// MISS: the right limb moving the right way on its own prompt flashes nothing; the wrong limb still does.
const LEFT_PUNCH = recording([[READY, 900], [READY, 300], [pose(LEFT_OUT, READY), 400], [pose(LEFT_OUT, READY), 600]]);
const SIDE_STEP = recording([[STANDING, 900], [STANDING, 300], [pose({ step: 0.6 }), 300], [pose({ step: 0.6 }), 700]]);
const style = (id: string): readonly string[] => STYLES.find((s) => s.id === id)?.strikes ?? [];

test("one strike from each style: the rough right movement on its own prompt gives no MISS", () => {
  for (const [styleId, move] of [["boxer", "cross"], ["karate", "reverse_punch"], ["kung_fu", "chain_punch"], ["jiu_jitsu", "rising_palm"], ["taekwondo", "front_kick"], ["boxer", "uppercut"], ["karate", "knife_hand"]] as const) {
    expect(style(styleId)).toContain(move);
    const seen = watch(MOVEMENTS[move] ?? [], move);
    expect(counted(seen, move), move).toBe(true);
    expect(seen.misses, move).toBe(0);
  }
});

test("two defends: the rough movement on its own prompt gives no MISS", () => {
  for (const move of ["block", "dodge_right", "duck", "jump"]) {
    const seen = watch(MOVEMENTS[move] ?? [], move, true);
    expect(counted(seen, move), move).toBe(true);
    expect(seen.misses, move).toBe(0);
  }
});

test("the wrong limb still flashes MISS: a left punch on a cross or reverse punch prompt, a side step on a block prompt", () => {
  for (const ask of ["cross", "reverse_punch"]) expect(watch(LEFT_PUNCH, ask).misses, ask).toBeGreaterThan(0);
  const stepped = watch(SIDE_STEP, "block", true);
  expect(counted(stepped, "block")).toBe(false);
  expect(stepped.misses).toBeGreaterThan(0);
});
