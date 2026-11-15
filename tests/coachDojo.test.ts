// The training dojo's pure parts (src/coach/dojo.ts) on a made-up player (tools/dojo/player.ts): the session goes
// show -> go -> result for every repetition of every move, a move copied from the outline is Excellent, a sloppy one
// is Good, a missed one needs improvement and gets a tip, and the end says what to work on and how.
import { describe, expect, test } from "vitest";
import { COACHING } from "../src/coach/coaching";
import {
  COUNT_FROM, DOJO_DEFAULTS, DOJO_DEFENDS, DOJO_REPS, KEYBOARD_REP, KEY_TIP, POINTS, PRACTICE_TIPS, STRIKE_FOR_EXCELLENT, SURE_FOR_EXCELLENT,
  assessmentFrom, closingLine, currentMove, gradeAttempt, gradeRep, gradedQuality, guideFor, keyRep, movesFor, quickMoves, skillFrom, skipResult,
  startDojo, summariseDojo, tickDojo, tuneFor,
} from "../src/coach";
import type { DojoRep, DojoState, GradeTier, RepResult } from "../src/coach";
import type { MoveDef } from "../src/core/types";
import { ENEMIES } from "../src/enemies/registry";
import { MOVES } from "../src/moves/registry";
import { STYLES } from "../src/styles/registry";
import { GOOD, attempt, scriptedPlayer, shapesFor, standingBaseline } from "../tools/dojo/player";
import type { Effort } from "../tools/dojo/player";
import { need } from "./helpers/need";
import { keyName } from "../src/coach/ui/keyName";

const moveOf = (id: string): MoveDef => need(MOVES.get(id));
const guideOf = (id: string) => need(guideFor(moveOf(id)));
const boxer = need(STYLES.find((style) => style.id === "boxer"));
const FRAME_MS = 16;

/** Plays a session with the made-up player, one tick every 16 ms. `watch` sees every state. */
function play(
  config: Parameters<typeof startDojo>[0], plan: (repIndex: number, moveId: string) => Effort, watch: (state: DojoState, now: number) => void = () => undefined,
): DojoState {
  const player = scriptedPlayer(plan);
  let state = startDojo(config, 1000);
  for (let now = 1000; state.phase !== "done" && now < 600_000; now += FRAME_MS) {
    const id = state.config.moves[state.moveIndex] ?? "";
    state = tickDojo(state, now, player(now, { phase: state.phase, moveId: id, repIndex: state.repIndex }));
    watch(state, now);
  }
  return state;
}

const rep = (moveId: string, tier: GradeTier, tip: string | null = null, part: string | null = null): DojoRep => {
  const result: RepResult = tier === "needs_work"
    ? { counted: false, quality: 0, peak: 0.2, tip, part }
    : { counted: true, quality: tier === "excellent" ? 0.9 : 0.4, peak: 1, tip, part };
  return gradeRep({ ...moveOf(moveId), quality: () => 0 }, result, tier === "needs_work" ? null : 500);
};

describe("the lists", () => {
  test("a style trains its strikes, then the four defends; every one is a known move with an outline", () => {
    expect(movesFor(boxer)).toEqual(["jab", "cross", "hook", "uppercut", "block", "duck", "dodge_left", "dodge_right"]);
    expect(STYLES.length).toBeGreaterThan(0);
    for (const style of STYLES) {
      const ids = movesFor(style);
      expect(ids.slice(-4)).toEqual(DOJO_DEFENDS);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(guideFor(moveOf(id)), id).not.toBeNull();
    }
  });

  test("the quick list is five moves: two strikes, block, duck and a dodge", () => {
    expect(quickMoves(boxer)).toEqual(["jab", "cross", "block", "duck", "dodge_left"]);
    for (const style of STYLES) {
      const ids = quickMoves(style);
      expect(ids.length).toBe(5);
      for (const id of ids) expect(movesFor(style), id).toContain(id);
    }
  });

  test("three repetitions by default, and an id the registry does not know is left out", () => {
    expect(DOJO_REPS).toBe(3);
    const state = startDojo({ moves: ["jab", "no_such_move", "block"] }, 0);
    expect(state.config.moves).toEqual(["jab", "block"]);
    expect(state.config.reps).toBe(3);
    expect(state.phase).toBe("show");
  });

  test("nothing to train is done at once, and a silly repetition count is at least one", () => {
    expect(startDojo({ moves: [] }, 0).phase).toBe("done");
    expect(startDojo({ moves: ["no_such_move"] }, 0).phase).toBe("done");
    expect(startDojo({ moves: ["jab"], reps: 0 }, 0).config.reps).toBe(1);
    expect(startDojo({ moves: ["jab"], reps: Number.NaN }, 0).config.reps).toBe(3);
  });
});

