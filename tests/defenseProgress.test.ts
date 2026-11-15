// Defence progress: the record of one fight, the numbers over many, the level rules, the cap and the store.
// Events are built by hand the way tests/lessons.test.ts builds them, then one real fight is played.
import { expect, test } from "vitest";
import { startFight, step } from "../src/combat/engine";
import type { CombatEvent, EnemyAttack, Strike } from "../src/core/types";
import { ENEMIES } from "../src/enemies/registry";
import { CORE_KINDS, HISTORY_MAX, LEVELS, TREND_FIGHTS, WEAK_MIN_SEEN, defenseProgress, fightDefense, levelFor, recordFight } from "../src/lessons/defense";
import type { FightDefense } from "../src/lessons/defense";
import { DEFENSE_KEY, createDefenseStore, parseHistory } from "../src/lessons/defenseStore";
import { lessonsFrom } from "../src/lessons/lessons";
import { MOVES } from "../src/moves/registry";
import { STYLES } from "../src/styles/registry";

const attack = (id: string, counter: string): EnemyAttack => ({ id, name: id, counter, telegraphMs: 1000, damage: 5 });
const GRAB = attack("grab", "block");
const SWING = attack("club_left", "dodge_right");
const SWEEP = attack("club_right", "dodge_left");
const BOULDER = attack("boulder", "duck");

const defended = (a: EnemyAttack): CombatEvent[] => [{ type: "telegraph", attack: a }, { type: "defended", attack: a }];
const hit = (a: EnemyAttack): CombatEvent[] => [{ type: "telegraph", attack: a }, { type: "playerHit", attack: a, damage: a.damage }];
const times = (count: number, events: () => CombatEvent[]): CombatEvent[] => Array.from({ length: count }, events).flat();
const ABOUT = { enemyId: "polyphemus", at: 1000 };

/** A saved fight with `defended` of `seen` attacks, all of one kind. */
const fight = (defendedCount: number, seen: number, kind = "block", at = 0): FightDefense => ({
  at, enemyId: "polyphemus", seen, defended: defendedCount, hits: seen - defendedCount, longestRun: defendedCount,
  kinds: { [kind]: { seen, defended: defendedCount } },
});

test("one fight's record: seen, defended, hits, the longest run and the split by kind", () => {
  const events = [
    ...defended(GRAB), ...defended(SWING), ...hit(BOULDER), ...defended(GRAB),
    { type: "enemyHit", move: "jab", damage: 10, quality: 0.7 } as const,
    ...defended(SWING), ...defended(BOULDER), ...hit(SWING), ...defended(GRAB),
  ];
  expect(fightDefense(events, ABOUT)).toEqual({
    at: 1000, enemyId: "polyphemus", seen: 8, defended: 6, hits: 2, longestRun: 3,
    kinds: { block: { seen: 3, defended: 3 }, dodge_right: { seen: 3, defended: 2 }, duck: { seen: 2, defended: 1 } },
  });
});

test("a warning still up when the fight ends is not counted, and a fight with no attacks leaves no record", () => {
  const cutShort: CombatEvent[] = [...defended(GRAB), { type: "telegraph", attack: SWING }, { type: "powerUnleashed", damage: 36 }, { type: "won" }];
  expect(fightDefense(cutShort, ABOUT)).toMatchObject({ seen: 1, defended: 1, kinds: { block: { seen: 1, defended: 1 } } });
  expect(fightDefense([{ type: "whiffed" }, { type: "won" }], ABOUT)).toBeNull();
  const history = [fight(1, 2)];
  expect(recordFight(history, [{ type: "won" }], ABOUT)).toBe(history);
});

