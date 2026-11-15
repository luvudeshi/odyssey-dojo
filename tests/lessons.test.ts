// "What you practised" (issue #160, part 2): the counting rules on hand-built event lists, then one real fight.
import { expect, test } from "vitest";
import { startFight, step } from "../src/combat/engine";
import type { CombatEvent, EnemyAttack, Strike } from "../src/core/types";
import { ENEMIES } from "../src/enemies/registry";
import { MAX_LINE, lessonsFrom } from "../src/lessons/lessons";
import { MOVES } from "../src/moves/registry";
import { STYLES } from "../src/styles/registry";

const attack = (id: string, name: string, counter: string): EnemyAttack => ({ id, name, counter, telegraphMs: 1000, damage: 5 });
const GRAB = attack("grab", "Grasping hand", "block");
const SWING = attack("club_left", "Club swing", "dodge_right");
const BOULDER = attack("boulder", "Boulder throw", "duck");

const defended = (a: EnemyAttack): CombatEvent[] => [{ type: "telegraph", attack: a }, { type: "defended", attack: a }];
const hit = (a: EnemyAttack): CombatEvent[] => [{ type: "telegraph", attack: a }, { type: "playerHit", attack: a, damage: a.damage }];
const landed = (move: string, quality: number): CombatEvent => ({ type: "enemyHit", move, damage: 10, quality });

test("no events: zeros, nothing to praise or work on, and one neutral line", () => {
  const lessons = lessonsFrom([]);
  expect(lessons).toMatchObject({ attacksSeen: 0, attacksDefended: 0, longestCleanRun: 0, best: null, workOn: null });
  expect(lessons.defences).toEqual([]);
  expect(lessons.strikes).toEqual([]);
  expect(lessons.lines).toHaveLength(1);
  expect(lessons.lines[0]?.length).toBeLessThanOrEqual(MAX_LINE);
});

test("counts attacks seen and defended, and the longest run with no hit in between", () => {
  const events = [
    ...defended(GRAB),
    ...defended(SWING),
    ...hit(BOULDER),
    ...defended(GRAB),
    landed("jab", 0.7),
    ...defended(SWING),
    { type: "whiffed" } as const,
    ...defended(BOULDER),
    ...hit(SWING),
    ...defended(GRAB),
  ];
  const lessons = lessonsFrom(events);
  expect(lessons.attacksSeen).toBe(8);
  expect(lessons.attacksDefended).toBe(6);
  // Strikes and missed openings between two defences do not break the run; only being hit does.
  expect(lessons.longestCleanRun).toBe(3);
});

test("a fight that ends while a warning is still up does not count that attack", () => {
  const events: CombatEvent[] = [
    ...defended(GRAB),
    { type: "telegraph", attack: SWING },
    { type: "powerUnleashed", damage: 36 },
    { type: "won" },
  ];
  const lessons = lessonsFrom(events);
  expect(lessons.attacksSeen).toBe(1);
  expect(lessons.attacksDefended).toBe(1);
  expect(lessons.defences.map((lesson) => lesson.moveId)).toEqual(["block"]);
  expect(lessons.workOn).toBeNull();
});

test("each defence has its name, teaches line, counts and the distinct attacks it answered", () => {
  const other = attack("slam", "Ground slam", "block");
  const lessons = lessonsFrom([...defended(GRAB), ...hit(GRAB), ...defended(other), ...defended(SWING)]);
  expect(lessons.defences).toEqual([
    { moveId: "block", name: "Block", teaches: MOVES.get("block")?.teaches, worked: 2, missed: 1, answered: ["Grasping hand", "Ground slam"] },
    { moveId: "dodge_right", name: "Dodge right", teaches: MOVES.get("dodge_right")?.teaches, worked: 1, missed: 0, answered: ["Club swing"] },
  ]);
});

