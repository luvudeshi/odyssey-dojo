// The adaptive difficulty director: what it counts, how it reads the player, and what it may and may not change.
import { expect, test } from "vitest";
import { EMPTY_STATS, observe, skill, tune } from "../../src/ai/director";
import type { DirectorStats } from "../../src/ai/director";
import { startFight, step } from "../../src/combat/engine";
import type { CombatEvent, EnemyAttack, EnemySpec, FightingStyle, Strike } from "../../src/core/types";
import { ENEMIES } from "../../src/enemies/registry";

const boss: EnemySpec = {
  id: "boss", name: "Boss", title: "", order: 0, hp: 1000, strikeWindowMs: 2000,
  attacks: [
    { id: "swing", name: "Swing", telegraphMs: 1900, damage: 5, counter: "block" },
    { id: "lunge", name: "Lunge", telegraphMs: 1800, damage: 5, counter: "duck", weight: 2 },
    { id: "sweep", name: "Sweep", telegraphMs: 2000, damage: 6, counter: "dodge_left" },
  ],
  phases: [
    { name: "Calm", belowHp: 1, attackIds: ["swing", "lunge", "sweep"], telegraphScale: 1 },
    { name: "Wild", belowHp: 0.5, attackIds: ["swing", "lunge"], telegraphScale: 0.6 },
  ],
  weakSpots: [{ id: "head", label: "head", position: [0, 0, 0], moves: ["jab"] }],
  finisher: "stake_thrust",
  taunts: ["Hm."],
};
const style: FightingStyle = { id: "s", name: "S", blurb: "", strikes: ["jab"] };

function attackFor(counter: string): EnemyAttack {
  return boss.attacks.find((attack) => attack.counter === counter) ?? boss.attacks[0];
}
const defended = (counter: string): CombatEvent => ({ type: "defended", attack: attackFor(counter) });
const hit = (counter: string): CombatEvent => ({ type: "playerHit", attack: attackFor(counter), damage: 5 });
const landed: CombatEvent = { type: "enemyHit", move: "jab", damage: 12, quality: 0.7 };
const whiffed: CombatEvent = { type: "whiffed" };
const times = (count: number, ...events: CombatEvent[]): CombatEvent[] =>
  Array.from({ length: count }, () => events).flat();

const COUNTERS = ["block", "duck", "dodge_left"] as const;
/** Eight clean exchanges, spread over every defence. */
const cruising = observe(
  EMPTY_STATS,
  Array.from({ length: 8 }, (_, index) => [defended(COUNTERS[index % 3] ?? "block"), landed]).flat(),
);
/** Blocks well, but is hit by everything that needs a duck or a dodge. */
const struggling = observe(EMPTY_STATS, [...times(2, defended("block")), ...times(3, hit("duck")), ...times(3, hit("dodge_left"))]);
/** Doing well overall, with ducking the one weak defence. */
const weakDuck = observe(EMPTY_STATS, [
  ...times(2, hit("duck")),
  ...times(2, defended("duck")),
  ...times(5, defended("block")),
  ...times(3, defended("dodge_left")),
]);

const warnings = (enemy: EnemySpec): number[] => enemy.attacks.map((attack) => attack.telegraphMs);
const warningOf = (enemy: EnemySpec, id: string): number => enemy.attacks.find((attack) => attack.id === id)?.telegraphMs ?? 0;
const weightOf = (enemy: EnemySpec, id: string): number => enemy.attacks.find((attack) => attack.id === id)?.weight ?? 1;

/** Everything the director must leave alone. */
function fixedParts(enemy: EnemySpec): unknown {
  const attacks = enemy.attacks.map(({ id, name, damage, counter }) => ({ id, name, damage, counter }));
  return { ...enemy, strikeWindowMs: 0, attacks };
}

