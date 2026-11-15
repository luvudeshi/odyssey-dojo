// Fight pacing for every stop after the Cyclops: each fight is the right length for an average player,
// and each stop along the route is harder than the one before. Same method as the Polyphemus pacing test.
import { expect, test } from "vitest";
import { startFight, step } from "../src/combat/engine";
import type { EnemySpec, Strike } from "../src/core/types";
import { ENEMIES } from "../src/enemies/registry";
import { MOVES } from "../src/moves/registry";
import { STYLES } from "../src/styles/registry";

const LATER_STOPS = ["circe", "sirens", "scylla", "charybdis", "suitors"];

interface Fight {
  readonly seconds: number;
  readonly won: boolean;
  /** Health the player has left at the end, out of 100. */
  readonly hpLeft: number;
}

/**
 * Plays one whole fight as a player who gets `skill` of the prompts right, takes `reactMs` to throw a strike
 * and throws every strike at `quality`.
 */
function play(enemy: EnemySpec, styleId: string, seed: number, skill: number, reactMs: number, quality: number): Fight {
  const style = STYLES.find((candidate) => candidate.id === styleId);
  if (!style) throw new Error(`no style ${styleId}`);
  let chance = seed;
  const lucky = (): boolean => {
    chance = (Math.imul(chance, 1103515245) + 12345) >>> 0;
    return chance / 4294967296 < skill;
  };
  let state = startFight(enemy, seed);
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
      good = lucky();
      strikeAt = ms + reactMs;
    }
    const held = new Set<string>();
    const struck: Strike[] = [];
    if (phase.kind === "defend" && good) held.add(phase.attack.counter);
    if ((phase.kind === "strike" || phase.kind === "finisher") && good && ms >= strikeAt) {
      struck.push({ move: phase.move, quality, player: 0 });
    }
    state = step(state, enemy, style, { held, struck }, STEP).state;
    ms += STEP;
  }
  return { seconds: ms / 1000, won: state.phase.kind === "won", hpLeft: Math.max(0, state.playerHp) };
}

interface Summary {
  readonly seconds: number;
  readonly longest: number;
  readonly wins: number;
  readonly hpLeft: number;
}

const FIGHTS = 30;

/** Thirty fights by an average player: 85% of prompts right, 0.8 s to throw a strike. */
function average(id: string, styleId = "boxer", quality = 0.7): Summary {
  const enemy = ENEMIES.find((candidate) => candidate.id === id);
  if (!enemy) throw new Error(`no enemy ${id}`);
  const fights = Array.from({ length: FIGHTS }, (_, index) => play(enemy, styleId, 1000 + index * 7919, 0.85, 800, quality));
  const mean = (pick: (fight: Fight) => number) => fights.reduce((sum, fight) => sum + pick(fight), 0) / fights.length;
  return {
    seconds: mean((fight) => fight.seconds),
    longest: Math.max(...fights.map((fight) => fight.seconds)),
    wins: fights.filter((fight) => fight.won).length,
    hpLeft: mean((fight) => fight.hpLeft),
  };
}

test("every later stop: an average player's fight lasts 60 to 150 seconds and is usually won", () => {
  for (const id of LATER_STOPS) {
    const fight = average(id);
    // If this fails after an engine change, retune `hp` in that stop's file: fight length follows it.
    expect(fight.seconds, `${id}: average ${fight.seconds.toFixed(0)} s`).toBeGreaterThanOrEqual(60);
    expect(fight.seconds, `${id}: average ${fight.seconds.toFixed(0)} s`).toBeLessThanOrEqual(150);
    expect(fight.longest, `${id}: longest fight`).toBeLessThan(300);
    expect(fight.wins, `${id}: fights won out of ${String(FIGHTS)}`).toBeGreaterThanOrEqual(18);
  }
});