describe("one repetition", () => {
  test("the outline plays first, then it is the player's turn for three seconds, then the grade is shown", () => {
    let state = startDojo({ moves: ["jab"], reps: 1 }, 0);
    expect([state.phase, state.phaseMs]).toEqual(["show", DOJO_DEFAULTS.showMs]);
    state = tickDojo(state, 1999, null);
    expect([state.phase, state.msLeft]).toEqual(["show", 1]);
    state = tickDojo(state, 2000, null);
    expect([state.phase, state.phaseMs, state.msLeft]).toEqual(["go", 3000, 3000]);
    state = tickDojo(state, 4999, null);
    expect(state.phase).toBe("go");
    state = tickDojo(state, 5000, null);
    expect([state.phase, state.phaseMs]).toEqual(["result", DOJO_DEFAULTS.resultMs]);
    expect(state.last?.grade.tier).toBe("needs_work");
    state = tickDojo(state, 5000 + 1199, null);
    expect(state.phase).toBe("result");
    state = tickDojo(state, 5000 + 1200, null);
    expect(state.phase).toBe("done");
    expect(tickDojo(state, 99_999, null)).toBe(state);
  });

  test("copying the outline is Excellent for 150 points, and the turn ends early once the move is counted", () => {
    let wentAt = 0;
    let gradedAt = 0;
    const end = play({ moves: ["jab"], reps: 1 }, () => "good", (state, now) => {
      if (state.phase === "go" && wentAt === 0) wentAt = now;
      if (state.phase === "result" && gradedAt === 0) gradedAt = now;
    });
    expect(end.reps.map((each) => each.grade)).toEqual([{ tier: "excellent", label: "Excellent!", points: 150 }]);
    expect(end.points).toBe(150);
    expect(end.reps[0]?.tip).toBeNull();
    expect(gradedAt - wentAt).toBeLessThan(1500);
    expect(end.reps[0]?.reactMs).toBeGreaterThan(300);
    expect(end.reps[0]?.reactMs).toBeLessThan(1200);
  });

  test("another move during the turn does not end it or use up the repetition; the right move still counts after", () => {
    let state = startDojo({ moves: ["jab"], reps: 1 }, 0);
    let now = 0;
    const feed = (frames: ReturnType<typeof attempt>): void => {
      for (const frame of frames) {
        now = base + frame.t;
        state = tickDojo(state, now, frame);
        if (state.phase !== "go") return;
      }
    };
    state = tickDojo(state, state.config.showMs, null);
    const base = state.config.showMs;
    expect(state.phase).toBe("go");
    feed(attempt(guideOf("block"), GOOD, 700, 1200));
    expect(state.phase).toBe("go");
    expect(state.reps).toEqual([]);
    feed(attempt(guideOf("jab"), GOOD, 700, 2400, 1300));
    expect(state.phase).toBe("result");
    expect(state.last?.result.counted).toBe(true);
  });

  test("a sloppy one still counts: Great, 100 points; a missed one needs improvement, 25 points, with one tip", () => {
    // A defend, not a punch: the punches are asked for loosely, so even the made-up player's small arm movement counts as one.
    const end = play({ moves: ["dodge_right"], reps: 3 }, (index) => (["good", "sloppy", "miss"] as const)[index] ?? "good");
    expect(end.reps.map((each) => each.grade.label)).toEqual(["Excellent!", "Great!", "Needs improvement"]);
    expect(end.reps.map((each) => each.grade.points)).toEqual([150, 100, 25]);
    expect(end.points).toBe(275);
    const missed = need(end.reps[2]);
    expect(missed.result.counted).toBe(false);
    expect(missed.reactMs).toBeNull();
    expect([...Object.values(PRACTICE_TIPS).map((each) => each.tip), COACHING.cross?.whole.tip]).toContain(missed.tip);
  });

  test("every grade comes out for every move of the quick list, strikes and defends alike", () => {
    const end = play({ moves: quickMoves(boxer), reps: 3 }, (index) => (["good", "sloppy", "miss"] as const)[index] ?? "good");
    expect(end.reps.length).toBe(15);
    for (const id of quickMoves(boxer)) {
      const tiers = end.reps.filter((each) => each.moveId === id).map((each) => each.grade.tier);
      // The jab, the cross and the block are asked for loosely: the made-up player's small arm movement counts, as a Good one.
      expect(tiers, id).toEqual(["excellent", "good", id === "jab" || id === "cross" || id === "block" ? "good" : "needs_work"]);
    }
    expect(end.points).toBe(5 * 275 + 3 * 75);
  });

  test("the order is every repetition of a move, then the next move; later repetitions show the outline for less time", () => {
    const seen: string[] = [];
    play({ moves: ["jab", "block"], reps: 2 }, () => "good", (state) => {
      const line = `${state.phase} ${state.config.moves[state.moveIndex] ?? "-"} ${String(state.repIndex)} ${state.phase === "show" ? String(state.phaseMs) : ""}`.trim();
      if (seen.at(-1) !== line) seen.push(line);
    });
    expect(seen).toEqual([
      "show jab 0 2000", "go jab 0", "result jab 0", "show jab 1 1000", "go jab 1", "result jab 1",
      "show block 0 2000", "go block 0", "result block 0", "show block 1 1000", "go block 1", "result block 1", "done - 0",
    ]);
  });

  test("a move made while the outline is still playing is not graded: only the player's turn counts", () => {
    const guide = guideOf("jab");
    let state = startDojo({ moves: ["jab"], reps: 1 }, 0);
    for (const frame of attempt(guide, GOOD, 300, 1900)) state = tickDojo(state, frame.t, frame);
    expect(state.phase).toBe("show");
    expect(state.hit).toBeNull();
    expect(state.reps).toEqual([]);
  });

  test("with nobody in the picture the tip says so, and the repetition still earns its 25", () => {
    let state = startDojo({ moves: ["block"], reps: 1 }, 0);
    for (let now = 0; state.phase !== "result"; now += 50) state = tickDojo(state, now, null);
    expect(state.last?.grade.points).toBe(25);
    expect(state.last?.tip).toBe(PRACTICE_TIPS.camera.tip);
  });

  test("frames out of order or with no time are left out, and nothing throws", () => {
    const guide = guideOf("jab");
    const frames = attempt(guide, GOOD, 0, 600);
    let state = startDojo({ moves: ["jab"], reps: 1, showMs: 0 }, 0);
    state = tickDojo(state, 0, need(frames[5]));
    const before = state.history.frames.length;
    state = tickDojo(state, 10, need(frames[2]));
    state = tickDojo(state, 20, { ...need(frames[6]), t: Number.NaN });
    expect(state.history.frames.length).toBe(before);
  });
});