test("observe counts each kind of event and ignores the rest", () => {
  const stats = observe(EMPTY_STATS, [
    defended("block"), landed, hit("block"), defended("duck"), whiffed, hit("duck"), hit("duck"), landed,
  ]);
  expect(Object.keys(stats.defences)).toEqual(["block", "duck"]);
  expect(stats.defences.block).toMatchObject({ defended: 1, hit: 1 });
  expect(stats.defences.duck).toMatchObject({ defended: 1, hit: 2 });
  // Form leans on the latest attempts: a stop then a hit, and a stop then two hits.
  expect(stats.defences.block?.form).toBeCloseTo(0.7);
  expect(stats.defences.duck?.form).toBeCloseTo(0.49);
  expect(stats.landed).toBe(2);
  expect(stats.whiffed).toBe(1);
  expect(stats.recent).toEqual(["defended", "landed", "hit", "defended", "whiffed", "hit", "hit", "landed"]);
  expect(EMPTY_STATS).toEqual({ defences: {}, landed: 0, whiffed: 0, recent: [] });

  const unknown = { type: "mystery", attack: attackFor("block") } as unknown as CombatEvent;
  const ignored: CombatEvent[] = [
    { type: "telegraph", attack: attackFor("block") },
    { type: "opening", weakSpot: boss.weakSpots[0], move: "jab" },
    { type: "phaseChanged", index: 1, name: "Wild" },
    { type: "finished", move: "stake_thrust" },
    { type: "powerUnleashed", damage: 30 },
    { type: "won" },
    { type: "lost" },
    unknown,
  ];
  expect(observe(stats, ignored)).toBe(stats);
  expect(observe(stats, [])).toBe(stats);
});

test("the recent window stays short and keeps the newest results", () => {
  const stats = observe(EMPTY_STATS, [...times(30, defended("block")), hit("duck"), landed]);
  expect(stats.recent).toHaveLength(12);
  expect(stats.recent.slice(-3)).toEqual(["defended", "hit", "landed"]);
  expect(stats.defences.block?.defended).toBe(30);
});

test("skill is 0 with no data, positive on a streak, negative after hits", () => {
  expect(skill(EMPTY_STATS)).toBe(0);
  expect(skill(cruising)).toBe(1);
  expect(skill(observe(EMPTY_STATS, times(3, defended("block"), landed)))).toBeGreaterThan(0);
  expect(skill(observe(EMPTY_STATS, times(3, hit("block"))))).toBe(-1);
  expect(skill(observe(EMPTY_STATS, [defended("block"), ...times(3, hit("block"), whiffed)]))).toBeLessThan(0);
  expect(skill(struggling)).toBeLessThan(-0.5);
});

test("one mistake does not swing the fight, and two hits in a row relax it", () => {
  const oneHit = observe(cruising, [hit("block")]);
  expect(skill(oneHit)).toBeGreaterThan(0);
  expect(skill(oneHit)).toBeLessThan(skill(cruising));

  const twoHits = observe(oneHit, [hit("duck")]);
  expect(skill(twoHits)).toBeLessThan(0);
  warnings(tune(boss, twoHits)).forEach((ms, index) => {
    expect(ms).toBeGreaterThanOrEqual(warnings(boss)[index] ?? Infinity);
  });

  const recovered = observe(twoHits, times(3, defended("block"), landed));
  expect(skill(recovered)).toBeGreaterThan(0);
});

test("tune leaves a fresh fight alone", () => {
  expect(tune(boss, EMPTY_STATS)).toBe(boss);
  expect(tune(boss, observe(EMPTY_STATS, times(3, hit("block"))))).toBe(boss);
  expect(tune(boss, observe(EMPTY_STATS, times(3, defended("block"), landed)))).toBe(boss);
  // The fourth resolved attack starts to count, gently.
  const fourth = tune(boss, observe(EMPTY_STATS, times(4, defended("block"), landed)));
  expect(warningOf(fourth, "sweep")).toBeLessThan(2000);
  expect(warningOf(fourth, "sweep")).toBeGreaterThan(warningOf(tune(boss, cruising), "sweep"));
});

test("a strong player gets shorter warnings, never below a second in the fastest phase", () => {
  const tuned = tune(boss, cruising);
  tuned.attacks.forEach((attack, index) => {
    const base = boss.attacks[index]?.telegraphMs ?? 0;
    expect(attack.telegraphMs, attack.id).toBeLessThan(base);
    expect(attack.telegraphMs, attack.id).toBeGreaterThanOrEqual(base * 0.8);
  });
  // Sweep is only used at full speed, so it takes the whole 20 percent; the others stop at the floor.
  expect(warningOf(tuned, "sweep")).toBe(1600);
  for (const phase of tuned.phases ?? []) {
    for (const id of phase.attackIds) {
      const attack = tuned.attacks.find((candidate) => candidate.id === id);
      expect(Math.round((attack?.telegraphMs ?? 0) * phase.telegraphScale), `${phase.name}/${id}`).toBeGreaterThanOrEqual(1000);
    }
  }
  expect(warningOf(tuned, "swing")).toBe(1667);
  expect(warningOf(tuned, "lunge")).toBe(1667);
  expect(tuned.strikeWindowMs).toBe(boss.strikeWindowMs);
});

