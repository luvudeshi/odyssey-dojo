// The start-of-game skill check on made-up warm-ups: what level it gives, what it says to work on,
// and what the tuned monster looks like. Each warm-up is a second of standing, then each step's move
// (the same good sequences as tests/moves/detectors.test.ts) placed inside that step's time window.
import { describe, expect, test } from "vitest";
import { MAX_LEAN, SKIPPED, WARMUP_STEPS, assessWarmup, stepScore, summary, tuneFor } from "../src/coach";
import type { Assessment, WarmupStep } from "../src/coach";
import type { EnemySpec, PoseFrame } from "../src/core/types";
import { ENEMIES } from "../src/enemies/registry";
import { MOVES } from "../src/moves/registry";
import { STYLES } from "../src/styles/registry";
import { PLAYERS, measure } from "./balance/simulate";
import { body, recordingOn, shouldersAt } from "./helpers/anyBody";
import type { Key } from "./helpers/poses";
import { COCKED, DOWN, GUARD, NEUTRAL, PUNCH, pose, sequence } from "./helpers/poses";

/** Each warm-up move done right, as keys after the standing start. */
const GOOD: Record<string, Key[]> = {
  jab: [{ t: 150, pose: pose(COCKED, DOWN) }, { t: 300, pose: pose(PUNCH, DOWN) }],
  cross: [{ t: 150, pose: pose(DOWN, COCKED) }, { t: 300, pose: pose(DOWN, PUNCH) }],
  block: [{ t: 250, pose: pose(GUARD) }, { t: 450, pose: pose(GUARD) }],
  duck: [{ t: 300, pose: pose(DOWN, DOWN, 0, 0.12) }, { t: 500, pose: pose(DOWN, DOWN, 0, 0.12) }],
  dodge_left: [{ t: 300, pose: pose(DOWN, DOWN, -0.12, 0) }, { t: 500, pose: pose(DOWN, DOWN, -0.12, 0) }],
  dodge_right: [{ t: 300, pose: pose(DOWN, DOWN, 0.12, 0) }, { t: 500, pose: pose(DOWN, DOWN, 0.12, 0) }],
};

/** `sequence` puts 20 standing frames first, 33 ms apart: the calibration. The first step starts right after. */
const STARTED_AT = 660;
const TOTAL_MS = WARMUP_STEPS.reduce((sum, step) => sum + step.ms, 0);

/** A whole warm-up. `delay` says how long after each step starts the player begins the move; null: stands still. */
function warmup(delay: (step: WarmupStep) => number | null): PoseFrame[] {
  const keys: Key[] = [{ t: 0, pose: NEUTRAL }];
  let stepStart = 0;
  for (const step of WARMUP_STEPS) {
    const wait = delay(step);
    const made = GOOD[step.moveId] ?? [];
    if (wait !== null) {
      const at = stepStart + wait;
      keys.push({ t: at, pose: NEUTRAL }, ...made.map((key) => ({ t: at + key.t, pose: key.pose })));
      keys.push({ t: at + (made.at(-1)?.t ?? 0) + 250, pose: NEUTRAL });
    }
    stepStart += step.ms;
  }
  keys.push({ t: TOTAL_MS, pose: NEUTRAL });
  return sequence(keys);
}

const assess = (frames: readonly PoseFrame[]): Assessment => assessWarmup(frames, STARTED_AT, WARMUP_STEPS);
const FAST = assess(warmup(() => 200));
const LATE = assess(warmup(() => 1600));
const STANDS = assess(warmup(() => null));
const NO_BLOCK = assess(warmup((step) => (step.moveId === "block" ? null : 200)));

function polyphemus(): EnemySpec {
  const found = ENEMIES.find((enemy) => enemy.id === "polyphemus");
  if (!found) throw new Error("Polyphemus is missing");
  return found;
}

describe("the warm-up itself", () => {
  test("takes at most 15 seconds and asks only for real moves", () => {
    expect(TOTAL_MS).toBeLessThanOrEqual(15_000);
    expect(WARMUP_STEPS.map((step) => step.moveId)).toEqual(["jab", "cross", "block", "dodge_left", "dodge_right", "duck"]);
    for (const step of WARMUP_STEPS) {
      expect(MOVES.has(step.moveId), step.moveId).toBe(true);
      expect(step.say.length, step.say).toBeLessThanOrEqual(40);
      expect(step.ms).toBeGreaterThan(0);
    }
    expect(new Set(WARMUP_STEPS.map((step) => step.id)).size).toBe(WARMUP_STEPS.length);
  });
});

