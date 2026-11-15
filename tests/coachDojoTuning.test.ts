// What a finished Dojo session does to the fights (issue #172), and the one line the end screen says about it.
// The game keeps `assessmentFrom(summary)` when Done is pressed and tunes every monster with `tuneFor`. Here a weak,
// a middling and a strong session go the same way, the real combat engine is stepped to the first attack to read the
// warning time, and the line is pinned for each. The sessions are made-up grades, not a real body.
import { describe, expect, test } from "vitest";
import { MAX_LEAN, assessmentFrom, gradeRep, summariseDojo, tuneFor, tuningLine, tuningOf } from "../src/coach";
import type { Assessment, DojoRep, GradeTier, RepResult } from "../src/coach";
import { TELEGRAPH_SCALE } from "../src/coach/warmup";
import { startFight, step } from "../src/combat/engine";
import type { CombatInput, EnemyAttack, EnemySpec } from "../src/core/types";
import { ENEMIES } from "../src/enemies/registry";
import { MOVES } from "../src/moves/registry";
import { enemyFor } from "../src/screens/flow";
import { STYLES } from "../src/styles/registry";
import { need } from "./helpers/need";

const STRIKES = ["jab", "cross", "hook", "uppercut"];
const DEFENDS = ["block", "duck", "dodge_left", "dodge_right"];

const rep = (moveId: string, tier: GradeTier): DojoRep => {
  const result: RepResult = tier === "needs_work"
    ? { counted: false, quality: 0, peak: 0.2, tip: null, part: null }
    : { counted: true, quality: tier === "excellent" ? 0.9 : 0.4, peak: 1, tip: null, part: null };
  return gradeRep({ ...need(MOVES.get(moveId)), quality: () => 0 }, result, tier === "needs_work" ? null : 500);
};
/** A session of three tries at every move, each move graded by `tier`. */
const session = (tier: (moveId: string) => GradeTier): DojoRep[] =>
  [...STRIKES, ...DEFENDS].flatMap((id) => [rep(id, tier(id)), rep(id, tier(id)), rep(id, tier(id))]);
/** The assessment the game keeps: the Done button hands over the summary, and the game calls `assessmentFrom` on it. */
const kept = (reps: DojoRep[]): Assessment => assessmentFrom(summariseDojo(reps));

// Weak: the punches only just count and no defend is seen. Middling: every try counts, none well. Strong: all Excellent.
const WEAK = kept(session((id) => (DEFENDS.includes(id) ? "needs_work" : "good")));
const NOTHING = kept(session(() => "needs_work"));
const MIDDLING = kept(session(() => "good"));
const STRONG = kept(session(() => "excellent"));

const polyphemus = need(ENEMIES.find((enemy) => enemy.id === "polyphemus"));
const style = need(STYLES[0]);
const IDLE: CombatInput = { held: new Set(), struck: [] };

/** The first attack of a fight, and how long the engine shows it before it lands. */
function firstAttack(spec: EnemySpec, seed: number): { attack: EnemyAttack; shownMs: number } {
  let state = startFight(spec, seed);
  for (let turn = 0; turn < 2000 && state.phase.kind !== "defend"; turn += 1) state = step(state, spec, style, IDLE, 16).state;
  if (state.phase.kind !== "defend") throw new Error("no attack came");
  return { attack: state.phase.attack, shownMs: state.phase.totalMs };
}

/** The warning the engine gives for the first attack, over the warning the same attack has untuned in the same phase. */
function share(plain: EnemySpec, tuned: EnemySpec, seed: number): number {
  const { attack, shownMs } = firstAttack(tuned, seed);
  // The weights may lean, so the first attack may be another one: it is compared with itself untuned.
  const plainMs = need(plain.attacks.find((each) => each.id === attack.id)).telegraphMs;
  return shownMs / Math.round(plainMs * (plain.phases?.[0]?.telegraphScale ?? 1));
}

describe("the sessions as the game sees them", () => {
  test("weak is a beginner, middling is average, strong is good", () => {
    expect([WEAK.level, NOTHING.level, MIDDLING.level, STRONG.level]).toEqual(["beginner", "beginner", "average", "good"]);
    expect(WEAK.focus.map((focus) => focus.moveId)).toEqual(["block", "duck"]);
    expect(MIDDLING.focus).toEqual([]);
    expect(STRONG.focus).toEqual([]);
  });

  test("the summary the Done button hands over is enough: it gives the same assessment as the tries themselves", () => {
    const reps = session((id) => (DEFENDS.includes(id) ? "needs_work" : "good"));
    expect(assessmentFrom(summariseDojo(reps))).toEqual(assessmentFrom({ reps }));
  });
});

