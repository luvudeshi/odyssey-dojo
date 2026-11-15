// Waist-up play (issue #239) gave the engine's `step` a sixth argument, `legs`. With `legs` true or left out (the
// keyboard), every fight must ask for exactly the moves it asked before that change.
// tests/fixtures/openings.json holds what the engine asked on main at 372e085, before the change: for every style,
// every stop and four seeds, the first 40 weak spots that open (weak spot and move) in a fight where every attack is
// defended and no strike is thrown. To record it again after a change to a style, a stop or the rolls that is meant:
//   RECORD_OPENINGS=1 npx vitest run tests/openingsUnchanged.test.ts
import { readFileSync, writeFileSync } from "node:fs";
import { env } from "node:process";
import { expect, test } from "vitest";
import { startFight, step } from "../src/combat/engine";
import type { EnemySpec, FightingStyle } from "../src/core/types";
import { ENEMIES } from "../src/enemies/registry";
import { STYLES } from "../src/styles/registry";

const FIXTURE = "tests/fixtures/openings.json";
const STEP_MS = 50;
const OPENINGS = 40;
const SEEDS = [1, 7, 42, 2026];

type Legs = "left out" | "true";

/** The first OPENINGS openings of a fight in which every attack is defended, each as "weak spot id: move id". */
function openings(enemy: EnemySpec, style: FightingStyle, seed: number, legs: Legs): string[] {
  const out: string[] = [];
  let state = startFight(enemy, seed);
  for (let turn = 0; turn < 20000 && out.length < OPENINGS; turn += 1) {
    const held = new Set(state.phase.kind === "defend" ? [state.phase.attack.counter] : []);
    const input = { held, struck: [] };
    const result = legs === "left out" ? step(state, enemy, style, input, STEP_MS) : step(state, enemy, style, input, STEP_MS, true);
    state = result.state;
    for (const event of result.events) if (event.type === "opening") out.push(`${event.weakSpot.id}: ${event.move}`);
  }
  return out;
}

const key = (style: FightingStyle, enemy: EnemySpec, seed: number): string => `${style.id} at ${enemy.id}, seed ${String(seed)}`;

function all(legs: Legs): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const style of STYLES) for (const enemy of ENEMIES) for (const seed of SEEDS) out[key(style, enemy, seed)] = openings(enemy, style, seed, legs);
  return out;
}

/** One fight to a line, so a change shows as the lines of the fights it changed. */
const lines = (fights: Record<string, string[]>): string =>
  `{\n${Object.entries(fights).map(([where, asked]) => `${JSON.stringify(where)}: ${JSON.stringify(asked)}`).join(",\n")}\n}\n`;

if (env.RECORD_OPENINGS) writeFileSync(FIXTURE, lines(all("left out")));
const recorded = JSON.parse(readFileSync(FIXTURE, "utf8")) as Record<string, string[]>;

test.each(["left out", "true"] as const)("legs %s: every style at every stop asks for the same openings as before #239", (legs) => {
  const now = all(legs);
  expect(Object.keys(now).sort()).toEqual(Object.keys(recorded).sort());
  for (const [where, asked] of Object.entries(now)) {
    expect(asked, where).toHaveLength(OPENINGS);
    expect(asked, where).toEqual(recorded[where]);
  }
});

test("the recorded fights ask for both kicks, so a change that dropped them would show here", () => {
  const moves = new Set(Object.values(recorded).flat().map((opening) => opening.split(": ")[1]));
  expect(moves).toContain("front_kick");
  expect(moves).toContain("knee");
});