describe("assessWarmup", () => {
  test("a player who makes every move fast is good, with nothing to work on", () => {
    expect(FAST.steps.map((result) => result.done)).toEqual([true, true, true, true, true, true]);
    for (const result of FAST.steps) expect(result.reactMs).toBeLessThan(700);
    expect(FAST.level).toBe("good");
    expect(FAST.focus).toEqual([]);
    expect(FAST.strong).toEqual(expect.arrayContaining(["block", "dodge_left", "dodge_right", "duck"]));
  });

  test("a player who makes every move, but late in each window, is average", () => {
    expect(LATE.steps.every((result) => result.done)).toBe(true);
    for (const result of LATE.steps) expect(result.reactMs).toBeGreaterThan(1700);
    expect(LATE.level).toBe("average");
    expect(LATE.strong).toEqual([]);
  });

  test("a player who only stands is a beginner with two things to work on, defenses first", () => {
    expect(STANDS.steps.map((result) => [result.done, result.reactMs, result.quality])).toEqual(
      WARMUP_STEPS.map(() => [false, null, 0]),
    );
    expect(STANDS.level).toBe("beginner");
    expect(STANDS.focus.map((focus) => focus.moveId)).toEqual(["block", "dodge_left"]);
    expect(STANDS.strong).toEqual([]);
    // Both side steps were missed, so they are one thing to work on, with one tip for both sides.
    expect(STANDS.focus[1]?.tip).toMatch(/either side/);
    expect(summary(STANDS)).toEqual(["Level: beginner. Fights will give you more warning.", "Work on: Block, Dodge."]);
  });

  test("a player who never blocks has block as the first, and only, focus", () => {
    expect(NO_BLOCK.focus.map((focus) => focus.moveId)).toEqual(["block"]);
    expect(NO_BLOCK.focus[0]?.tip).toBe("Bring both hands up to your face before anything else.");
    expect(NO_BLOCK.strong).not.toContain("block");
    expect(summary(NO_BLOCK)[1]).toBe("Work on: Block.");
  });

  test("a step's move made in another step's window does not count", () => {
    // Every move 200 ms into the step BEFORE its own (the jab during the calibration is dropped).
    const early = assess(warmup(() => 200).map((frame) => ({ ...frame, t: frame.t - 2500 })).filter((frame) => frame.t >= 0));
    expect(early.steps.some((result) => result.done)).toBe(false);
  });

  test.each([
    body("0.6x body size", { size: 0.6 }),
    body("far: shoulders 12% of frame width", { zoom: shouldersAt(0.12) }),
    body("0.6x body size, 30% left of frame", { size: 0.6, shift: -0.3 }),
  ])("$name: the same warm-ups read the same", (who) => {
    const seen = (frames: PoseFrame[]): Assessment => assess(recordingOn(who, frames));
    const fast = seen(warmup(() => 200));
    expect([fast.level, fast.focus]).toEqual(["good", []]);
    expect(seen(warmup(() => null)).level).toBe("beginner");
    const noBlock = seen(warmup((step) => (step.moveId === "block" ? null : 200)));
    expect(noBlock.focus.map((focus) => focus.moveId)).toEqual(["block"]);
    expect(noBlock.steps.map((result) => result.done)).toEqual(NO_BLOCK.steps.map((result) => result.done));
  });

  test("no frames, too few frames and frames out of order are all safe", () => {
    expect(assessWarmup([], 0, WARMUP_STEPS).level).toBe("beginner");
    expect(assessWarmup(warmup(() => 200).slice(0, 5), STARTED_AT, WARMUP_STEPS).level).toBe("beginner");
    expect(assess([...warmup(() => 200)].reverse())).toEqual(FAST);
  });

  test("every score is between 0 and 1, and every tip and summary line is short", () => {
    for (const assessment of [FAST, LATE, STANDS, NO_BLOCK, SKIPPED]) {
      for (const result of assessment.steps) {
        expect(stepScore(result)).toBeGreaterThanOrEqual(0);
        expect(stepScore(result)).toBeLessThanOrEqual(1);
      }
      expect(assessment.focus.length).toBeLessThanOrEqual(2);
      for (const focus of assessment.focus) {
        expect(focus.tip.length, focus.tip).toBeGreaterThan(0);
        expect(focus.tip.length, focus.tip).toBeLessThanOrEqual(90);
      }
      expect(summary(assessment).length).toBeGreaterThanOrEqual(2);
      expect(summary(assessment).length).toBeLessThanOrEqual(3);
    }
    // One weak move at a time, so every tip in the table is checked.
    for (const step of WARMUP_STEPS) {
      const one = assess(warmup((other) => (other.id === step.id ? null : 200)));
      expect(one.focus.map((focus) => focus.moveId)).toEqual([step.moveId]);
      expect(one.focus[0]?.tip.length).toBeLessThanOrEqual(90);
    }
  });
});