test("empty history: zeros, the four core kinds at nothing, no trend, no weakest, Novice", () => {
  const progress = defenseProgress([]);
  expect(progress).toMatchObject({ fights: 0, seen: 0, defended: 0, hits: 0, rate: 0, bestStreak: 0, direction: null, weakest: null });
  expect(progress.kinds.map((kind) => kind.moveId)).toEqual(CORE_KINDS);
  expect(progress.kinds.every((kind) => kind.seen === 0 && kind.rate === 0)).toBe(true);
  expect(progress.trend).toEqual([]);
  expect(progress.level.id).toBe("novice");
  expect(progress.nextLevel?.id).toBe("guarded");
  expect(progress.practiseNext.moveId).toBeNull();
  expect(progress.practiseNext.line).not.toBe("");
});

test("the overall rate and the rate per kind add up over the fights", () => {
  const first = fightDefense([...times(3, () => defended(GRAB)), ...hit(GRAB), ...times(2, () => hit(BOULDER))], ABOUT);
  const second = fightDefense([...times(4, () => defended(BOULDER)), ...times(2, () => defended(SWING)), ...times(4, () => defended(GRAB))], ABOUT);
  if (!first || !second) throw new Error("both fights have attacks");
  const progress = defenseProgress([first, second]);
  expect(progress).toMatchObject({ fights: 2, seen: 16, defended: 13, hits: 3 });
  expect(progress.rate).toBeCloseTo(13 / 16);
  const kind = (id: string) => progress.kinds.find((each) => each.moveId === id);
  expect(kind("block")).toMatchObject({ seen: 8, defended: 7, name: MOVES.get("block")?.name });
  expect(kind("duck")).toMatchObject({ seen: 6, defended: 4 });
  expect(kind("duck")?.rate).toBeCloseTo(4 / 6);
  expect(kind("dodge_right")).toMatchObject({ seen: 2, defended: 2, rate: 1 });
  expect(kind("dodge_left")).toMatchObject({ seen: 0, defended: 0, rate: 0 });
  // The best streak is the longest run inside one fight: the second fight's ten in a row.
  expect(progress.bestStreak).toBe(10);
});

test("a kind outside the core four is listed after them once it comes up", () => {
  const leap = fightDefense([...defended(attack("sweep", "jump")), ...defended(GRAB)], ABOUT);
  if (!leap) throw new Error("the fight has attacks");
  expect(defenseProgress([leap]).kinds.map((kind) => kind.moveId)).toEqual([...CORE_KINDS, "jump"]);
});

test("the trend is the last five fights, oldest first, and says which way the newest one went", () => {
  const rates = [2, 4, 5, 6, 7, 8, 10];
  const history = rates.map((count, index) => fight(count, 10, "block", index));
  const progress = defenseProgress(history);
  expect(progress.trend).toHaveLength(TREND_FIGHTS);
  expect(progress.trend.map((point) => point.defended)).toEqual([5, 6, 7, 8, 10]);
  expect(progress.trend.map((point) => point.at)).toEqual([2, 3, 4, 5, 6]);
  expect(progress.trend.at(-1)?.rate).toBe(1);
  expect(progress.direction).toBe("up");

  expect(defenseProgress([fight(9, 10), fight(8, 10), fight(4, 10)]).direction).toBe("down");
  // Within five points of the fights before it: steady.
  expect(defenseProgress([fight(7, 10), fight(8, 10), fight(31, 40)]).direction).toBe("steady");
  expect(defenseProgress([fight(7, 10)]).direction).toBeNull();
  expect(defenseProgress([fight(7, 10)]).trend).toHaveLength(1);
});

test("the weakest kind is the lowest rate of those met often enough, and the line names its dojo move", () => {
  const events = [
    ...times(5, () => defended(GRAB)), ...hit(GRAB),
    ...times(2, () => defended(BOULDER)), ...times(2, () => hit(BOULDER)),
    // Dodge left failed every time, but came up too rarely to judge.
    ...times(WEAK_MIN_SEEN - 1, () => hit(SWEEP)),
  ];
  const record = fightDefense(events, ABOUT);
  if (!record) throw new Error("the fight has attacks");
  const progress = defenseProgress([record]);
  expect(progress.weakest).toMatchObject({ moveId: "duck", seen: 4, defended: 2 });
  expect(progress.practiseNext.moveId).toBe("duck");
  expect(MOVES.get(progress.practiseNext.moveId ?? "")?.kind).toBe("defend");
  expect(progress.practiseNext.line).toContain("duck");
  expect(progress.practiseNext.line).toContain("2 of 4");
  expect(progress.practiseNext.line).toContain("Training Dojo");
});