describe("lenient grading", () => {
  test("copying the outline counts for every move in the game, and is Excellent for every move a style trains", () => {
    const trained = new Set(STYLES.flatMap((style) => movesFor(style)));
    expect(trained.size).toBeGreaterThanOrEqual(15);
    for (const move of MOVES.values()) {
      const guide = need(guideFor(move));
      const graded = gradeAttempt(move, attempt(guide, GOOD), standingBaseline(guide));
      expect(graded.result.counted, move.id).toBe(true);
      expect(graded.grade.tier, move.id).not.toBe("needs_work");
      if (trained.has(move.id)) expect(graded.grade.tier, move.id).toBe("excellent");
    }
  });

  test("a strike is Excellent from a lower quality than the fight asks, and a counted one is never under Good", () => {
    const strike = { quality: () => 1 };
    const counted = (quality: number): RepResult => ({ counted: true, quality, peak: 1, tip: null, part: null });
    expect(STRIKE_FOR_EXCELLENT).toBeLessThan(0.7);
    expect(gradedQuality(strike, counted(STRIKE_FOR_EXCELLENT))).toBeCloseTo(0.7);
    expect(gradeRep(moveOf("jab"), counted(STRIKE_FOR_EXCELLENT + 0.001)).grade.tier).toBe("excellent");
    expect(gradeRep(moveOf("jab"), counted(STRIKE_FOR_EXCELLENT - 0.02)).grade.tier).toBe("good");
    expect(gradeRep(moveOf("jab"), counted(0)).grade.tier).toBe("good");
    expect(gradedQuality(strike, counted(1))).toBe(1);
    expect(gradedQuality(strike, { ...counted(1), counted: false })).toBe(0);
  });

  test("a defend is graded on how sure the detector got: only just counted is Good, clearly made is Excellent", () => {
    const defend = {};
    const counted = (quality: number): RepResult => ({ counted: true, quality, peak: quality, tip: null, part: null });
    expect(gradedQuality(defend, counted(0.7))).toBeCloseTo(0.5);
    expect(gradedQuality(defend, counted(SURE_FOR_EXCELLENT))).toBeCloseTo(0.7);
    expect(gradedQuality(defend, counted(1))).toBeCloseTo(1);
    expect(gradeRep(moveOf("block"), counted(0.75)).grade.tier).toBe("good");
    expect(gradeRep(moveOf("block"), counted(0.9)).grade.tier).toBe("excellent");
    // Rising all the way: a surer defend never grades lower.
    let last = 0;
    for (let sure = 0.7; sure <= 1; sure += 0.01) {
      const now = gradedQuality(defend, counted(sure));
      expect(now).toBeGreaterThanOrEqual(last);
      last = now;
    }
  });

  test("a near miss, surer than 0.6 but short of the fight's 0.7, counts as Good and never as Excellent", () => {
    expect(COUNT_FROM).toBeLessThan(0.7);
    const guide = guideOf("block");
    const baseline = standingBaseline(guide);
    const near = Array.from({ length: 60 }, (_, index) => 0.9 - index * 0.01)
      .map((reach) => gradeAttempt(moveOf("block"), attempt(guide, { reach, slow: 1.5 }), baseline))
      .filter((graded) => graded.result.peak >= COUNT_FROM && graded.result.peak < 0.7);
    expect(near.length).toBeGreaterThan(0);
    for (const graded of near) {
      expect(graded.grade.tier).toBe("good");
      expect(graded.result.counted).toBe(true);
      // It still says what to fix.
      expect(graded.tip).toBe(PRACTICE_TIPS.guard.tip);
    }
    // With the fight's own line the same attempts do not count.
    const strict = gradeAttempt(moveOf("block"), attempt(guide, { reach: 0.3, slow: 1.5 }), baseline, 0.7);
    expect(strict.grade.tier).toBe("needs_work");
  });

  test("what the screen counted while the player moved stays counted", () => {
    const guide = guideOf("jab");
    const standing = attempt(guide, { reach: 0, slow: 1 });
    const sure = gradeAttempt(moveOf("jab"), standing, null, COUNT_FROM, { quality: 0.65, reactMs: 420, sure: true });
    expect([sure.grade.tier, sure.reactMs]).toEqual(["excellent", 420]);
    const near = gradeAttempt(moveOf("jab"), standing, null, COUNT_FROM, { quality: 0.65, reactMs: 420, sure: false });
    expect(near.grade.tier).toBe("good");
    expect(gradeAttempt(moveOf("jab"), standing).grade.tier).toBe("needs_work");
  });

  test("the made-up player has a shape for each grade of each quick move", () => {
    for (const id of quickMoves(boxer)) {
      const shapes = shapesFor(moveOf(id), guideOf(id));
      expect(shapes.good, id).not.toBeNull();
      expect(shapes.sloppy, id).not.toBeNull();
      expect(shapes.miss, id).not.toBeNull();
    }
  });
});

