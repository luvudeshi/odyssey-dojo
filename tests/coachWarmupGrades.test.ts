// The warm-up's grades: what each step earns, the run that shows a grade after every step, the end-of-warm-up
// highlights, and that a strong warm-up gives a harder enemy than a weak one, both inside the bounds.
// The player is made up (tools/warmup/player.ts): it copies the move guide's figure at once, late, or not at all.
import { describe, expect, test } from "vitest";
import {
  MAX_LEAN, MAX_WORK_ON, POINTS, TELEGRAPH_SCALE, WARMUP_STEPS, assessWarmup, feedbackFor, gradeStep, highlights, levelOf,
  stepScore, tipFor, tuneFor, tuneLine,
} from "../src/coach";
import type { Assessment, StepFeedback, StepResult, WarmupStep } from "../src/coach";
import { FEEDBACK_MS, HOLD_MS, advance, finishGraded, nobodyThere, startGraded, timedSteps } from "../src/coach/ui/gradedRun";
import type { GradedRun } from "../src/coach/ui/gradedRun";
import { READY_MS } from "../src/coach/ui/run";
import { startFight, step as fightStep } from "../src/combat/engine";
import type { CombatInput, EnemyAttack, EnemySpec } from "../src/core/types";
import { ENEMIES } from "../src/enemies/registry";
import { STYLES } from "../src/styles/registry";
import { MIXED, frameFor } from "../tools/warmup/player";
import type { Play } from "../tools/warmup/player";

const STEP = WARMUP_STEPS[0];
if (!STEP) throw new Error("the warm-up has no steps");
const seen = (reactMs: number, quality: number, step: WarmupStep = STEP): StepResult => ({ step, done: true, reactMs, quality });
const missed = (step: WarmupStep = STEP): StepResult => ({ step, done: false, reactMs: null, quality: 0 });

/** A whole graded warm-up: the screen's loop every 11 ms, a camera frame on every third turn, as the demo page does. */
function play(plan: (moveId: string) => Play, sees = true): GradedRun {
  let run = startGraded(WARMUP_STEPS, 0);
  let asking: string | null = null;
  let askedAt = 0;
  for (let turn = 0; run.phase !== "done" && turn < 6000; turn += 1) {
    const now = turn * 11;
    const step = run.phase === "step" ? (run.steps[run.stepIndex] ?? null) : null;
    if ((step?.id ?? null) !== asking) {
      asking = step?.id ?? null;
      askedAt = now;
    }
    const frame = sees && turn % 3 === 0 ? frameFor(now, step?.moveId ?? null, step ? plan(step.moveId) : "none", now - askedAt) : null;
    run = advance(run, now, frame);
  }
  return run;
}

const GOOD = play(() => "good");
const LATE = play(() => "late");
const NONE = play(() => "none");
const MIX = play((moveId) => MIXED[moveId] ?? "good");
const tiers = (run: GradedRun): string[] => run.feedback.map((each) => each.grade.tier);
const assessed = (run: GradedRun): Assessment => finishGraded(run, assessWarmup);

function polyphemus(): EnemySpec {
  const found = ENEMIES.find((enemy) => enemy.id === "polyphemus");
  if (!found) throw new Error("Polyphemus is missing");
  return found;
}

