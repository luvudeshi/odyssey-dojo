import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { startFight, step } from "../src/combat/engine";
import type { CombatPhase, CombatState } from "../src/core/types";
import { ENEMIES } from "../src/enemies/registry";
import { DefendFlash, defendCounted, defendSeen, defendWord } from "../src/hud/DefendFlash";
import { STYLES } from "../src/styles/registry";

const enemy = ENEMIES[0];
const style = STYLES[0];
if (!enemy || !style) throw new Error("no enemy or style");
const idle = { held: new Set<string>(), struck: [] };

/** Plays the fight in 50 ms steps, holding `hold(state)`, and returns every defend the callout would show, with the phase it showed in. */
function play(hold: (phase: CombatPhase) => string | null, steps: number): { shown: [string, string][]; state: CombatState } {
  let state = startFight(enemy, 7);
  const shown: [string, string][] = [];
  for (let i = 0; i < steps; i++) {
    const move = hold(state.phase);
    const next = step(state, enemy, style, move === null ? idle : { held: new Set([move]), struck: [] }, 50).state;
    const counted = defendCounted(defendSeen(state.phase), defendSeen(next.phase));
    if (counted !== null) shown.push([counted, next.phase.kind]);
    state = next;
  }
  return { shown, state };
}

test("a defend made once in the wind-up is called out at once, while the attack is still coming, and only once", () => {
  // Made for 100 ms, 300 ms after the attack is shown, then back to standing.
  const { shown, state } = play((phase) => (phase.kind === "defend" && phase.totalMs - phase.msLeft >= 300 && phase.totalMs - phase.msLeft < 400 ? phase.attack.counter : null), 80);
  expect(shown.length).toBeGreaterThan(0);
  for (const [, kind] of shown) expect(kind).toBe("defend");
  expect(state.playerHp).toBe(100);
});

test("a defend held from before the attack was shown is called out when the attack lands on it", () => {
  const { shown } = play((phase) => (phase.kind === "defend" || phase.kind === "intro" || phase.kind === "recover" ? "block" : null), 60);
  const blocks = shown.filter(([move]) => move === "block");
  for (const [, kind] of blocks) expect(kind).toBe("strike");
});

test("standing still is never called out", () => {
  expect(play(() => null, 200).shown).toEqual([]);
});

test("each defend has its own one-word chip, with no Safe line and no arrow", () => {
  const words = ["dodge_left", "dodge_right", "block", "duck", "jump"].map(defendWord);
  expect(new Set(words).size).toBe(4);
  expect(words).toEqual(["DODGED", "DODGED", "BLOCKED", "DUCKED", "JUMPED"]);
  // Nothing is shown until a defend counts.
  expect(renderToStaticMarkup(createElement(DefendFlash, { phase: { kind: "intro", msLeft: 100 } }))).toBe("");
});