describe("the keyboard", () => {
  test("a key press counts only on the player's turn", () => {
    let state = startDojo({ moves: ["jab"], reps: 2, keyboard: true }, 0);
    expect(keyRep(state, 100)).toBe(state);
    state = tickDojo(state, 2000, null);
    state = keyRep(state, 2400);
    expect(state.phase).toBe("result");
    expect(state.last?.result).toBe(KEYBOARD_REP);
    expect(state.last?.grade.points).toBe(POINTS.excellent);
    expect(state.last?.reactMs).toBe(400);
    expect(keyRep(state, 2500)).toBe(state);
  });

  test("the grade can be left early, and only the grade", () => {
    let state = startDojo({ moves: ["jab"], reps: 2 }, 0);
    expect(skipResult(state, 10)).toBe(state);
    state = keyRep(tickDojo(state, 2000, null), 2100);
    const next = skipResult(state, 2200);
    expect([next.phase, next.repIndex, next.phaseMs]).toEqual(["show", 1, 1000]);
  });

  test("with no camera, running out of time says to press the key", () => {
    let state = startDojo({ moves: ["jab"], reps: 1, keyboard: true }, 0);
    state = tickDojo(tickDojo(state, 2000, null), 5000, null);
    expect(state.last?.grade.tier).toBe("needs_work");
    expect(state.last?.tip).toBe(KEY_TIP);
  });

  test("a whole session on the keyboard reaches the end with full points", () => {
    let state = startDojo({ moves: movesFor(boxer), keyboard: true }, 0);
    for (let now = 0; state.phase !== "done" && now < 600_000; now += 100) {
      state = tickDojo(state, now, null);
      if (state.phase === "go") state = keyRep(state, now);
    }
    expect(state.phase).toBe("done");
    expect(currentMove(state)).toBeUndefined();
    expect(state.reps.length).toBe(8 * 3);
    expect(state.points).toBe(8 * 3 * 150);
  });
});