describe("the grade for one step", () => {
  test("a move not seen needs improvement and still earns 25 points", () => {
    expect(gradeStep(missed())).toEqual({ tier: "needs_work", label: "Needs improvement", points: 25 });
  });

  test("anything the detector counted is at least Good, however slow or rough", () => {
    expect(gradeStep(seen(2499, 0))).toEqual({ tier: "good", label: "Good", points: 100 });
    for (const reactMs of [0, 600, 1200, 1800, 2400]) {
      for (const quality of [0, 0.3, 0.6, 1]) expect(gradeStep(seen(reactMs, quality)).points).toBeGreaterThanOrEqual(100);
    }
  });

  test("quick and clean is Excellent: speed and quality each count for half", () => {
    expect(gradeStep(seen(500, 1))).toEqual({ tier: "excellent", label: "Excellent!", points: 150 });
    // Within a second a middling 0.4 quality is enough; a perfect move may come as late as about 1.7 seconds.
    expect(gradeStep(seen(1000, 0.4)).tier).toBe("excellent");
    expect(gradeStep(seen(1000, 0.3)).tier).toBe("good");
    expect(gradeStep(seen(1700, 1)).tier).toBe("excellent");
    expect(gradeStep(seen(1800, 1)).tier).toBe("good");
    // The grade and the score agree: Excellent is a score of 0.82 or over.
    expect(stepScore(seen(1000, 0.4))).toBeCloseTo(0.82, 9);
  });

  test("the level follows the grades", () => {
    const of = (excellent: number, good: number, needs: number): string =>
      levelOf([...Array<StepResult>(excellent).fill(seen(500, 1)), ...Array<StepResult>(good).fill(seen(2400, 0.2)), ...Array<StepResult>(needs).fill(missed())]);
    expect(of(6, 0, 0)).toBe("good");
    expect(of(3, 3, 0)).toBe("good");
    expect(of(2, 4, 0)).toBe("average");
    expect(of(0, 6, 0)).toBe("average");
    expect(of(3, 0, 3)).toBe("average");
    expect(of(0, 3, 3)).toBe("beginner");
    expect(of(0, 0, 6)).toBe("beginner");
    expect(levelOf([])).toBe("beginner");
  });
});

describe("the graded run", () => {
  test("copying the figure at once is Excellent on every step, late is Good, not at all needs improvement", () => {
    expect(tiers(GOOD)).toEqual(WARMUP_STEPS.map(() => "excellent"));
    expect(tiers(LATE)).toEqual(WARMUP_STEPS.map(() => "good"));
    expect(tiers(NONE)).toEqual(WARMUP_STEPS.map(() => "needs_work"));
    expect(tiers(MIX)).toEqual(["excellent", "good", "needs_work", "excellent", "good", "needs_work"]);
  });

  test("the points add up as the steps end", () => {
    expect([GOOD.points, LATE.points, NONE.points, MIX.points]).toEqual([900, 600, 150, 550]);
    let run = startGraded(WARMUP_STEPS, 0);
    expect(run.points).toBe(0);
    run = advance(run, READY_MS + 2500, null);
    expect([run.phase, run.stepIndex, run.points, run.feedback.length]).toEqual(["rest", 0, 25, 1]);
  });

  test("a step ends a moment after its move is seen, a missed one runs its whole time, and each grade is shown for 1.2 s", () => {
    for (const [index, ms] of GOOD.taken.entries()) {
      const reactMs = GOOD.feedback[index]?.result.reactMs ?? NaN;
      expect(ms).toBeLessThan(1500);
      expect(ms).toBeGreaterThanOrEqual(reactMs + HOLD_MS - 40);
    }
    expect(NONE.taken).toEqual(WARMUP_STEPS.map((step) => step.ms));
    let run = startGraded(WARMUP_STEPS, 0);
    run = advance(run, READY_MS + 2500, null);
    expect(advance(run, READY_MS + 2500 + FEEDBACK_MS - 1, null)).toMatchObject({ phase: "rest", stepIndex: 0, msLeft: 1 });
    expect(advance(run, READY_MS + 2500 + FEEDBACK_MS, null)).toMatchObject({ phase: "step", stepIndex: 1, msLeft: 2500 });
  });

  test("the skill check, handed the real timing, sees the same steps the player was shown", () => {
    for (const run of [GOOD, LATE, NONE, MIX]) {
      const assessment = assessed(run);
      expect(assessment.steps.map((result) => result.done)).toEqual(run.feedback.map((each) => each.result.done));
      expect(assessment.steps.map((result) => gradeStep(result).tier)).toEqual(tiers(run));
      expect(timedSteps(run).map((step) => [step.ms, step.restMs])).toEqual(run.taken.map((ms) => [ms, FEEDBACK_MS]));
    }
    expect([assessed(GOOD).level, assessed(LATE).level, assessed(MIX).level, assessed(NONE).level]).toEqual(["good", "average", "average", "beginner"]);
  });

  test("a move made while the grade is on screen is not counted", () => {
    const steps = timedSteps(GOOD);
    expect(assessWarmup(GOOD.frames, READY_MS, steps).steps.every((result) => result.done)).toBe(true);
    // The same frames against windows that open only once each move is over: nothing is asked for while it is made.
    const first = steps[0];
    if (!first) throw new Error("no steps");
    const shifted = steps.map((step, index) => ({ ...step, ms: FEEDBACK_MS - 200, restMs: (steps[index + 1]?.ms ?? 0) + 200 }));
    const during = assessWarmup(GOOD.frames, READY_MS + first.ms + 200, shifted);
    expect(during.steps.some((result) => result.done)).toBe(false);
  });

  test("nobody in the picture is not a warm-up, and a finished run does not change", () => {
    let empty = startGraded(WARMUP_STEPS, 0);
    for (let now = 0; now <= READY_MS; now += 100) empty = advance(empty, now, null);
    expect(nobodyThere(empty)).toBe(true);
    expect(nobodyThere(startGraded(WARMUP_STEPS, 0))).toBe(false);
    expect(nobodyThere(GOOD)).toBe(false);
    expect(advance(GOOD, 99_000, frameFor(99_000, null, "none", 0))).toBe(GOOD);
  });
});