test("a phase that names no real attack counts as using them all, as it does in the engine", () => {
  const loose: EnemySpec = {
    ...boss,
    attacks: [
      { id: "a", name: "A", telegraphMs: 2000, damage: 5, counter: "block" },
      { id: "b", name: "B", telegraphMs: 1700, damage: 5, counter: "duck" },
    ],
    phases: [
      { name: "One", belowHp: 1, attackIds: ["a"], telegraphScale: 1 },
      { name: "Two", belowHp: 0.5, attackIds: ["typo"], telegraphScale: 0.7 },
    ],
  };
  const tuned = tune(loose, cruising);
  expect(warningOf(tuned, "a")).toBe(1600);
  // b is named by no phase, but the second phase falls back to every attack at 0.7.
  expect(warningOf(tuned, "b")).toBe(1429);

  const served = new Map<string, number>();
  let seed = 7;
  for (let round = 0; round < 20; round++) {
    const begun = step({ ...startFight(tuned, seed), phaseIndex: 1 }, tuned, style, { held: new Set(), struck: [] }, 5000);
    const phase = begun.state.phase;
    if (phase.kind === "defend") served.set(phase.attack.id, phase.totalMs);
    seed = begun.state.seed;
  }
  expect([...served.keys()].sort()).toEqual(["a", "b"]);
  for (const [id, ms] of served) expect(ms, id).toBeGreaterThanOrEqual(1000);
});

test("defence ids that are Object.prototype names are counted like any other", () => {
  const names = ["constructor", "__proto__", "toString"] as const;
  const [first, ...rest] = names.map((counter): EnemyAttack => ({ id: counter, name: counter, telegraphMs: 2000, damage: 5, counter }));
  const odd: EnemySpec = {
    ...boss,
    attacks: [first ?? attackFor("block"), ...rest],
    phases: [{ name: "Only", belowHp: 1, attackIds: [...names], telegraphScale: 1 }],
  };
  const all = (type: "defended" | "playerHit"): CombatEvent[] =>
    times(3, ...odd.attacks.map((attack): CombatEvent => (type === "defended" ? { type, attack } : { type, attack, damage: 5 })));

  const stopped = observe(EMPTY_STATS, all("defended"));
  expect(Object.getPrototypeOf(stopped.defences)).toBe(Object.prototype);
  for (const counter of names) {
    expect(Object.getOwnPropertyDescriptor(stopped.defences, counter)?.value, counter).toEqual({ defended: 3, hit: 0, form: 1 });
  }
  for (const stats of [stopped, observe(EMPTY_STATS, all("playerHit")), observe(stopped, all("playerHit").slice(0, 4))]) {
    const tuned = tune(odd, stats);
    expect(tuned).not.toBe(odd);
    expect(Number.isFinite(tuned.strikeWindowMs)).toBe(true);
    for (const attack of tuned.attacks) {
      expect(Number.isFinite(attack.telegraphMs), attack.id).toBe(true);
      expect(Number.isFinite(attack.weight ?? 1), attack.id).toBe(true);
      expect(attack.telegraphMs, attack.id).toBeGreaterThanOrEqual(1600);
    }
  }
  expect(warnings(tune(odd, stopped))).toEqual([1600, 1600, 1600]);
});

test("no registered enemy is tuned under a second in any phase, however well the player does", () => {
  expect(ENEMIES.length).toBeGreaterThan(0);
  for (const enemy of ENEMIES) {
    const tuned = tune(enemy, cruising);
    const phases = enemy.phases ?? [{ name: "whole fight", attackIds: enemy.attacks.map((attack) => attack.id), telegraphScale: 1 }];
    for (const phase of phases) {
      for (const id of phase.attackIds) {
        const served = Math.round(warningOf(tuned, id) * phase.telegraphScale);
        const untuned = Math.round(warningOf(enemy, id) * phase.telegraphScale);
        expect(served, `${enemy.id}/${phase.name}/${id}`).toBeGreaterThanOrEqual(Math.min(1000, untuned));
        expect(served, `${enemy.id}/${phase.name}/${id}`).toBeLessThanOrEqual(untuned);
      }
    }
    expect(warnings(tuned).some((ms, index) => ms < (warnings(enemy)[index] ?? 0)), enemy.id).toBe(true);
  }
});

