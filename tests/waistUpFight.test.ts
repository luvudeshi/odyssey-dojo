// Waist-up play in the fight (issue #239): with the legs out of view the engine never opens a weak spot for a kick,
// and with them in view, or on the keyboard, the fight is the one it was.
import { expect, test } from "vitest";
import { startFight, step } from "../src/combat/engine";
import type { CombatEvent, EnemySpec, FightingStyle } from "../src/core/types";
import { ENEMIES } from "../src/enemies/registry";
import { MOVES } from "../src/moves/registry";
import { NEEDS_LEGS, swapFor } from "../src/moves/waistUp";
import { STYLES } from "../src/styles/registry";

type Opening = Extract<CombatEvent, { type: "opening" }>;

const STEP_MS = 50;
const OPENINGS = 40;
const SEEDS = [1, 7, 42, 2026];

/** A fight where every attack is defended and no strike is thrown, so one weak spot opens after another. */
function openings(enemy: EnemySpec, style: FightingStyle, seed: number, legs?: boolean): Opening[] {
  const out: Opening[] = [];
  let state = startFight(enemy, seed);
  for (let turn = 0; turn < 20000 && out.length < OPENINGS; turn += 1) {
    const held = new Set(state.phase.kind === "defend" ? [state.phase.attack.counter] : []);
    const input = { held, struck: [] };
    const result = legs === undefined ? step(state, enemy, style, input, STEP_MS) : step(state, enemy, style, input, STEP_MS, legs);
    state = result.state;
    for (const event of result.events) if (event.type === "opening") out.push(event);
    if (state.phase.kind === "strike") expect(state.phase.move).toBe(out.at(-1)?.move);
  }
  expect(out.length).toBe(OPENINGS);
  return out;
}

const pairs = STYLES.flatMap((style) => ENEMIES.map((enemy) => [style.id, enemy.id, style, enemy] as const));

test.each(pairs)("%s at %s: legs out of view, no weak spot opens for a kick", (_s, _e, style, enemy) => {
  for (const seed of SEEDS) {
    const seen = openings(enemy, style, seed, true);
    const unseen = openings(enemy, style, seed, false);
    for (const [at, opening] of unseen.entries()) {
      const where = `${style.id}/${enemy.id}/seed ${seed}/opening ${at}`;
      expect(NEEDS_LEGS, where).not.toContain(opening.move);
      expect(MOVES.get(opening.move)?.kind, where).toBe("strike");
      expect(style.strikes, where).toContain(opening.move);
      // The same roll as with the legs in view: the same weak spot, and the kick swapped for its nearest hand strike.
      const whole = seen[at];
      expect(opening.weakSpot.id, where).toBe(whole?.weakSpot.id);
      expect(opening.move, where).toBe(swapFor(whole?.move ?? "", style, opening.weakSpot.moves));
    }
  }
});

test("legs in view, or not said (the keyboard): the fight asks what it always asked, kicks included", () => {
  const asked = new Set<string>();
  for (const [, , style, enemy] of pairs) {
    for (const seed of SEEDS) {
      const seen = openings(enemy, style, seed, true);
      expect(openings(enemy, style, seed)).toEqual(seen);
      for (const opening of seen) asked.add(opening.move);
    }
  }
  // The fights above do ask for both kicks, so the test before this one has something to take away.
  for (const id of NEEDS_LEGS) expect(asked, id).toContain(id);
});

test("taekwondo at Polyphemus, waist up: the kicks become the uppercut and the hand strikes stay", () => {
  const style = STYLES.find((each) => each.id === "taekwondo");
  const enemy = ENEMIES[0];
  if (!style || !enemy) throw new Error("no taekwondo or no first stop");
  const moves = new Set(SEEDS.flatMap((seed) => openings(enemy, style, seed, false).map((opening) => opening.move)));
  expect(moves).toContain("uppercut");
  expect([...moves].every((id) => id === "uppercut" || id === "hammer_fist")).toBe(true);
});