describe("the end of the warm-up", () => {
  test("total, best move, and up to three moves to work on, lowest first, each with one line", () => {
    const sum = highlights(MIX.feedback);
    expect([sum.points, sum.maxPoints]).toEqual([550, 900]);
    expect(sum.counts).toEqual({ excellent: 2, good: 2, needs_work: 2 });
    expect(["jab", "dodge_left"]).toContain(sum.best?.step.moveId);
    expect(sum.workOn.map((each) => each.step.moveId).slice(0, 2)).toEqual(["block", "duck"]);
    expect(["cross", "dodge_right"]).toContain(sum.workOn[2]?.step.moveId);
    expect(sum.workOn.length).toBeLessThanOrEqual(MAX_WORK_ON);
    expect([sum.allGood, sum.sharpen]).toEqual([false, null]);
    for (const each of sum.workOn) {
      expect(each.tip.length, each.tip).toBeGreaterThan(0);
      expect(each.tip.length, each.tip).toBeLessThanOrEqual(90);
    }
  });

  test("nothing seen: every move needs improvement, three are named, and there is no best move", () => {
    const sum = highlights(NONE.feedback);
    expect(sum.points).toBe(6 * POINTS.needs_work);
    expect(sum.best).toBeNull();
    expect(sum.workOn.map((each) => each.step.moveId)).toEqual(["jab", "cross", "block"]);
  });

  test("everything Good or better says so, and still names the weakest as the one to sharpen", () => {
    for (const run of [GOOD, LATE]) {
      const sum = highlights(run.feedback);
      expect(sum.allGood).toBe(true);
      expect(sum.workOn).toEqual([]);
      expect(sum.sharpen?.tip.length).toBeGreaterThan(0);
      const lowest = Math.min(...run.feedback.map((each) => stepScore(each.result)));
      expect(stepScore(sum.sharpen?.result ?? missed())).toBe(lowest);
    }
    expect(highlights([])).toMatchObject({ points: 0, best: null, workOn: [], allGood: false, sharpen: null });
  });

  test("every step has a tip, from what was measured or else the move's own line", () => {
    for (const step of WARMUP_STEPS) {
      expect(feedbackFor(missed(step)).tip).toBe(tipFor(step.moveId));
      expect(tipFor(step.moveId).length).toBeGreaterThan(0);
    }
    const all: readonly StepFeedback[] = [...GOOD.feedback, ...LATE.feedback, ...NONE.feedback];
    for (const each of all) {
      expect(each.tip.length, each.step.id).toBeGreaterThan(0);
      expect(each.tip.length, each.tip).toBeLessThanOrEqual(90);
    }
  });
});