test("a warning already under the floor is left as it is", () => {
  const quick: EnemySpec = {
    ...boss,
    attacks: [{ id: "snap", name: "Snap", telegraphMs: 1000, damage: 5, counter: "block" }],
    phases: [{ name: "Only", belowHp: 1, attackIds: ["snap"], telegraphScale: 0.6 }],
  };
  expect(tune(quick, cruising)).toBe(quick);
  expect(tune(quick, struggling).attacks[0].telegraphMs).toBeGreaterThan(1000);
});

test("a struggling player gets longer warnings, a wider strike window and more of what they handle best", () => {
  const tuned = tune(boss, struggling);
  tuned.attacks.forEach((attack, index) => {
    const base = boss.attacks[index]?.telegraphMs ?? 0;
    expect(attack.telegraphMs, attack.id).toBeGreaterThan(base * 1.1);
    expect(attack.telegraphMs, attack.id).toBeLessThanOrEqual(base * 1.3);
  });
  expect(tuned.strikeWindowMs).toBeGreaterThan(boss.strikeWindowMs * 1.1);
  expect(tuned.strikeWindowMs).toBeLessThanOrEqual(boss.strikeWindowMs * 1.25);
  expect(weightOf(tuned, "swing")).toBeGreaterThan(1.5);
  expect(weightOf(tuned, "swing")).toBeLessThanOrEqual(2);
  expect(weightOf(tuned, "lunge")).toBe(2);
  expect(weightOf(tuned, "sweep")).toBe(1);
});

test("a strong player sees more of the attack whose counter is their weakest", () => {
  const tuned = tune(boss, weakDuck);
  expect(skill(weakDuck)).toBeGreaterThan(0.5);
  expect(weightOf(tuned, "lunge")).toBeGreaterThan(3);
  expect(weightOf(tuned, "lunge")).toBeLessThanOrEqual(4);
  expect(weightOf(tuned, "swing")).toBe(1);
  expect(weightOf(tuned, "sweep")).toBe(1);
  // One sample is not enough to call a defence weak, and equal defences are all left alone.
  const oneSample = observe(EMPTY_STATS, [hit("duck"), ...times(6, defended("block"), landed)]);
  expect(weightOf(tune(boss, oneSample), "lunge")).toBe(2);
  expect(tune(boss, cruising).attacks.map((attack) => attack.weight)).toEqual([undefined, 2, undefined]);
});

test("a weakness the player has since fixed stops being pressed", () => {
  const start = observe(EMPTY_STATS, [...times(2, hit("duck")), ...times(3, defended("block")), ...times(3, defended("dodge_left"))]);
  const learning = tune(boss, observe(start, times(2, defended("duck"))));
  const learned = tune(boss, observe(start, times(10, defended("duck"))));
  expect(weightOf(learning, "lunge")).toBeGreaterThan(3);
  // Ducking is still the lowest lifetime tally (10 of 12), but ten in a row is no longer a weakness.
  expect(weightOf(learned, "lunge")).toBeGreaterThanOrEqual(2);
  expect(weightOf(learned, "lunge")).toBeLessThan(2.2);
  expect(warningOf(learned, "sweep")).toBe(1600);
});

test("tune never changes ids, counters, damage, health, phases, weak spots or the finisher, and keeps weights positive", () => {
  const before = JSON.stringify(boss);
  for (const stats of [cruising, struggling, weakDuck, observe(cruising, times(2, hit("duck")))]) {
    const tuned = tune(boss, stats);
    expect(tuned).not.toBe(boss);
    expect(fixedParts(tuned)).toEqual(fixedParts(boss));
    expect(tuned.phases).toBe(boss.phases);
    expect(tuned.weakSpots).toBe(boss.weakSpots);
    for (const attack of tuned.attacks) expect(attack.weight ?? 1, attack.id).toBeGreaterThan(0);
  }
  expect(JSON.stringify(boss)).toBe(before);

  const [swing, ...others] = boss.attacks;
  const silenced: EnemySpec = { ...boss, attacks: [{ ...swing, weight: 0 }, ...others] };
  expect(tune(silenced, struggling).attacks[0].weight).toBe(0);
});