describe("the summary", () => {
  const TIP = PRACTICE_TIPS.reach;
  const GUARD = PRACTICE_TIPS.guard;

  test("the total, the count of each grade, one report per move and the best move", () => {
    const reps = [
      rep("jab", "excellent"), rep("jab", "good", TIP.tip, TIP.part), rep("jab", "needs_work", TIP.tip, TIP.part),
      rep("block", "excellent"), rep("block", "excellent"), rep("block", "good"),
    ];
    const summary = summariseDojo(reps);
    expect(summary.points).toBe(150 + 100 + 25 + 150 + 150 + 100);
    expect(summary.maxPoints).toBe(6 * 150);
    expect(summary.grades).toEqual({ excellent: 3, good: 2, needs_work: 1 });
    expect(summary.moves.map((move) => [move.moveId, move.name, move.reps, move.points])).toEqual([["jab", "Jab", 3, 275], ["block", "Block", 3, 400]]);
    expect(summary.best?.moveId).toBe("block");
    expect(summary.moves[0]?.grades).toEqual({ excellent: 1, good: 1, needs_work: 1 });
  });

  test("work on: the moves that were missed, weakest first, at most three, each with one line on how", () => {
    const reps = [
      rep("jab", "excellent"), rep("jab", "excellent"), rep("jab", "needs_work", TIP.tip, TIP.part),
      rep("cross", "needs_work", TIP.tip, TIP.part), rep("cross", "needs_work", PRACTICE_TIPS.height.tip, PRACTICE_TIPS.height.part), rep("cross", "needs_work", TIP.tip, TIP.part),
      rep("block", "good"), rep("block", "needs_work", GUARD.tip, GUARD.part), rep("block", "needs_work", GUARD.tip, GUARD.part),
      rep("duck", "good"), rep("duck", "good"), rep("duck", "needs_work", PRACTICE_TIPS.depth.tip, PRACTICE_TIPS.depth.part),
      rep("dodge_left", "excellent"), rep("dodge_left", "excellent"), rep("dodge_left", "excellent"),
    ];
    const summary = summariseDojo(reps);
    expect(summary.workOn).toEqual([
      // The part that was weak most often: reach twice, height once.
      { moveId: "cross", name: "Cross", line: TIP.tip, sharpen: false },
      { moveId: "block", name: "Block", line: GUARD.tip, sharpen: false },
      { moveId: "duck", name: "Duck", line: PRACTICE_TIPS.depth.tip, sharpen: false },
    ]);
    expect(summary.best?.moveId).toBe("dodge_left");
    expect(closingLine(summary)).toBe("Good work. Here is what to practise next.");
  });

  test("the line for a missed move is about the misses, not about what was a little weak when it counted", () => {
    const summary = summariseDojo([
      rep("jab", "good", PRACTICE_TIPS.snap.tip, PRACTICE_TIPS.snap.part), rep("jab", "good", PRACTICE_TIPS.snap.tip, PRACTICE_TIPS.snap.part),
      rep("jab", "needs_work", TIP.tip, TIP.part),
    ]);
    expect(summary.workOn).toEqual([{ moveId: "jab", name: "Jab", line: TIP.tip, sharpen: false }]);
  });

  test("everything Good or better: the weakest move is the one to sharpen", () => {
    const summary = summariseDojo([
      rep("jab", "excellent"), rep("jab", "excellent"),
      rep("cross", "good", PRACTICE_TIPS.snap.tip, PRACTICE_TIPS.snap.part), rep("cross", "excellent"),
      rep("block", "good"), rep("block", "good"),
    ]);
    expect(summary.workOn).toEqual([{ moveId: "block", name: "Block", line: moveOf("block").hint, sharpen: true }]);
    expect(closingLine(summary)).toBe("Every one counted. Now sharpen the weakest.");
    const cross = summariseDojo([rep("jab", "excellent"), rep("cross", "good", PRACTICE_TIPS.snap.tip, PRACTICE_TIPS.snap.part)]);
    expect(cross.workOn).toEqual([{ moveId: "cross", name: "Cross", line: PRACTICE_TIPS.snap.tip, sharpen: true }]);
  });

  test("everything Excellent: nothing to work on", () => {
    const summary = summariseDojo([rep("jab", "excellent"), rep("block", "excellent")]);
    expect(summary.workOn).toEqual([]);
    expect(closingLine(summary)).toBe("Every one excellent. Nothing to fix.");
    expect(summary.skill).toBe(1);
  });

  test("nothing counted: no best move, and no repetitions at all is said plainly", () => {
    const none = summariseDojo([rep("jab", "needs_work", TIP.tip, TIP.part), rep("block", "needs_work", GUARD.tip, GUARD.part)]);
    expect(none.best).toBeNull();
    expect(none.workOn.map((each) => each.moveId)).toEqual(["jab", "block"]);
    expect(closingLine(none)).toMatch(/^None counted yet/);
    const empty = summariseDojo([]);
    expect([empty.points, empty.maxPoints, empty.best, empty.workOn, empty.level]).toEqual([0, 0, null, [], "average"]);
    expect(closingLine(empty)).toBe("No repetitions yet.");
  });

  test("a played session ends with a work-on list whose lines are short enough for the screen", () => {
    const end = play({ moves: movesFor(boxer), reps: 3 }, (index) => (["good", "sloppy", "miss"] as const)[index] ?? "good");
    const summary = summariseDojo(end.reps);
    expect(summary.points).toBe(end.points);
    expect(summary.workOn.length).toBe(3);
    for (const each of summary.workOn) {
      expect(each.sharpen).toBe(false);
      expect(each.line.length).toBeGreaterThan(10);
      expect(each.line.length).toBeLessThanOrEqual(90);
    }
  });
});