describe("the fight follows the warm-up", () => {
  const enemy = polyphemus();
  const strong = assessed(GOOD);
  const weak = assessed(NONE);
  const warnings = (spec: EnemySpec): number[] => spec.attacks.map((attack) => attack.telegraphMs);

  test("a strong warm-up gives less warning than none, a weak one more, and both stay inside the bounds", () => {
    expect([TELEGRAPH_SCALE.good, TELEGRAPH_SCALE.average, TELEGRAPH_SCALE.beginner]).toEqual([0.85, 1, 1.25]);
    for (const spec of ENEMIES) {
      const [hard, plain, gentle] = [warnings(tuneFor(spec, strong)), warnings(spec), warnings(tuneFor(spec, weak))];
      for (const [index, ms] of plain.entries()) {
        expect(hard[index]).toBe(Math.round(ms * 0.85));
        expect(gentle[index]).toBe(Math.round(ms * 1.25));
        expect(hard[index]).toBeLessThan(ms);
        expect(gentle[index]).toBeGreaterThan(ms);
      }
      for (const tuned of [tuneFor(spec, strong), tuneFor(spec, weak)]) {
        expect(tuned.hp).toBe(spec.hp);
        expect(tuned.phases).toEqual(spec.phases);
        for (const [index, attack] of tuned.attacks.entries()) {
          const was = spec.attacks[index];
          expect(attack.damage).toBe(was?.damage);
          expect((attack.weight ?? 1) / (was?.weight ?? 1)).toBeGreaterThanOrEqual(1);
          expect((attack.weight ?? 1) / (was?.weight ?? 1)).toBeLessThanOrEqual(MAX_LEAN + 1e-9);
        }
      }
    }
  });

  test("in the fight itself an attack comes with less warning after a strong warm-up and more after a weak one", () => {
    const style = STYLES[0];
    if (!style) throw new Error("no fighting style");
    const idle: CombatInput = { held: new Set(), struck: [] };
    /** The first attack of a fight, and how long the engine shows it before it lands. */
    const firstAttack = (spec: EnemySpec): { attack: EnemyAttack; shownMs: number } => {
      let state = startFight(spec, 7);
      for (let turn = 0; turn < 2000 && state.phase.kind !== "defend"; turn += 1) state = fightStep(state, spec, style, idle, 16).state;
      if (state.phase.kind !== "defend") throw new Error("no attack came");
      return { attack: state.phase.attack, shownMs: state.phase.totalMs };
    };
    // The weights lean differently, so the first attack may be another one: each is compared with the same attack untuned.
    const share = (spec: EnemySpec): number => {
      const { attack, shownMs } = firstAttack(spec);
      const plainMs = enemy.attacks.find((each) => each.id === attack.id)?.telegraphMs ?? NaN;
      // The fight opens in the enemy's first phase, which stretches every warning by its own scale.
      return shownMs / (plainMs * (enemy.phases?.[0]?.telegraphScale ?? 1));
    };
    expect(share(enemy)).toBe(1);
    expect(share(tuneFor(enemy, strong))).toBeCloseTo(0.85, 2);
    expect(share(tuneFor(enemy, weak))).toBeCloseTo(1.25, 2);
  });

  test("the player is told in one line what was tuned", () => {
    expect(tuneLine({ ...strong, habits: [] }, "Polyphemus")).toBe("Polyphemus will press you harder: 15% less warning before every attack.");
    expect(tuneLine(weak, "Polyphemus")).toMatch(/^Polyphemus will swing slower for you: 25% more warning before every attack\. Expect more attacks you have to /);
    expect(tuneLine(weak)).toMatch(/^Your enemies will swing slower for you/);
    expect(tuneLine({ ...assessed(LATE), habits: [] })).toBe("Your enemies will fight at the usual pace.");
    expect(tuneLine({ level: "average", focus: [], strong: [], habits: [], steps: [] })).toBe("Your enemies will fight at the usual pace.");
  });
});
