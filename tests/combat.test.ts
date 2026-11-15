import { expect, test } from "vitest";
import { PLAYER_HP, promptLevel, startFight, step } from "../src/combat/engine";
import type { CombatInput, CombatState, EnemySpec, FightingStyle } from "../src/core/types";

const enemy: EnemySpec = {
  id: "dummy", name: "Dummy", title: "", order: 0, hp: 20, strikeWindowMs: 1000,
  attacks: [{ id: "swing", name: "Swing", telegraphMs: 1000, damage: 60, counter: "block" }],
  weakSpots: [{ id: "head", label: "head", position: [0, 0, 0], moves: ["jab"] }],
  taunts: [],
};
const style: FightingStyle = { id: "s", name: "S", blurb: "", strikes: ["jab"] };
const idle: CombatInput = { held: new Set(), struck: [] };
const blocking: CombatInput = { held: new Set(["block"]), struck: [] };
const jabbing: CombatInput = { held: new Set(), struck: [{ move: "jab", quality: 0.7, player: 0 }] };

function run(state: CombatState, input: CombatInput, ms: number): { state: CombatState; events: string[] } {
  const result = step(state, enemy, style, input, ms);
  return { state: result.state, events: result.events.map((event) => event.type) };
}

function toDefend(): CombatState {
  const { state, events } = run(startFight(enemy, 1), idle, 2000);
  expect(events).toEqual(["telegraph"]);
  return state;
}

test("a defense held when the attack lands opens a strike", () => {
  const { state, events } = run(toDefend(), blocking, 1000);
  expect(events).toEqual(["defended", "opening"]);
  expect(state.phase.kind).toBe("strike");
  expect(state.playerHp).toBe(PLAYER_HP);
  expect(state.mastery).toEqual({ block: 1 });
});

test("a defense made once while the attack is coming counts, even when let go before it lands", () => {
  const waiting = run(toDefend(), idle, 300).state;
  const dodged = run(waiting, blocking, 100).state;
  expect(dodged.phase.kind).toBe("defend");
  const { state, events } = run(run(dodged, idle, 300).state, idle, 300);
  expect(events).toEqual(["defended", "opening"]);
  expect(state.playerHp).toBe(PLAYER_HP);
  expect(state.mastery).toEqual({ block: 1 });
});

test("a defense carried over from before the attack was shown and then let go does not count", () => {
  const carried = run(toDefend(), blocking, 300).state;
  const { state, events } = run(run(carried, idle, 300).state, idle, 400);
  expect(events).toEqual(["playerHit"]);
  expect(state.playerHp).toBe(40);
});

test("a defense let go and made again after the attack was shown counts", () => {
  const carried = run(toDefend(), blocking, 200).state;
  const again = run(run(carried, idle, 200).state, blocking, 100).state;
  expect(run(again, idle, 500).events).toEqual(["defended", "opening"]);
});

test("another defense made while the attack is coming does not count", () => {
  const wrong = run(toDefend(), { held: new Set(["duck"]), struck: [] }, 500).state;
  expect(run(wrong, idle, 500).events).toEqual(["playerHit"]);
});

test("no defense means the player is hit, and two hits lose the fight", () => {
  const first = run(toDefend(), idle, 1000);
  expect(first.events).toEqual(["playerHit"]);
  expect(first.state.playerHp).toBe(40);
  const again = run(run(first.state, idle, 700).state, idle, 1000);
  expect(again.events).toEqual(["playerHit", "lost"]);
  expect(again.state.phase.kind).toBe("lost");
  expect(run(again.state, jabbing, 16).events).toEqual([]);
});

test("the prompted strike damages the enemy, and enough of them win", () => {
  const open = run(toDefend(), blocking, 1000).state;
  const hit = run(open, jabbing, 16);
  expect(hit.events).toEqual(["enemyHit"]);
  expect(hit.state.enemyHp).toBe(6); // 12 * (0.5 + 0.7) = 14
  expect(hit.state.combo).toBe(1);
  const reopened = run(run(run(hit.state, idle, 700).state, blocking, 1000).state, jabbing, 16);
  expect(reopened.events).toEqual(["enemyHit", "won"]);
});

test("a missed opening resets the combo", () => {
  const open = run(toDefend(), blocking, 1000).state;
  const missed = run({ ...open, combo: 3 }, idle, 1000);
  expect(missed.events).toEqual(["whiffed"]);
  expect(missed.state.combo).toBe(0);
});

test("prompts fade as a move is mastered", () => {
  expect([0, 2, 5].map(promptLevel)).toEqual(["full", "word", "mini"]);
});
