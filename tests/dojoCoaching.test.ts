// What the Training Dojo says about each move (src/coach/coaching.ts, LABELS in src/coach/guide.ts, PRACTICE_TIPS in
// src/coach/practice.ts): every move it can train has checklist lines, praise and tips written by hand, in plain words
// that fit the screen, and a made-up try that gets one thing wrong is told about that thing.
// Every body here is made up, the same way as tests/helpers/poses.ts: nothing was tried on a camera.
import { describe, expect, test } from "vitest";
import dojoDoc from "../docs/dojo.md?raw";
import { DOJO_MEASURES, dojoJudgeRep, dojoMenu, dojoMoveOf, dojoStyles, menuIds } from "../src/coach/catalog";
import { COACHING, faultFor, faultOf, praiseFor } from "../src/coach/coaching";
import { KEY_TIP, gradeAttempt, gradeRep } from "../src/coach/dojo";
import { POINTS, gradeFor } from "../src/coach/grade";
import { labelOf, liveChecks } from "../src/coach/guide";
import { PRACTICE_TIPS, TABLED_MOVES, partTips } from "../src/coach/practice";
import type { MoveDef, PoseFrame } from "../src/core/types";
import { need } from "./helpers/need";
import type { Arm, Key, Leg, Pose } from "./helpers/poses";
import { ACROSS, COCKED, DOWN, GUARD, LATERAL, LEG_CHAMBER, LEG_DOWN, LEG_HALF, LEG_KICK, PUNCH, pose, sequence, withLegs } from "./helpers/poses";

/** Every move a player can tick on the setup step, over every style it offers. */
const TRAINABLE: readonly string[] = [...new Set(dojoStyles().flatMap((style) => menuIds(dojoMenu(style))))];
const moveOf = (id: string): MoveDef => need(dojoMoveOf(id));

/** Wording that belongs to the detectors, not to a coach: units, numbers, ids, and the labels made from a condition's name. */
const DEVELOPER = /on this frame|\bNot:|\bFirst:|opened or|_|\b(?:degrees|shoulder widths|torso lengths|confidence|ms|frame|frames|detector|threshold|baseline|chambered|wrist)\b|\d/;
/** The widths the screen allows: a checklist row (LiveCheck in src/coach/guide.ts), a tip and its part (PracticeTip in src/coach/practice.ts). */
const MAX_LABEL = 28;
const MAX_TIP = 90;
const MAX_PART = 20;
const MAX_PRAISE = 60;

const plain = (line: string, about: string, most: number): void => {
  expect(line.trim().length, about).toBeGreaterThan(0);
  expect(line.length, `${about}: "${line}" is ${String(line.length)} long`).toBeLessThanOrEqual(most);
  expect(line, about).not.toMatch(DEVELOPER);
  for (const id of TRAINABLE) if (id.includes("_")) expect(line.includes(id), `${about} names the id ${id}`).toBe(false);
};