describe("the fight after a session", () => {
  test("the engine shows the first attack for longer after a weak session, the same after a middling one, shorter after a strong one", () => {
    expect([TELEGRAPH_SCALE.beginner, TELEGRAPH_SCALE.average, TELEGRAPH_SCALE.good]).toEqual([1.25, 1, 0.85]);
    for (const seed of [1, 7, 42]) {
      expect(share(polyphemus, polyphemus, seed)).toBe(1);
      expect(share(polyphemus, enemyFor(polyphemus, WEAK), seed)).toBeCloseTo(TELEGRAPH_SCALE.beginner, 2);
      expect(share(polyphemus, enemyFor(polyphemus, MIDDLING), seed)).toBe(1);
      expect(share(polyphemus, enemyFor(polyphemus, STRONG), seed)).toBeCloseTo(TELEGRAPH_SCALE.good, 2);
    }
  });

  test("a middling session with nothing missed changes nothing at all, and no session is the registry's own monster", () => {
    for (const enemy of ENEMIES) {
      expect(enemyFor(enemy, MIDDLING)).toBe(enemy);
      expect(enemyFor(enemy, null)).toBe(enemy);
    }
  });

  test("every warning time moves by the level's scale, on every monster", () => {
    for (const enemy of ENEMIES) {
      const [gentle, hard] = [tuneFor(enemy, WEAK), tuneFor(enemy, STRONG)];
      enemy.attacks.forEach((attack, index) => {
        expect(need(gentle.attacks[index]).telegraphMs).toBe(Math.round(attack.telegraphMs * TELEGRAPH_SCALE.beginner));
        expect(need(hard.attacks[index]).telegraphMs).toBe(Math.round(attack.telegraphMs * TELEGRAPH_SCALE.good));
      });
    }
  });

  test("damage, health, phases, weak spots and attack ids never change; a weight only ever grows, and by no more than the cap", () => {
    for (const enemy of ENEMIES) {
      for (const assessment of [WEAK, NOTHING, MIDDLING, STRONG]) {
        const tuned = tuneFor(enemy, assessment);
        expect(tuned.hp).toBe(enemy.hp);
        expect(tuned.phases).toEqual(enemy.phases);
        expect(tuned.weakSpots).toEqual(enemy.weakSpots);
        expect(tuned.strikeWindowMs).toBe(enemy.strikeWindowMs);
        expect(tuned.finisher).toBe(enemy.finisher);
        expect(tuned.attacks.map((attack) => attack.id)).toEqual(enemy.attacks.map((attack) => attack.id));
        expect(tuned.attacks.map((attack) => attack.damage)).toEqual(enemy.attacks.map((attack) => attack.damage));
        expect(tuned.attacks.map((attack) => attack.counter)).toEqual(enemy.attacks.map((attack) => attack.counter));
        enemy.attacks.forEach((attack, index) => {
          const lean = (need(tuned.attacks[index]).weight ?? 1) / (attack.weight ?? 1);
          expect(lean).toBeGreaterThanOrEqual(1);
          expect(lean).toBeLessThanOrEqual(MAX_LEAN + 1e-9);
        });
      }
    }
  });

  test("missed defends make their attacks come up more often; missed punches change no weights", () => {
    const leaned = tuneFor(polyphemus, WEAK);
    const heavier = polyphemus.attacks.filter((attack, index) => (need(leaned.attacks[index]).weight ?? 1) > (attack.weight ?? 1));
    expect(heavier.length).toBeGreaterThan(0);
    for (const attack of heavier) expect(["block", "duck"]).toContain(attack.counter);
    // With every move missed the two weakest are punches, and no attack is stopped by a punch.
    expect(NOTHING.focus.map((focus) => focus.moveId)).toEqual(["jab", "cross"]);
    for (const enemy of ENEMIES) {
      expect(tuneFor(enemy, NOTHING).attacks.map((attack) => attack.weight)).toEqual(enemy.attacks.map((attack) => attack.weight));
    }
  });
});

describe("the line on the end screen", () => {
  test("the three cases, word for word", () => {
    expect(tuningLine(WEAK, ENEMIES)).toBe("Monsters will swing slower for you: 25% more warning before every attack. Expect more attacks you have to block or duck.");
    expect(tuningLine(MIDDLING, ENEMIES)).toBe("Monsters will fight at the usual pace.");
    expect(tuningLine(STRONG, ENEMIES)).toBe("Monsters will swing faster for you: 15% less warning before every attack.");
  });

  test("it says only what the tuning does: no word about blocking when no weight leaned", () => {
    expect(tuningLine(NOTHING, ENEMIES)).toBe("Monsters will swing slower for you: 25% more warning before every attack.");
    // Average, with the dodges missed: the pace stays and only the weights lean.
    const dodges = kept(session((id) => (id.startsWith("dodge") ? "needs_work" : "good")));
    expect(dodges.level).toBe("average");
    expect(tuningLine(dodges, ENEMIES)).toBe("Monsters will fight at the usual pace. Expect more attacks you have to dodge.");
    expect(tuningLine(kept([]), ENEMIES)).toBe("Monsters will fight at the usual pace.");
    expect(tuningLine(STRONG, [])).toBe("Monsters will fight at the usual pace.");
  });

  test("the numbers in the line are read off the tuned monsters, and match the scale the tuning used", () => {
    for (const [assessment, scale] of [[WEAK, TELEGRAPH_SCALE.beginner], [MIDDLING, TELEGRAPH_SCALE.average], [STRONG, TELEGRAPH_SCALE.good]] as const) {
      const tuning = tuningOf(assessment, ENEMIES);
      expect(tuning.warning).toBeCloseTo(scale, 3);
      if (scale !== 1) expect(tuningLine(assessment, ENEMIES)).toContain(`: ${String(Math.round(Math.abs(scale - 1) * 100))}% `);
    }
    expect(tuningOf(WEAK, ENEMIES).more).toEqual(["block", "duck"]);
    expect(tuningOf(STRONG, ENEMIES).more).toEqual([]);
    // One monster alone: the line follows that monster's own attacks.
    expect(tuningOf(WEAK, [polyphemus]).warning).toBeCloseTo(TELEGRAPH_SCALE.beginner, 3);
  });
});
