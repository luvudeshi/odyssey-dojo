// The end-of-fight report card: fixed event lists give exact cards, and every move in the registry has a work-on line.
import { expect, test } from "vitest";
import type { CombatEvent, EnemyAttack, WeakSpot } from "../src/core/types";
import {
  DEFEND_POINTS, GRADE_LINES, GRADE_POINTS, WORK_ON, WORK_ON_DEFAULT, WORK_ON_MAX, gradeForQuality, reportCard,
} from "../src/lessons/reportCard";
import { MOVES } from "../src/moves/registry";

const attack = (id: string, counter: string): EnemyAttack => ({ id, name: id, counter, telegraphMs: 1000, damage: 5 });
const GRAB = attack("grab", "block");
const SWING = attack("club_left", "dodge_right");
const BOULDER = attack("boulder", "duck");
const EYE: WeakSpot = { id: "eye", label: "Eye", position: [0, 1, 0], moves: ["jab", "cross", "hook"] };

const defended = (a: EnemyAttack): CombatEvent[] => [{ type: "telegraph", attack: a }, { type: "defended", attack: a }];
const hit = (a: EnemyAttack): CombatEvent[] => [{ type: "telegraph", attack: a }, { type: "playerHit", attack: a, damage: a.damage }];
const landed = (move: string, quality: number): CombatEvent[] => [
  { type: "opening", weakSpot: EYE, move },
  { type: "enemyHit", move, damage: 10, quality },
];
const missed = (move: string): CombatEvent[] => [{ type: "opening", weakSpot: EYE, move }, { type: "whiffed" }];

test("the grade lines: 0.85 and up is excellent, 0.6 and up is great, the rest needs improvement", () => {
  expect(GRADE_LINES).toEqual([[0.85, "EXCELLENT"], [0.6, "GREAT"]]);
  expect([1, 0.85, 0.84, 0.6, 0.59, 0].map(gradeForQuality)).toEqual([
    "EXCELLENT", "EXCELLENT", "GREAT", "GREAT", "NEEDS IMPROVEMENT", "NEEDS IMPROVEMENT",
  ]);
});

test("an empty fight: no rows, no grade, no points, nothing to work on", () => {
  expect(reportCard([])).toEqual({ moves: [], grade: null, points: 0, best: null, workOnNext: null, workOnLine: "" });
});

test("a mixed fight gives the exact card, weakest move first", () => {
  const events: CombatEvent[] = [
    ...defended(GRAB),
    ...landed("jab", 0.9),
    ...hit(SWING),
    ...landed("jab", 1),
    ...defended(SWING),
    ...landed("cross", 0.7),
    ...defended(GRAB),
    ...missed("cross"),
    ...hit(SWING),
    ...missed("hook"),
    { type: "finished", move: "jab" },
    { type: "won" },
  ];
  const card = reportCard(events);
  expect(card.moves).toEqual([
    { moveId: "hook", name: "Hook", kind: "strike", asked: 1, done: 0, quality: 0, grade: "NEEDS IMPROVEMENT", points: 0, workOn: WORK_ON.hook },
    { moveId: "dodge_right", name: "Dodge right", kind: "defend", asked: 3, done: 1, quality: 1 / 3, grade: "NEEDS IMPROVEMENT", points: DEFEND_POINTS, workOn: WORK_ON.dodge_right },
    { moveId: "cross", name: "Cross", kind: "strike", asked: 2, done: 1, quality: 0.35, grade: "NEEDS IMPROVEMENT", points: GRADE_POINTS.GREAT, workOn: WORK_ON.cross },
    { moveId: "jab", name: "Jab", kind: "strike", asked: 3, done: 3, quality: (0.9 + 1 + 1) / 3, grade: "EXCELLENT", points: 3 * GRADE_POINTS.EXCELLENT, workOn: WORK_ON.jab },
    { moveId: "block", name: "Block", kind: "defend", asked: 2, done: 2, quality: 1, grade: "EXCELLENT", points: 2 * DEFEND_POINTS, workOn: WORK_ON.block },
  ]);
  expect(card.points).toBe(0 + 100 + 100 + 450 + 200);
  // By times asked: 6 at needs improvement, 5 at excellent: a mean just under great, which rounds to great.
  expect(card.grade).toBe("GREAT");
  expect(card.best?.moveId).toBe("block");
  expect(card.workOnNext).toBe(card.moves[0]);
  expect(card.workOnLine).toBe("Hook: keep the elbow bent, level with your shoulder");
});

test("a fight with only defends", () => {
  const card = reportCard([...defended(BOULDER), ...hit(GRAB), ...defended(BOULDER), ...defended(GRAB), ...defended(GRAB)]);
  expect(card.moves.map((move) => [move.moveId, move.kind, move.asked, move.done, move.grade, move.points])).toEqual([
    ["block", "defend", 3, 2, "GREAT", 200],
    ["duck", "defend", 2, 2, "EXCELLENT", 200],
  ]);
  expect(card.moves[0]?.quality).toBeCloseTo(2 / 3);
  expect(card.grade).toBe("GREAT");
  expect(card.points).toBe(400);
  expect(card.best?.moveId).toBe("duck");
  expect(card.workOnLine).toBe("Block: fists up by your cheeks, elbows tucked in");
});