describe("every move the dojo can train has its coaching written by hand", () => {
  test("the list is the real one: every style's strikes, the kicks, the defends and the dojo's own moves", () => {
    expect(TRAINABLE.length).toBe(26);
    for (const id of ["jab", "reverse_punch", "block", "front_kick", "roundhouse_kick", "palm_heel", "high_block", "wrist_release"]) expect(TRAINABLE).toContain(id);
    // Nothing is written for a move nobody can train, and nothing trainable is left out.
    expect(Object.keys(COACHING).sort()).toEqual([...TRAINABLE].sort());
  });

  test("every checklist line of every move is written, plain, short enough, and no two rows of a list read the same", () => {
    for (const id of TRAINABLE) {
      const options = DOJO_MEASURES[id] ?? [];
      expect(options.length, id).toBeGreaterThan(0);
      for (const measures of options) {
        const rows = measures.map((measure) => labelOf(id, measure, measures));
        measures.forEach((measure, index) => {
          const row = need(rows[index]);
          expect(row.written, `${id}: no line written for "${measure.name}" (LABELS in src/coach/guide.ts); it would show as "${row.label}"`).toBe(true);
          plain(row.label, `${id} checklist`, MAX_LABEL);
        });
        expect(new Set(rows.map((row) => row.label)).size, `${id}: ${rows.map((row) => row.label).join(" | ")}`).toBe(rows.length);
      }
      // What a player sees before moving: up to four rows, at least one that says what to do.
      const shown = liveChecks(moveOf(id), null, null, 4, DOJO_MEASURES).checks;
      expect(shown.length, id).toBeGreaterThan(0);
      expect(shown.length, id).toBeLessThanOrEqual(4);
      for (const check of shown) plain(check.label, `${id} checklist`, MAX_LABEL);
    }
  });

  test("every move has praise for an Excellent and a line on how to make it", () => {
    for (const id of TRAINABLE) {
      const own = need(COACHING[id]);
      plain(own.well, `${id} praise`, MAX_PRAISE);
      plain(own.whole.tip, `${id} how-to`, MAX_TIP);
      plain(own.whole.part, `${id} how-to part`, MAX_PART);
      expect(praiseFor(id)).toBe(own.well);
    }
    expect(praiseFor("no_such_move")).toBeNull();
    // A try that was not seen, with nothing more exact known, is told how to make this move, not any move.
    for (const id of TRAINABLE) {
      expect(gradeRep(moveOf(id), { counted: false, quality: 0, peak: 0, tip: null, part: null }).tip, id).toBe(need(COACHING[id]).whole.tip);
    }
  });

  test("everything the grader can find wrong with a move has one tip, plain and short enough", () => {
    for (const id of TRAINABLE) {
      const parts = partTips(id);
      const faults = COACHING[id]?.faults ?? [];
      // A move is judged by its table of measured parts (src/coach/practice.ts) or condition by condition, never by neither.
      expect(TABLED_MOVES.includes(id) || faults.length > 0, `${id} has neither a table of parts nor a tip for each condition`).toBe(true);
      expect(parts.length > 0, id).toBe(TABLED_MOVES.includes(id));
      for (const say of [...parts, ...faults]) {
        plain(say.tip, `${id} tip for ${say.part}`, MAX_TIP);
        plain(say.part, `${id} part`, MAX_PART);
        // A tip names what was wrong, then what to do: two sentences at least.
        if (faults.includes(say as never)) expect(say.tip, id).toMatch(/^[A-Z][^.]*\. \S/);
      }
      if (TABLED_MOVES.includes(id)) continue;
      // Condition by condition: each condition of the detector has its tip, and each tip a condition.
      const measures = (DOJO_MEASURES[id] ?? []).flat();
      for (const measure of measures) expect(faultFor(id, measure), `${id}: no tip for "${measure.name}"`).toBeDefined();
      for (const fault of faults) expect(measures.some((measure) => faultFor(id, measure) === fault), `${id}: the tip for "${fault.key}" fits no condition`).toBe(true);
    }
    // What is said when the try could not be judged at all, and the tips every tabled move draws on.
    for (const [key, say] of Object.entries(PRACTICE_TIPS)) {
      plain(say.tip, `PRACTICE_TIPS.${key}`, MAX_TIP);
      plain(say.part, `PRACTICE_TIPS.${key} part`, MAX_PART);
    }
    plain(KEY_TIP, "the keyboard tip", MAX_TIP);
  });

  test("the doc has a row for every move, with its checklist lines and its tips", () => {
    for (const id of TRAINABLE) {
      const move = moveOf(id);
      expect(dojoDoc, `docs/dojo.md has no row for ${move.name}`).toContain(`| ${move.name} |`);
      expect(dojoDoc, id).toContain(need(COACHING[id]).well);
      for (const say of [...partTips(id), ...(COACHING[id]?.faults ?? [])]) expect(dojoDoc, `${id}: "${say.tip}"`).toContain(say.tip);
      for (const check of liveChecks(move, null, null, 4, DOJO_MEASURES).checks) expect(dojoDoc, `${id}: "${check.label}"`).toContain(check.label);
    }
  });
});

describe("grades and points", () => {
  test("the three words are Excellent, Great and Needs improvement, and the points follow the grade", () => {
    expect(gradeFor(true, 0.9)).toEqual({ tier: "excellent", label: "Excellent!", points: 150 });
    expect(gradeFor(true, 0.4)).toEqual({ tier: "good", label: "Great!", points: 100 });
    expect(gradeFor(false, 0.9)).toEqual({ tier: "needs_work", label: "Needs improvement", points: 25 });
    expect(POINTS.excellent).toBeGreaterThan(POINTS.good);
    expect(POINTS.good).toBeGreaterThan(POINTS.needs_work);
    for (const word of ["Excellent!", "Great!", "Needs improvement"]) expect(dojoDoc).toContain(`| ${word} |`);
  });
});