test("ties for the weakest go to the kind met more often, then to the one listed first", () => {
  const more = fightDefense([...times(2, () => defended(GRAB)), ...times(2, () => hit(GRAB)), ...times(3, () => defended(BOULDER)), ...times(3, () => hit(BOULDER))], ABOUT);
  const same = fightDefense([...times(2, () => defended(SWING)), ...times(2, () => hit(SWING)), ...times(2, () => defended(BOULDER)), ...times(2, () => hit(BOULDER))], ABOUT);
  if (!more || !same) throw new Error("both fights have attacks");
  expect(defenseProgress([more]).weakest?.moveId).toBe("duck");
  // Duck is listed before dodge right.
  expect(defenseProgress([same]).weakest?.moveId).toBe("duck");
});

test("nothing is called weak when every attack was defended, or when no kind came up often enough", () => {
  const clean = defenseProgress([fight(12, 12)]);
  expect(clean.weakest).toBeNull();
  expect(clean.practiseNext.moveId).toBeNull();
  expect(clean.practiseNext.line).toContain("Nothing got through");
  const thin = defenseProgress([fight(1, 2)]);
  expect(thin.weakest).toBeNull();
  expect(thin.practiseNext.line).toContain("No one defence stands out");
});

test("the level rules: each needs its rate, its fights and ten attacks seen", () => {
  expect(LEVELS.map((level) => level.name)).toEqual(["Novice", "Guarded", "Steady", "Unshakeable"]);
  expect(LEVELS.every((level) => level.rule !== "")).toBe(true);
  // Too few attacks to judge, however well they went.
  expect(levelFor(1, 5, 9).id).toBe("novice");
  expect(levelFor(0.49, 5, 40).id).toBe("novice");
  expect(levelFor(0.5, 1, 10).id).toBe("guarded");
  // A high rate over too few fights stays Guarded.
  expect(levelFor(0.95, 2, 30).id).toBe("guarded");
  expect(levelFor(0.7, 3, 30).id).toBe("steady");
  expect(levelFor(0.84, 9, 90).id).toBe("steady");
  expect(levelFor(0.9, 4, 40).id).toBe("steady");
  expect(levelFor(0.85, 5, 50).id).toBe("unshakeable");

  const top = defenseProgress(Array.from({ length: 5 }, () => fight(9, 10)));
  expect(top.level.id).toBe("unshakeable");
  expect(top.nextLevel).toBeNull();
  expect(defenseProgress([fight(6, 10)]).level.id).toBe("guarded");
  expect(defenseProgress([fight(6, 10)]).nextLevel?.id).toBe("steady");
});

test("recordFight adds to the end and keeps only the newest fights", () => {
  let history: readonly FightDefense[] = [];
  for (let index = 0; index < HISTORY_MAX + 7; index += 1) {
    history = recordFight(history, defended(GRAB), { enemyId: "scylla", at: index });
  }
  expect(history).toHaveLength(HISTORY_MAX);
  expect(history[0]?.at).toBe(7);
  expect(history.at(-1)?.at).toBe(HISTORY_MAX + 6);
});