describe("tuneFor", () => {
  const enemy = polyphemus();
  /** Everything tuneFor must leave alone: the enemy without warning times and weights. */
  const fixed = (spec: EnemySpec): unknown => ({
    ...spec,
    attacks: spec.attacks.map((attack) => ({ ...attack, telegraphMs: 0, weight: 0 })),
  });
  const warnings = (spec: EnemySpec): number[] => spec.attacks.map((attack) => attack.telegraphMs);
  const weight = (spec: EnemySpec, id: string): number => spec.attacks.find((attack) => attack.id === id)?.weight ?? 1;

  test("keyboard-only play, and an average player with nothing weak, get the enemy itself", () => {
    expect(tuneFor(enemy, SKIPPED)).toBe(enemy);
    expect(tuneFor(enemy, { ...FAST, level: "average", habits: [] })).toBe(enemy);
    expect(summary(SKIPPED)).toEqual(["Level: average. Fights run at the normal speed.", "No warm-up, so the fights are the usual ones."]);
  });

  test("a beginner gets 1.25 times the warning, a good player 0.85 times, in whole milliseconds", () => {
    expect(warnings(tuneFor(enemy, STANDS))).toEqual(warnings(enemy).map((ms) => Math.round(ms * 1.25)));
    expect(warnings(tuneFor(enemy, FAST))).toEqual(warnings(enemy).map((ms) => Math.round(ms * 0.85)));
    expect(warnings(tuneFor(enemy, { ...NO_BLOCK, level: "average" }))).toEqual(warnings(enemy));
    expect(warnings(tuneFor({ ...enemy, attacks: [{ ...enemy.attacks[0], telegraphMs: 1001 }] }, FAST))).toEqual([851]);
  });

  test("only warning times and weights change, on every enemy, and the input is left alone", () => {
    for (const spec of ENEMIES) {
      const before = JSON.stringify(spec);
      for (const assessment of [FAST, LATE, STANDS, NO_BLOCK]) {
        const tuned = tuneFor(spec, assessment);
        expect(fixed(tuned)).toEqual(fixed(spec));
        for (const attack of tuned.attacks) {
          const was = weight(spec, attack.id);
          expect(attack.weight ?? 1).toBeGreaterThanOrEqual(was);
          expect(attack.weight ?? 1).toBeLessThanOrEqual(was * MAX_LEAN + 1e-9);
        }
      }
      expect(JSON.stringify(spec)).toBe(before);
    }
  });

  test("weights lean toward the attacks the focus moves stop", () => {
    const noBlock = tuneFor(enemy, { ...NO_BLOCK, habits: [] });
    expect(weight(noBlock, "grab")).toBe(MAX_LEAN);
    expect(weight(noBlock, "club_left")).toBe(1);
    expect(weight(noBlock, "club_right")).toBe(1);
    // Both side steps weak: one focus, but both club swings come up more.
    const stands = tuneFor(enemy, { ...STANDS, habits: [] });
    expect([weight(stands, "grab"), weight(stands, "club_left"), weight(stands, "club_right")]).toEqual([MAX_LEAN, MAX_LEAN, MAX_LEAN]);
    expect(weight(stands, "boulder")).toBeLessThan(MAX_LEAN);
    // A weak punch changes no weights: the engine picks strikes without them.
    const noJab = assess(warmup((step) => (step.moveId === "jab" ? null : 200)));
    expect(tuneFor(enemy, { ...noJab, habits: [] }).attacks.map((attack) => attack.weight ?? 1)).toEqual([1, 1, 1, 1]);
  });

  test("the simulated beginner wins Polyphemus at least as often against the tuned enemy", () => {
    const style = STYLES.find((candidate) => candidate.id === "boxer");
    const beginner = PLAYERS.find((player) => player.id === "beginner");
    if (!style || !beginner) throw new Error("the Boxer style or the beginner player is missing");
    expect(measure(tuneFor(enemy, STANDS), style, beginner).wins).toBeGreaterThanOrEqual(measure(enemy, style, beginner).wins);
  });
});