// Arms and legs in left-side coordinates, as in tests/helpers/poses.ts and tests/dojoExtraMoves.test.ts.
/** A punch that stops with the elbow still well bent. */
const SHORT: Arm = { elbow: [0.39, 0.43], wrist: [0.42, 0.37], elbow3: [-0.25, -0.38, -0.12], wrist3: [-0.22, -0.48, -0.32] };
/** A front kick that stops low. */
const LEG_LOW_KICK: Leg = { knee: [0.45, 0.72], ankle: [0.45, 0.84], knee3: [-0.1, 0.2, -0.38], ankle3: [-0.1, 0.5, -0.6] };
/** Roundhouse finish: leg straight, foot round in front of the body at hip height. */
const LEG_ROUND: Leg = { knee: [0.4, 0.66], ankle: [0.44, 0.67], knee3: [-0.15, 0.05, -0.42], ankle3: [-0.05, 0.02, -0.85] };
/** A hand raised straight up, forearm upright: not a roof over the head. */
const RAISED: Arm = { elbow: [0.38, 0.2], wrist: [0.42, 0.08], elbow3: [-0.28, -0.65, 0], wrist3: [-0.2, -0.85, -0.05] };
/** Low block finish: arm straight, hand low and clear of the hip. */
const LOW_SWEPT: Arm = { elbow: [0.37, 0.47], wrist: [0.33, 0.57], elbow3: [-0.3, -0.25, -0.1], wrist3: [-0.4, -0.02, -0.2] };
/** An arm folded with the elbow out to the side at shoulder height, hand at the chest. */
const ELBOW_WOUND: Arm = { elbow: [0.26, 0.36], wrist: [0.36, 0.33], elbow3: [-0.5, -0.5, 0], wrist3: [-0.3, -0.5, -0.15] };

const keys = (...pairs: [number, Pose][]): Key[] => pairs.map(([t, p]) => ({ t, pose: p }));
const both = (arm: Arm): Pose => pose(arm, arm);
const left = (arm: Arm): Pose => pose(arm, DOWN);
const right = (arm: Arm): Pose => pose(DOWN, arm);
const leg = (shape: Leg = LEG_DOWN): Pose => withLegs(pose(DOWN), LEG_DOWN, shape);
const T = PRACTICE_TIPS;
const fault = (id: string, part: string): string => need((COACHING[id]?.faults ?? []).find((each) => each.part === part)).tip;

/** A made-up try: the move, what was wrong with it, the line it must be given, a word that line must have, and the frames. */
const TRIES: readonly (readonly [string, string, string, RegExp, PoseFrame[]])[] = [
  ["block", "the hands stop at the chest", T.guard.tip, /Hands too low/, sequence(keys([0, pose(DOWN)], [250, both(COCKED)], [450, both(COCKED)]))],
  ["jab", "reached out slowly", T.snap.tip, /Too slow/, sequence(keys([0, pose(DOWN)], [3000, left(PUNCH)]))],
  ["cross", "reached out slowly", T.snap.tip, /Too slow/, sequence(keys([0, pose(DOWN)], [3000, right(PUNCH)]))],
  ["reverse_punch", "the other hand left hanging", T.pull.tip, /Left hand stayed up/, sequence(keys([0, pose(DOWN)], [150, right(COCKED)], [300, right(PUNCH)]))],
  ["knee", "the knee lifted only a little", T.kneeHeight.tip, /Knee too low/, sequence(keys([0, leg()], [100, leg()], [300, leg(LEG_HALF)], [600, leg(LEG_HALF)]))],
  ["duck", "a shallow dip", T.depth.tip, /Not low enough/, sequence(keys([0, pose(DOWN)], [300, pose(DOWN, DOWN, 0, 0.06)], [500, pose(DOWN, DOWN, 0, 0.06)]))],
  ["dodge_left", "a step the wrong way", T.toLeft.tip, /Wrong way/, sequence(keys([0, pose(DOWN)], [300, pose(DOWN, DOWN, 0.12, 0)], [500, pose(DOWN, DOWN, 0.12, 0)]))],
  // The dojo's own moves, judged condition by condition.
  ["palm_heel", "a straight punch at shoulder height", fault("palm_heel", "height"), /Palm too low/, sequence(keys([0, pose(DOWN)], [150, right(COCKED)], [300, right(PUNCH)]))],
  ["roundhouse_kick", "a kick with no knee out to the side first", fault("roundhouse_kick", "knee out first"), /No wind-up/, sequence(keys([0, leg()], [100, leg()], [300, leg(LEG_CHAMBER)], [450, leg(LEG_ROUND)]))],
  ["side_kick", "a kick to the front", fault("side_kick", "reach"), /out to the side/, sequence(keys([0, leg()], [100, leg()], [300, leg(LEG_CHAMBER)], [450, leg(LEG_KICK)]))],
  ["high_block", "an arm raised straight up", fault("high_block", "forearm"), /Forearm upright/, sequence(keys([0, pose(DOWN)], [250, right(RAISED)], [450, right(RAISED)]))],
  ["low_block", "a sweep down with no start at the other shoulder", fault("low_block", "start"), /No wind-up/, sequence(keys([0, pose(DOWN)], [400, right(LOW_SWEPT)], [600, right(LOW_SWEPT)]))],
  ["elbow_strike", "a fist lifted to the face with the elbow left down", fault("elbow_strike", "height"), /Elbow too low/, sequence(keys([0, pose(DOWN)], [250, right(GUARD)], [450, right(GUARD)]))],
  ["wrist_release", "a fold with no arm held out first", fault("wrist_release", "start"), /Hold your arm out/, sequence(keys([0, pose(DOWN)], [200, right(ELBOW_WOUND)], [400, right(ELBOW_WOUND)]))],
];

