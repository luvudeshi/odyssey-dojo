// The adaptive difficulty director: what it counts, how it reads the player, and what it may and may not change.
import { expect, test } from "vitest";
import { EMPTY_STATS, observe, skill, tune } from "../../src/ai/director";
import type { DirectorStats } from "../../src/ai/director";
import { startFight, step } from "../../src/combat/engine";
import type { CombatEvent, EnemyAttack, EnemySpec, FightingStyle, Strike } from "../../src/core/types";

const boss: EnemySpec = {
  id: "boss", name: "Boss", title: "", order: 0, hp: 1000, strikeWindowMs: 2000,
  attacks: [
    { id: "swing", name: "Swing", telegraphMs: 1500, damage: 5, counter: "block" },
    { id: "lunge", name: "Lunge", telegraphMs: 1400, damage: 5, counter: "duck", weight: 2 },
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
  expect(stats.defences).toEqual({ block: { defended: 1, hit: 1 }, duck: { defended: 1, hit: 2 } });
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

test("a strong player gets shorter warnings, never below 800 ms in the fastest phase", () => {
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
      expect(Math.round((attack?.telegraphMs ?? 0) * phase.telegraphScale), `${phase.name}/${id}`).toBeGreaterThanOrEqual(800);
    }
  }
  expect(tuned.strikeWindowMs).toBe(boss.strikeWindowMs);
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
  const stats = observe(EMPTY_STATS, events);
  expect(tune(boss, stats)).toBe(tune(boss, stats));
});

/** Ten exchanges against the real engine as a player who defends `rate` of the attacks, with the director in the loop. */
function fight(rate: number, seed: number): DirectorStats {
  let chance = seed;
  const lucky = (): boolean => {
    chance = (Math.imul(chance, 1103515245) + 12345) >>> 0;
    return chance / 4294967296 < rate;
  };
  let state = startFight(boss, seed);
  let stats = EMPTY_STATS;
  let good = false;
  let exchanges = 0;
  for (let frame = 0; frame < 100_000 && exchanges < 10; frame++) {
    const phase = state.phase;
    if (phase.kind === "defend" && phase.msLeft === phase.totalMs) good = lucky();
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
  return stats;
}

test("with the real engine, a player who defends 90 percent faces shorter warnings than one who defends 30 percent", () => {
  const total = (enemy: EnemySpec): number => warnings(enemy).reduce((sum, ms) => sum + ms, 0);
  for (const seed of [3, 41, 977, 20260]) {
    const strong = tune(boss, fight(0.9, seed));
    const weak = tune(boss, fight(0.3, seed));
    expect(total(strong), `seed ${String(seed)}`).toBeLessThan(total(boss));
    expect(total(weak), `seed ${String(seed)}`).toBeGreaterThan(total(boss));
    expect(weak.strikeWindowMs, `seed ${String(seed)}`).toBeGreaterThan(strong.strikeWindowMs);
  }
});
