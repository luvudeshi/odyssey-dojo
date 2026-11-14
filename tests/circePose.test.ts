// Circe's body per attack, as numbers: every attack in her data must have its own telegraph, and the four must differ
// in the way the player has to answer (left, right, high, centre).
import { expect, test } from "vitest";
import type { MonsterProps } from "../src/core/types";
import { enemy } from "../src/enemies/defs/circe";
import { ATTACK_POSES, circePose, newPose } from "../src/render/monsters/circe/pose";
import type { CirclePose } from "../src/render/monsters/circe/pose";
import { lookFor, LOOKS } from "../src/render/monsters/circe/palette";

const base: Pick<MonsterProps, "defeated" | "phaseIndex" | "hitFlash"> = { defeated: false, phaseIndex: 0, hitFlash: 0 };
const at = (attackId: string | null, windup: number, extra: Partial<typeof base> = {}): CirclePose =>
  circePose(newPose(), { ...base, ...extra, attackId, windup }, 0);

test("every attack in Circe's data has a telegraph pose", () => {
  for (const attack of enemy.attacks) expect(ATTACK_POSES[attack.id], attack.id).toBeDefined();
});

test("the wand strokes lean and arc to opposite sides", () => {
  const left = at("wand_left", 1);
  const right = at("wand_right", 1);
  expect(left.arcLeft).toBe(1);
  expect(left.arcRight).toBe(0);
  expect(right.arcRight).toBe(1);
  expect(right.arcLeft).toBe(0);
  expect(Math.sign(left.lean)).toBe(-Math.sign(right.lean));
  expect(Math.sign(left.twist)).toBe(-Math.sign(right.twist));
});

test("the cup is raised over her head with the green ring above, and the spell gathers an orb and a floor sigil", () => {
  const cup = at("cup", 1);
  const rest = at(null, 0);
  expect(cup.cupOut).toBeGreaterThan(rest.cupOut + 1.5);
  expect(cup.halo).toBe(1);
  expect(at("wand_left", 1).halo).toBe(0);
  const spell = at("spell", 1);
  expect(spell.orb).toBe(1);
  expect(spell.ring).toBe(1);
  expect(cup.orb).toBe(0);
});

test("the windup builds smoothly from rest to the full pose", () => {
  const rest = at("wand_left", 0).wandOut;
  const half = at("wand_left", 0.5).wandOut;
  const full = at("wand_left", 1).wandOut;
  expect(half).toBeGreaterThan(rest);
  expect(half).toBeLessThan(full);
  expect(at("nonsense", 1)).toEqual(at(null, 0));
});

test("a hit rocks her back, her eyes light in the last phase and she kneels when beaten", () => {
  expect(at(null, 0, { hitFlash: 1 }).bow).toBeLessThan(at(null, 0).bow);
  expect(at(null, 0, { phaseIndex: 2 }).eyes).toBe(1);
  expect(at(null, 0, { phaseIndex: 0 }).eyes).toBe(0);
  const beaten = at("spell", 1, { defeated: true });
  expect(beaten.drop).toBeGreaterThan(0.5);
  expect(beaten.orb).toBe(0);
});

test("each phase has its own colours and an out-of-range phase index does not crash", () => {
  expect(new Set(LOOKS.map((look) => look.robe)).size).toBe(LOOKS.length);
  expect(lookFor(-1)).toBe(LOOKS[0]);
  expect(lookFor(99)).toBe(LOOKS[LOOKS.length - 1]);
  expect((enemy.phases ?? []).length).toBeLessThanOrEqual(LOOKS.length);
});