describe("a try that gets one thing wrong is told about that thing", () => {
  for (const [id, wrong, line, word, frames] of TRIES) {
    test(`${id}: ${wrong}`, () => {
      const rep = gradeAttempt(moveOf(id), frames);
      expect(line).toMatch(word);
      expect(rep.tip, `${id} was graded ${rep.grade.label}`).toBe(line);
      expect(rep.grade.tier).not.toBe("excellent");
      expect(rep.grade.points).toBe(POINTS[rep.grade.tier]);
    });
  }

  test("the tips are not all one line: different faults in one move get different tips", () => {
    const said = new Map<string, Set<string>>();
    for (const [id, , line] of TRIES) said.set(id, (said.get(id) ?? new Set()).add(line));
    expect(new Set(TRIES.map(([, , line]) => line)).size).toBeGreaterThanOrEqual(12);
    const lowBlock = moveOf("low_block");
    const noStart = gradeAttempt(lowBlock, need(TRIES.find(([id]) => id === "low_block"))[4]).tip;
    const tooHigh = gradeAttempt(lowBlock, sequence(keys([0, pose(DOWN)], [200, right(ACROSS)], [450, right(LATERAL)]))).tip;
    expect(tooHigh).toMatch(/Sweep too high/);
    expect(tooHigh).not.toBe(noStart);
    expect((COACHING.low_block?.faults ?? []).map((each) => each.tip)).toContain(tooHigh);
  });

  // Training counts a rough strike on purpose (docs/dojo.md, "Grades and points"), so these two are not marked down.
  // What was measured as weakest is still named, and is what the end screen's Work on list draws on.
  test("a half-straight arm and a low kick are measured as that, whatever grade the lenient count gives them", () => {
    const short = dojoJudgeRep(moveOf("jab"), sequence(keys([0, pose(DOWN)], [150, left(COCKED)], [300, left(SHORT)], [450, left(SHORT)])));
    expect(short.tip).toBe(T.reach.tip);
    expect(short.tip).toMatch(/Arm not straight/);
    const low = dojoJudgeRep(moveOf("front_kick"), sequence(keys([0, leg()], [100, leg()], [300, leg(LEG_CHAMBER)], [450, leg(LEG_LOW_KICK)])));
    expect(low.tip).toBe(T.kickHeight.tip);
    expect(low.tip).toMatch(/knee to hip height/);
  });

  test("a try nobody can judge keeps its own line: nobody in the picture, no move made, feet out of view", () => {
    expect(gradeAttempt(moveOf("palm_heel"), []).tip).toBe(T.camera.tip);
    expect(gradeAttempt(moveOf("palm_heel"), sequence(keys([0, pose(DOWN)], [600, pose(DOWN)]))).tip).toBe(T.still.tip);
    expect(gradeAttempt(moveOf("side_kick"), sequence(keys([0, pose(DOWN)], [150, right(COCKED)], [300, right(PUNCH)]))).tip).toBe(T.feet.tip);
    // A move with nothing written is judged as before, and one with no conditions has no fault to name.
    expect(faultOf("no_such_move", [], [])).toBeNull();
    expect(faultOf("palm_heel", DOJO_MEASURES.palm_heel ?? [], [])).toBeNull();
    expect(dojoJudgeRep(moveOf("jab"), []).tip).toBe(T.camera.tip);
  });
});