test("a record built from a real Polyphemus fight agrees with the fight's events and with lessonsFrom", () => {
  const events = realFight("polyphemus", 160, 0.75);
  const count = (type: CombatEvent["type"]): number => events.filter((event) => event.type === type).length;
  const record = fightDefense(events, ABOUT);
  if (!record) throw new Error("a real fight has attacks");
  const lessons = lessonsFrom(events);

  expect(record.defended).toBe(count("defended"));
  expect(record.hits).toBe(count("playerHit"));
  expect(record.seen).toBe(lessons.attacksSeen);
  expect(record.seen).toBeGreaterThan(5);
  expect(record.longestRun).toBe(lessons.longestCleanRun);
  // The kinds are defend moves the game knows, and they add up to the totals.
  const kinds = Object.entries(record.kinds);
  expect(kinds.length).toBeGreaterThan(0);
  for (const [id] of kinds) expect(MOVES.get(id)?.kind).toBe("defend");
  expect(kinds.reduce((sum, [, kind]) => sum + kind.seen, 0)).toBe(record.seen);
  expect(kinds.reduce((sum, [, kind]) => sum + kind.defended, 0)).toBe(record.defended);
  for (const lesson of lessons.defences) expect(record.kinds[lesson.moveId]).toEqual({ seen: lesson.worked + lesson.missed, defended: lesson.worked });

  const progress = defenseProgress([record]);
  expect(progress.rate).toBeCloseTo(record.defended / record.seen);
  expect(progress.trend).toHaveLength(1);
});

test("stored history of any shape reads back as valid records", () => {
  expect(parseHistory(null)).toEqual([]);
  expect(parseHistory("not json")).toEqual([]);
  expect(parseHistory('{"a":1}')).toEqual([]);
  const odd = parseHistory(JSON.stringify([
    7,
    { enemyId: 3, kinds: { block: { seen: 2, defended: 1 } } },
    { enemyId: "circe", kinds: {} },
    { enemyId: "circe", at: "x", seen: 99, defended: 99, longestRun: 99, kinds: { block: { seen: 3.9, defended: 8 }, duck: { seen: -1, defended: 0 }, jump: "no" } },
  ]));
  // Totals come from the kinds; what was defended can never pass what was seen.
  expect(odd).toEqual([{ at: 0, enemyId: "circe", seen: 3, defended: 3, hits: 0, longestRun: 3, kinds: { block: { seen: 3, defended: 3 } } }]);
  expect(parseHistory(JSON.stringify(Array.from({ length: HISTORY_MAX + 3 }, (_, index) => fight(1, 2, "block", index))))).toHaveLength(HISTORY_MAX);
});

test("the store saves under its own key, reads it back, tells its listeners and survives a storage that throws", () => {
  const saved = new Map<string, string>();
  const storage = { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => { saved.set(key, value); } };
  const store = createDefenseStore(storage);
  let told = 0;
  const stop = store.subscribe(() => { told += 1; });
  expect(store.get()).toEqual([]);
  store.record([...defended(GRAB), ...hit(BOULDER)], "scylla", 42);
  expect(told).toBe(1);
  expect(store.get()).toHaveLength(1);
  expect([...saved.keys()]).toEqual([DEFENSE_KEY]);
  expect(DEFENSE_KEY.startsWith("odyssey-dojo.")).toBe(true);
  // A fight with no attacks saves nothing and tells nobody.
  store.record([{ type: "won" }], "scylla", 43);
  expect(told).toBe(1);
  stop();
  expect(createDefenseStore(storage).get()).toEqual(store.get());
  expect(store.get()[0]).toMatchObject({ at: 42, enemyId: "scylla", seen: 2, defended: 1 });

  const broken = { getItem: (): string | null => { throw new Error("blocked"); }, setItem: (): void => { throw new Error("full"); } };
  const careful = createDefenseStore(broken);
  expect(careful.get()).toEqual([]);
  careful.record(defended(GRAB), "circe", 1);
  expect(careful.get()).toHaveLength(1);
  expect(createDefenseStore(null).get()).toEqual([]);
});

/** The events of one whole fight, played the way tests/lessons.test.ts plays it: seeded, no clock. */
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
    if (result.state.phase.kind !== phase.kind) since = 0;
    else since += 20;
    if (result.events.some((event) => event.type === "telegraph")) good = lucky(defend);
    events.push(...result.events);
    state = result.state;
  }
  return events;
}