test("a situation function replaces the attack name where it has a line", () => {
  const situation = (a: EnemyAttack): string | null => (a.id === "grab" ? "Someone grabs for you" : null);
  const lessons = lessonsFrom([...defended(GRAB), ...defended(GRAB), ...defended(SWING)], situation);
  expect(lessons.defences.find((lesson) => lesson.moveId === "block")?.answered).toEqual(["Someone grabs for you"]);
  expect(lessons.defences.find((lesson) => lesson.moveId === "dodge_right")?.answered).toEqual(["Club swing"]);
});

test("strikes: times landed and best quality, with the finishing move counted", () => {
  const lessons = lessonsFrom([landed("jab", 0.4), landed("cross", 0.9), landed("jab", 0.8), { type: "finished", move: "stake_thrust" }, { type: "won" }]);
  expect(lessons.strikes).toEqual([
    { moveId: "jab", name: MOVES.get("jab")?.name, teaches: MOVES.get("jab")?.teaches, landed: 2, bestQuality: 0.8 },
    { moveId: "cross", name: MOVES.get("cross")?.name, teaches: MOVES.get("cross")?.teaches, landed: 1, bestQuality: 0.9 },
    { moveId: "stake_thrust", name: MOVES.get("stake_thrust")?.name, teaches: MOVES.get("stake_thrust")?.teaches, landed: 1, bestQuality: 0 },
  ]);
  // No attack was seen, so there is still only the neutral line.
  expect(lessons.lines).toHaveLength(1);
});

test("best and workOn need at least two tries", () => {
  // Duck was missed once in one try: too little to judge. Block is 2 of 3, dodge right 3 of 3.
  const lessons = lessonsFrom([
    ...hit(BOULDER),
    ...defended(GRAB),
    ...hit(GRAB),
    ...defended(GRAB),
    ...defended(SWING),
    ...defended(SWING),
    ...defended(SWING),
  ]);
  expect(lessons.best?.moveId).toBe("dodge_right");
  expect(lessons.workOn?.moveId).toBe("block");
  expect(lessons.lines).toEqual([
    "You saw 7 attacks and got out of the way of 5.",
    "Your dodge right held 3 of 3 times: moving sideways, not straight back, takes you out of an attack's path so you can get away.",
    "Work on: block. Hands high protects your head while you look for a way out.",
    "Your longest run without being hit: 4 attacks in a row.",
  ]);
});

test("everything defended: nothing to work on, and the lines say so", () => {
  const lessons = lessonsFrom([...defended(GRAB), ...defended(GRAB), ...defended(SWING)]);
  expect(lessons.best?.moveId).toBe("block");
  expect(lessons.workOn).toBeNull();
  expect(lessons.lines).toHaveLength(4);
  expect(lessons.lines[2]).toMatch(/^Nothing got through/);
});

test("one defence tried, with misses: it is the one to work on and is not also praised", () => {
  const lessons = lessonsFrom([...defended(BOULDER), ...hit(BOULDER), ...hit(BOULDER)]);
  expect(lessons.best?.moveId).toBe("duck");
  expect(lessons.workOn?.moveId).toBe("duck");
  expect(lessons.lines).toEqual([
    "You saw 3 attacks and got out of the way of 1.",
    "Work on: duck. Bend your knees, not your waist, to drop under a swing and still see what is coming.",
    "Every attack you see coming is one you can move away from. The first choice is always to leave.",
  ]);
});

test("a move that is not in the registry does not throw: its id is its name and it teaches nothing", () => {
  const odd = attack("stare", "Stone stare", "look_away");
  const lessons = lessonsFrom([...defended(odd), ...hit(odd), ...hit(odd), landed("head_butt", 0.5)]);
  expect(lessons.defences).toEqual([{ moveId: "look_away", name: "look_away", teaches: "", worked: 1, missed: 2, answered: ["Stone stare"] }]);
  expect(lessons.strikes).toEqual([{ moveId: "head_butt", name: "head_butt", teaches: "", landed: 1, bestQuality: 0.5 }]);
  expect(lessons.lines).toContain("Work on: look_away.");
  expect(lessons.lines).toHaveLength(3);
  // Seen once and missed, with nothing to say about it: the line is still a whole sentence.
  expect(lessonsFrom(hit(odd)).lines[1]).toBe("Remember the look_away.");
});