test("equal inputs give equal outputs", () => {
  const events = [...times(5, defended("block"), landed), hit("duck"), hit("duck"), whiffed];
  const once = tune(boss, observe(EMPTY_STATS, events));
  const again = tune({ ...boss }, observe(EMPTY_STATS, [...events]));
  expect(again).toEqual(once);
  // No memory between calls: the same stats give an equal enemy whatever was asked in between.
  const stats = observe(EMPTY_STATS, events);
  const before = tune(boss, stats);
  tune(boss, cruising);
  expect(tune(boss, stats)).toEqual(before);
});

/** Ten exchanges against the real engine as a player who defends `rate` of the attacks, with the director in the loop. */
function fight(rate: number, seed: number): { stats: DirectorStats; served: readonly EnemyAttack[] } {
  let chance = seed;
  const lucky = (): boolean => {
    chance = (Math.imul(chance, 1103515245) + 12345) >>> 0;
    return chance / 4294967296 < rate;
  };
  let state = startFight(boss, seed);
  let stats = EMPTY_STATS;
  let good = false;
  let exchanges = 0;
  const served: EnemyAttack[] = [];
  for (let frame = 0; frame < 100_000 && exchanges < 10; frame++) {
    const phase = state.phase;
    if (phase.kind === "defend" && phase.msLeft === phase.totalMs) {
      good = lucky();
      // What the engine really announced: the attack's id with the warning it was given.
      served.push({ ...phase.attack, telegraphMs: phase.totalMs });
    }
    const held = new Set<string>();
    const struck: Strike[] = [];
    if (phase.kind === "defend" && good) held.add(phase.attack.counter);
    if (phase.kind === "strike") struck.push({ move: phase.move, quality: 0.7, player: 0 });
    const result = step(state, tune(boss, stats), style, { held, struck }, 20);
    // An attack already in its warning keeps the warning it was announced with.
    if (phase.kind === "defend" && result.state.phase.kind === "defend") {
      expect(result.state.phase.totalMs).toBe(phase.totalMs);
    }
    state = result.state;
    stats = observe(stats, result.events);
    exchanges += result.events.filter((event) => event.type === "defended" || event.type === "playerHit").length;
  }
  expect(exchanges).toBe(10);
  expect(state.phase.kind).not.toBe("lost");
  expect(served).toHaveLength(10);
  return { stats, served };
}

test("with the real engine, a player who defends 90 percent faces shorter warnings than one who defends 30 percent", () => {
  const total = (attacks: readonly EnemyAttack[]): number => attacks.reduce((sum, attack) => sum + attack.telegraphMs, 0);
  const untuned = (attacks: readonly EnemyAttack[]): number => attacks.reduce((sum, attack) => sum + warningOf(boss, attack.id), 0);
  /** The warnings the engine served in the second half of the fight against the same attacks untuned: under 1 is faster. */
  const pace = (served: readonly EnemyAttack[]): number => total(served.slice(5)) / untuned(served.slice(5));
  const seeds = [3, 41, 977, 20260];
  let weakPace = 0;
  for (const seed of seeds) {
    const strong = fight(0.9, seed);
    const weak = fight(0.3, seed);
    // Nothing is tuned until four attacks have resolved.
    expect(total(strong.served.slice(0, 4)), `seed ${String(seed)}`).toBe(untuned(strong.served.slice(0, 4)));
    expect(total(weak.served.slice(0, 4)), `seed ${String(seed)}`).toBe(untuned(weak.served.slice(0, 4)));
    expect(pace(strong.served), `seed ${String(seed)}`).toBeLessThan(1);
    expect(pace(strong.served), `seed ${String(seed)}`).toBeLessThan(pace(weak.served));
    weakPace += pace(weak.served) / seeds.length;

    const strongNext = tune(boss, strong.stats);
    const weakNext = tune(boss, weak.stats);
    expect(total(strongNext.attacks), `seed ${String(seed)}`).toBeLessThan(total(boss.attacks));
    expect(total(weakNext.attacks), `seed ${String(seed)}`).toBeGreaterThan(total(boss.attacks));
    expect(weakNext.strikeWindowMs, `seed ${String(seed)}`).toBeGreaterThan(strongNext.strikeWindowMs);
  }
  // A 30 percent player can still string a few stops together, so their warnings are judged over all the fights.
  expect(weakPace).toBeGreaterThan(1.02);
});
