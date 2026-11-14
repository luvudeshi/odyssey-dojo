// Guards the content teammates add: every id an enemy or style names must be a real move of the right kind.
import { expect, test } from "vitest";
import { startFight, step } from "../src/combat/engine";
import type { Strike } from "../src/core/types";
import { ENEMIES } from "../src/enemies/registry";
import { createPoseInput } from "../src/input/poseInput";
import { MOVES } from "../src/moves/registry";
import { EMPTY_HISTORY, pushFrame } from "../src/pose/signals";
import { JOINT } from "../src/pose/signals";
import { STYLES } from "../src/styles/registry";
import { frameAt } from "./poseFixture";

test("enemy counters, weak spots, phases and finishers name real moves and attacks", () => {
  expect(ENEMIES.length).toBeGreaterThan(0);
  for (const enemy of ENEMIES) {
    for (const attack of enemy.attacks) expect(MOVES.get(attack.counter)?.kind, attack.id).toBe("defend");
    for (const spot of enemy.weakSpots) {
      for (const move of spot.moves) expect(MOVES.get(move)?.kind, `${enemy.id}/${spot.id}/${move}`).toBe("strike");
    }
    const attackIds = enemy.attacks.map((attack) => attack.id);
    for (const phase of enemy.phases ?? []) {
      for (const id of phase.attackIds) expect(attackIds, `${enemy.id}/${phase.name}`).toContain(id);
    }
    if (enemy.finisher !== undefined) expect(MOVES.get(enemy.finisher)?.kind, `${enemy.id} finisher`).toBe("strike");
  }
});

test("style strikes are strike moves, and move keys are unique", () => {
  for (const style of STYLES) {
    for (const move of style.strikes) expect(MOVES.get(move)?.kind, `${style.id}/${move}`).toBe("strike");
  }
  const keys = [...MOVES.values()].map((move) => move.key);
  expect(new Set(keys).size).toBe(keys.length);
});

test("standing still triggers nothing; fists at the face is a block; bent-then-straight left arm is one jab", () => {
  const read = createPoseInput(MOVES);
  let history = EMPTY_HISTORY;
  for (let i = 0; i < 20; i++) history = pushFrame(history, frameAt(i * 33));
  const still = read(history);
  expect([...still.held, ...still.struck]).toEqual([]);

  const guard = frameAt(700, { [JOINT.leftWrist]: [0.47, 0.22], [JOINT.rightWrist]: [0.53, 0.22] });
  expect([...read(pushFrame(history, guard)).held]).toEqual(["block"]);

  const bent = frameAt(700, {}, { [JOINT.leftElbow]: [-0.3, -0.35, 0], [JOINT.leftWrist]: [-0.2, -0.45, -0.05] });
  const straight = frameAt(900, {}, { [JOINT.leftElbow]: [-0.2, -0.5, -0.3], [JOINT.leftWrist]: [-0.2, -0.5, -0.6] });
  const punched = pushFrame(pushFrame(history, bent), straight);
  expect(read(punched).struck.map((strike) => strike.move)).toEqual(["jab"]);
  expect(read(punched).struck).toEqual([]);
});

test("every enemy's phases start at full health and come in falling order", () => {
  for (const enemy of ENEMIES) {
    const phases = enemy.phases ?? [];
    if (phases.length === 0) continue;
    expect(phases[0]?.belowHp, enemy.id).toBe(1);
    phases.forEach((phase, index) => {
      const before = phases[index - 1];
      if (before) expect(phase.belowHp, `${enemy.id}/${phase.name}`).toBeLessThan(before.belowHp);
      expect(phase.belowHp, `${enemy.id}/${phase.name}`).toBeGreaterThan(0);
      expect(phase.telegraphScale, `${enemy.id}/${phase.name}`).toBeGreaterThan(0);
    });
  }
});

test("Polyphemus: three phases that speed up, ducking from the second, and warnings a body can answer", () => {
  const polyphemus = ENEMIES.find((enemy) => enemy.id === "polyphemus");
  const phases = polyphemus?.phases ?? [];
  expect(phases.map((phase) => phase.name)).toEqual(["The Cave", "The Club", "Blinded"]);
  const scales = phases.map((phase) => phase.telegraphScale);
  expect(scales).toEqual([...scales].sort((a, b) => b - a));

  const counters = (index: number): string[] =>
    (phases[index]?.attackIds ?? []).map((id) => polyphemus?.attacks.find((attack) => attack.id === id)?.counter ?? "");
  expect(counters(0)).not.toContain("duck");
  expect(counters(1)).toContain("duck");
  expect(new Set(counters(1)).size).toBe(4);

  // The fastest warning must still leave time to read the prompt and move: a full second at least.
  for (const phase of phases) {
    for (const id of phase.attackIds) {
      const attack = polyphemus?.attacks.find((candidate) => candidate.id === id);
      expect((attack?.telegraphMs ?? 0) * phase.telegraphScale, `${phase.name}/${id}`).toBeGreaterThanOrEqual(1000);
    }
  }
});