test("a single attack still gives three short lines", () => {
  for (const events of [defended(GRAB), hit(GRAB)]) {
    const lines = lessonsFrom(events).lines;
    expect(lines).toHaveLength(3);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(MAX_LINE);
  }
});

/** The events of one whole fight, played the way tests/balance/simulate.ts plays it: seeded, no clock. */
function realFight(enemyId: string, seed: number, defend: number): CombatEvent[] {
  const enemy = ENEMIES.find((candidate) => candidate.id === enemyId);
  const style = STYLES[0];
  if (!enemy || !style) throw new Error(`no enemy ${enemyId} or no style`);
  let chance = seed;
  const lucky = (share: number): boolean => {
    chance = (Math.imul(chance, 1103515245) + 12345) >>> 0;
    return chance / 4294967296 < share;
  };
  const events: CombatEvent[] = [];
  let state = startFight(enemy, seed);
  let good = false;
  let since = 0;
  for (let ms = 0; ms < 600_000 && state.phase.kind !== "won" && state.phase.kind !== "lost"; ms += 20) {
    const phase = state.phase;
    const held = new Set<string>();
    const struck: Strike[] = [];
    if (phase.kind === "defend" && good) held.add(phase.attack.counter);
    if ((phase.kind === "strike" || phase.kind === "finisher") && since >= 800) struck.push({ move: phase.move, quality: 0.7, player: 0 });
    const result = step(state, enemy, style, { held, struck }, 20);
    // A new warning is a new roll of the dice; an opening or finishing move starts its reaction time again.
    if (result.state.phase.kind !== phase.kind) since = 0;
    else since += 20;
    if (result.events.some((event) => event.type === "telegraph")) good = lucky(defend);
    events.push(...result.events);
    state = result.state;
  }
  return events;
}

test("a real Polyphemus fight: the numbers add up and the lines fit a result screen", () => {
  const events = realFight("polyphemus", 160, 0.75);
  const count = (type: CombatEvent["type"]): number => events.filter((event) => event.type === type).length;
  expect(events.at(-1)?.type).toBe("won");
  const lessons = lessonsFrom(events);

  expect(lessons.attacksDefended).toBe(count("defended"));
  expect(lessons.attacksSeen).toBe(count("defended") + count("playerHit"));
  // Every warning ends in a defence or a hit, except one still up when the fight ends.
  const open = count("telegraph") - lessons.attacksSeen;
  expect(open === 0 || open === 1).toBe(true);
  expect(lessons.attacksSeen).toBeGreaterThan(5);
  expect(lessons.longestCleanRun).toBeGreaterThanOrEqual(1);
  expect(lessons.longestCleanRun).toBeLessThanOrEqual(lessons.attacksDefended);

  expect(lessons.defences.length).toBeGreaterThan(0);
  for (const lesson of lessons.defences) {
    expect(lesson.teaches.trim(), lesson.moveId).not.toBe("");
    expect(lesson.answered.length, lesson.moveId).toBeGreaterThan(0);
    expect(MOVES.get(lesson.moveId)?.kind, lesson.moveId).toBe("defend");
  }
  expect(lessons.defences.reduce((sum, lesson) => sum + lesson.worked + lesson.missed, 0)).toBe(lessons.attacksSeen);
  expect(lessons.strikes.reduce((sum, lesson) => sum + lesson.landed, 0)).toBe(count("enemyHit") + count("finished"));

  expect(lessons.lines.length).toBeGreaterThanOrEqual(3);
  expect(lessons.lines.length).toBeLessThanOrEqual(4);
  for (const line of lessons.lines) expect(line.length, line).toBeLessThanOrEqual(MAX_LINE);
  // Same seed, same fight, same lessons.
  expect(lessonsFrom(realFight("polyphemus", 160, 0.75))).toEqual(lessons);
});