test("every later stop stays in range in every fighting style and however well the strikes are thrown", () => {
  for (const id of LATER_STOPS) {
    for (const style of STYLES) {
      const fight = average(id, style.id);
      expect(fight.seconds, `${id} as ${style.id}: ${fight.seconds.toFixed(0)} s`).toBeGreaterThanOrEqual(60);
      expect(fight.seconds, `${id} as ${style.id}: ${fight.seconds.toFixed(0)} s`).toBeLessThanOrEqual(150);
    }
    for (const quality of [0.55, 1]) {
      const fight = average(id, "boxer", quality);
      expect(fight.seconds, `${id} at quality ${String(quality)}: ${fight.seconds.toFixed(0)} s`).toBeGreaterThanOrEqual(60);
      expect(fight.seconds, `${id} at quality ${String(quality)}: ${fight.seconds.toFixed(0)} s`).toBeLessThanOrEqual(150);
    }
  }
});

test("the route gets harder at every stop: the same player ends each fight with less health and wins fewer", () => {
  const route = ["polyphemus", ...LATER_STOPS].map((id) => ({ id, ...average(id) }));
  route.forEach((stop, index) => {
    const before = route[index - 1];
    if (!before) return;
    // At least one point of health harder than the stop before, so the order cannot flip on a small retune.
    // It was two points until part 3 of issue #127: a beginner now wins at least 15% of fights at every stop,
    // which leaves this player about 9 points between Polyphemus and the Suitors, too few for five steps of two.
    expect(stop.hpLeft, `${stop.id} (${stop.hpLeft.toFixed(1)}) after ${before.id} (${before.hpLeft.toFixed(1)})`).toBeLessThanOrEqual(before.hpLeft - 1);
    expect(stop.wins, `${stop.id} wins after ${before.id}`).toBeLessThanOrEqual(before.wins);
  });
  // The first stop is forgiving and the last is the hardest. Until part 3 of issue #127 this asked that the
  // player loses at least one fight at the Suitors; with a beginner winning 1 in 4 there, this player never does.
  // By the lead's ruling on that issue it now asks that the Suitors cost at least 5 more health than Polyphemus.
  expect(route[0]?.wins).toBe(FIGHTS);
  expect(route.at(-1)?.hpLeft ?? 100).toBeLessThanOrEqual((route[0]?.hpLeft ?? 0) - 5);
});

test("every later stop has three phases, and a last move that is true to how Odysseus leaves it", () => {
  const finishers: Record<string, string | undefined> = {};
  for (const id of LATER_STOPS) {
    const enemy = ENEMIES.find((candidate) => candidate.id === id);
    expect(enemy?.phases?.length, id).toBe(3);
    finishers[id] = enemy?.finisher;
    if (enemy?.finisher) expect(MOVES.get(enemy.finisher)?.kind, id).toBe("strike");
    const scales = (enemy?.phases ?? []).map((phase) => phase.telegraphScale);
    expect(scales, id).toEqual([...scales].sort((a, b) => b - a));
    for (const phase of enemy?.phases ?? []) {
      for (const attackId of phase.attackIds) {
        const attack = enemy?.attacks.find((candidate) => candidate.id === attackId);
        expect(attack, `${id}/${phase.name}/${attackId}`).toBeDefined();
        // The fastest warning still leaves a full second to read the prompt and move.
        expect((attack?.telegraphMs ?? 0) * phase.telegraphScale, `${id}/${phase.name}/${attackId}`).toBeGreaterThanOrEqual(1000);
      }
    }
  }
  // He draws his sword on Circe and kills the suitors with spears. The Sirens, Scylla and Charybdis he only gets past,
  // so their last move is the getting past (issue #33): the oar stroke, rowing hard, the reach for the fig tree.
  expect(finishers).toEqual({
    circe: "overhead_strike",
    sirens: "double_palm",
    scylla: "chain_punch",
    charybdis: "rising_palm",
    suitors: "spear_thrust",
  });
});