test("moves that never landed still get a row: asked, none done, no points", () => {
  const card = reportCard([...missed("jab"), ...missed("jab"), ...missed("cross"), ...hit(BOULDER), { type: "lost" }]);
  expect(card.moves.map((move) => [move.moveId, move.asked, move.done, move.quality, move.grade, move.points])).toEqual([
    ["cross", 1, 0, 0, "NEEDS IMPROVEMENT", 0],
    ["duck", 1, 0, 0, "NEEDS IMPROVEMENT", 0],
    ["jab", 2, 0, 0, "NEEDS IMPROVEMENT", 0],
  ]);
  expect(card.grade).toBe("NEEDS IMPROVEMENT");
  expect(card.points).toBe(0);
  // All level: ties go by move id, for the best and for the one to work on.
  expect(card.best?.moveId).toBe("cross");
  expect(card.workOnNext?.moveId).toBe("cross");
});

test("a fight cut off while a warning or an opening is up counts neither", () => {
  const card = reportCard([{ type: "telegraph", attack: GRAB }, { type: "powerUnleashed", damage: 40 }, { type: "won" }]);
  expect(card.moves).toEqual([]);
});

test("a strike that landed with no opening in the list was still asked for", () => {
  const [jab] = reportCard([{ type: "enemyHit", move: "jab", damage: 10, quality: 0.7 }]).moves;
  expect(jab).toMatchObject({ asked: 1, done: 1, quality: 0.7, grade: "GREAT", points: 100 });
});

test("the fight's own feedback takes the place of the fixed line, the points and the grade", () => {
  const events = [...landed("jab", 0.9), ...landed("jab", 0.9), ...landed("jab", 0.9), ...landed("cross", 0.9), ...defended(GRAB)];
  const card = reportCard(events, [
    { move: "jab", grade: "GREAT", points: 100, tip: "Guard hand by your chin" },
    { move: "jab", grade: "NEEDS IMPROVEMENT", points: 25, tip: "Extend your arm fully" },
    { move: "jab", grade: "GREAT", points: 100, tip: "Extend your arm fully" },
    { move: "block", grade: "GOOD", points: 50, tip: null },
  ]);
  const byId = Object.fromEntries(card.moves.map((move) => [move.moveId, move]));
  // The tip given most often, not the first one.
  expect(byId.jab).toMatchObject({ workOn: "Extend your arm fully", points: 225, grade: "GREAT", asked: 3, done: 3 });
  // Results with no tip: the points are the fight's, the line is the fixed one.
  expect(byId.block).toMatchObject({ workOn: WORK_ON.block, points: 50, grade: "NEEDS IMPROVEMENT" });
  // No results for the cross: graded from the events as before.
  expect(byId.cross).toMatchObject({ workOn: WORK_ON.cross, points: 150, grade: "EXCELLENT" });
  expect(card.points).toBe(225 + 50 + 150);
  expect(card.workOnLine).toBe("Block: fists up by your cheeks, elbows tucked in");
});

test("tied tips go to the one met first, and results for a move the events never show still make a row", () => {
  const card = reportCard([], [
    { move: "uppercut", grade: "EXCELLENT", points: 150 },
    { move: "uppercut", grade: "GREAT", points: 100, tip: "Drive the fist higher" },
    { move: "uppercut", grade: "GREAT", points: 100, tip: "Keep your elbow bent" },
  ]);
  expect(card.moves).toHaveLength(1);
  expect(card.moves[0]).toMatchObject({ moveId: "uppercut", kind: "strike", asked: 3, done: 3, points: 350, grade: "GREAT", workOn: "Drive the fist higher" });
});

test("a move that is not in the registry is named by its id and gets the general line", () => {
  const [row] = reportCard(missed("mystery_move")).moves;
  expect(row).toMatchObject({ moveId: "mystery_move", name: "mystery_move", workOn: WORK_ON_DEFAULT });
  expect(WORK_ON_DEFAULT.length).toBeLessThanOrEqual(WORK_ON_MAX);
});

test("the same events always give the same card, whatever order the moves were met in", () => {
  const a = reportCard([...missed("jab"), ...missed("cross"), ...hit(GRAB), ...hit(BOULDER)]);
  const b = reportCard([...hit(BOULDER), ...hit(GRAB), ...missed("cross"), ...missed("jab")]);
  expect(a).toEqual(b);
  expect(a.moves.map((move) => move.moveId)).toEqual(["block", "cross", "duck", "jab"]);
});

test("every move in the registry, strikes and defends, has its own work-on line that fits a row", () => {
  expect(MOVES.size).toBeGreaterThan(0);
  for (const move of MOVES.values()) {
    const line = WORK_ON[move.id];
    expect(line, `no work-on line for ${move.id}`).toBeTypeOf("string");
    expect(line?.length ?? 0, move.id).toBeGreaterThanOrEqual(12);
    expect(line?.length ?? 99, `${move.id}: "${line ?? ""}"`).toBeLessThanOrEqual(WORK_ON_MAX);
    expect(line?.endsWith("."), move.id).toBe(false);
  }
  // No line for a move that is gone, and no line used twice.
  expect(Object.keys(WORK_ON).filter((id) => !MOVES.has(id))).toEqual([]);
  expect(new Set(Object.values(WORK_ON)).size).toBe(Object.keys(WORK_ON).length);
});