describe("the skill number", () => {
  test("0 to 1 from the grades, with the warm-up's level words", () => {
    expect(skillFrom({ reps: [] })).toEqual({ skill: 0.5, level: "average" });
    expect(skillFrom({ reps: [rep("jab", "needs_work"), rep("jab", "needs_work")] })).toEqual({ skill: 0, level: "beginner" });
    expect(skillFrom({ reps: [rep("jab", "good"), rep("jab", "needs_work"), rep("jab", "needs_work")] }).level).toBe("beginner");
    expect(skillFrom({ reps: [rep("jab", "good"), rep("jab", "good")] })).toEqual({ skill: 0.6, level: "average" });
    expect(skillFrom({ reps: [rep("jab", "excellent"), rep("jab", "good")] })).toEqual({ skill: 0.8, level: "good" });
    expect(skillFrom({ reps: [rep("jab", "excellent")] })).toEqual({ skill: 1, level: "good" });
  });

  test("the session as a warm-up assessment: the level, the focus, the strong moves, one step per move", () => {
    const reps = [
      rep("jab", "excellent"), rep("jab", "excellent"), rep("jab", "excellent"),
      rep("block", "needs_work", PRACTICE_TIPS.guard.tip, PRACTICE_TIPS.guard.part), rep("block", "needs_work", PRACTICE_TIPS.guard.tip, PRACTICE_TIPS.guard.part), rep("block", "good"),
      rep("duck", "good"), rep("duck", "excellent"), rep("duck", "needs_work", PRACTICE_TIPS.depth.tip, PRACTICE_TIPS.depth.part),
      rep("dodge_left", "needs_work", PRACTICE_TIPS.distance.tip, PRACTICE_TIPS.distance.part),
    ];
    const assessment = assessmentFrom({ reps });
    expect(assessment.level).toBe(skillFrom({ reps }).level);
    expect(assessment.focus).toEqual([
      { moveId: "dodge_left", tip: PRACTICE_TIPS.distance.tip },
      { moveId: "block", tip: PRACTICE_TIPS.guard.tip },
    ]);
    expect(assessment.strong).toEqual(["jab"]);
    expect(assessment.habits).toEqual([]);
    expect(assessment.steps.map((step) => [step.step.moveId, step.done, step.reactMs])).toEqual([
      ["jab", true, 500], ["block", false, null], ["duck", true, 500], ["dodge_left", false, null],
    ]);
    for (const step of assessment.steps) {
      expect(step.step.say.length).toBeLessThanOrEqual(40);
      expect(step.quality).toBeGreaterThanOrEqual(0);
      expect(step.quality).toBeLessThanOrEqual(1);
    }
    for (const focus of assessment.focus) expect(focus.tip.length).toBeLessThanOrEqual(90);
  });

  test("the monsters can be tuned from it: a beginner gets more warning, a strong player less, nobody a broken fight", () => {
    const enemy = need(ENEMIES[0]);
    const weak = tuneFor(enemy, assessmentFrom({ reps: [rep("block", "needs_work"), rep("duck", "needs_work"), rep("jab", "needs_work")] }));
    const strong = tuneFor(enemy, assessmentFrom({ reps: [rep("block", "excellent"), rep("duck", "excellent"), rep("jab", "excellent")] }));
    expect(tuneFor(enemy, assessmentFrom({ reps: [] }))).toBe(enemy);
    expect(weak.attacks.length).toBe(enemy.attacks.length);
    enemy.attacks.forEach((attack, index) => {
      expect(need(weak.attacks[index]).telegraphMs).toBeGreaterThan(attack.telegraphMs);
      expect(need(strong.attacks[index]).telegraphMs).toBeLessThan(attack.telegraphMs);
    });
  });
});

describe("keyName", () => {
  test("shows arrows as glyphs, Space by name and letters in capitals", () => {
    expect(keyName("ArrowDown")).toBe("↓");
    expect(keyName("ArrowLeft")).toBe("←");
    expect(keyName(" ")).toBe("Space");
    expect(keyName("k")).toBe("K");
  });
});