/**
 * Plays one whole fight as a player who gets `skill` of the prompts right, takes `reactMs` to throw a strike
 * and throws every strike at `quality`. `defends` is the share of his attacks the player defends, when it is not `skill`.
 */
function playPolyphemus(seed: number, skill: number, reactMs: number, quality = 0.7, defends = skill): { seconds: number; won: boolean } {
  const polyphemus = ENEMIES.find((enemy) => enemy.id === "polyphemus");
  const boxer = STYLES.find((style) => style.id === "boxer");
  if (!polyphemus || !boxer) throw new Error("Polyphemus or the Boxer style is missing");
  let chance = seed;
  const lucky = (share: number): boolean => {
    chance = (Math.imul(chance, 1103515245) + 12345) >>> 0;
    return chance / 4294967296 < share;
  };
  let state = startFight(polyphemus, seed);
  let ms = 0;
  let decided = "";
  let good = false;
  let strikeAt = 0;
  // The finishing move is offered again each time its window runs out, and each offer is a new try.
  let finisherTries = 0;
  let finisherLeft = 0;
  const STEP = 20;
  while (state.phase.kind !== "won" && state.phase.kind !== "lost" && ms < 600_000) {
    const phase = state.phase;
    if (phase.kind === "finisher") {
      if (phase.msLeft > finisherLeft) finisherTries += 1;
      finisherLeft = phase.msLeft;
    }
    const key = `${phase.kind}:${String(state.seed)}:${String(state.playerHp)}:${String(state.enemyHp)}:${String(finisherTries)}`;
    if (key !== decided) {
      decided = key;
      good = lucky(phase.kind === "defend" ? defends : skill);
      strikeAt = ms + reactMs;
    }
    const held = new Set<string>();
    const struck: Strike[] = [];
    if (phase.kind === "defend" && good) held.add(phase.attack.counter);
    if ((phase.kind === "strike" || phase.kind === "finisher") && good && ms >= strikeAt) {
      struck.push({ move: phase.move, quality, player: 0 });
    }
    state = step(state, polyphemus, boxer, { held, struck }, STEP).state;
    ms += STEP;
  }
  return { seconds: ms / 1000, won: state.phase.kind === "won" };
}

test("Polyphemus: a player who gets most prompts right wins in 40 to 150 seconds", () => {
  const fights = Array.from({ length: 30 }, (_, index) => playPolyphemus(1000 + index * 7919, 0.85, 800));
  const average = fights.reduce((sum, fight) => sum + fight.seconds, 0) / fights.length;
  const wins = fights.filter((fight) => fight.won).length;
  // If this fails after an engine change, retune `hp` in src/enemies/defs/polyphemus.ts: fight length follows it.
  // The floor was 90 s until issue #127: the first fight is now short enough for a beginner to win inside 90 s.
  expect(average, `average fight length ${average.toFixed(0)} s`).toBeGreaterThanOrEqual(40);
  expect(average, `average fight length ${average.toFixed(0)} s`).toBeLessThanOrEqual(150);
  expect(wins, "fights won out of 30").toBeGreaterThanOrEqual(24);
});

test("Polyphemus: the fight stays in range however well the strikes are thrown", () => {
  // Damage follows strike quality, so a webcam player's fight length moves with it. Rough, clean and perfect strikes.
  for (const quality of [0.55, 0.8, 1]) {
    const fights = Array.from({ length: 30 }, (_, index) => playPolyphemus(1000 + index * 7919, 0.85, 800, quality));
    const average = fights.reduce((sum, fight) => sum + fight.seconds, 0) / fights.length;
    expect(average, `quality ${String(quality)}: average ${average.toFixed(0)} s`).toBeGreaterThanOrEqual(40);
    expect(average, `quality ${String(quality)}: average ${average.toFixed(0)} s`).toBeLessThanOrEqual(150);
    // No fight may hang: every one ends well inside the simulation's ten-minute cap.
    expect(Math.max(...fights.map((fight) => fight.seconds)), `quality ${String(quality)}: longest fight`).toBeLessThan(300);
  }
});

test("Polyphemus: a player who defends nothing loses", () => {
  // The first fight is tuned to be won (issue #127), but not by standing still: with no defence there is no opening
  // to strike in, however well the player would have thrown the strike.
  const fights = Array.from({ length: 30 }, (_, index) => playPolyphemus(500 + index * 104729, 1, 600, 1, 0));
  expect(fights.filter((fight) => fight.won).length).toBe(0);
});
