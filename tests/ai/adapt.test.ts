// The level adapter: every generated fight is valid content, keeps its stand-in's model-facing fields, and plays to an end.
import { expect, test } from "vitest";
import { fightFromLevel } from "../../src/ai/adapt";
import type { LevelAttack, LevelSpec } from "../../src/ai/contracts";
import { FALLBACK_COUNT, fallbackLevel } from "../../src/ai/fallbacks";
import { startFight, step } from "../../src/combat/engine";
import type { EnemySpec, FightingStyle, MoveDef, Strike } from "../../src/core/types";
import { ENEMIES } from "../../src/enemies/registry";
import { MOVES } from "../../src/moves/registry";
import { STYLES } from "../../src/styles/registry";

// One phrase per handcrafted level, so all five are covered.
const LEVELS = ["thunder storm", "drunk and sloppy", "heavy as a mountain", "fast and precise", "calm and patient"].map(
  (phrase) => fallbackLevel({ phrase, god: "athena", rival_god: "poseidon" }),
);
const storm = fallbackLevel({ phrase: "thunder storm", god: "athena", rival_god: "poseidon" });

/** Every level on its natural stand-in, and forced onto each registered enemy in turn. */
const CASES = LEVELS.flatMap((level) =>
  [ENEMIES, ...ENEMIES.map((enemy) => [enemy])].map((enemies) => ({ level, enemies, fight: fightFromLevel(level, enemies, MOVES) })),
);

const attack = (
  type: LevelAttack["type"],
  direction: LevelAttack["direction"],
  telegraph_ms: number,
  weight: number,
): LevelAttack => ({ type, direction, telegraph_ms, combo: 1, weight });

function enemyNamed(id: string): EnemySpec {
  const enemy = ENEMIES.find((candidate) => candidate.id === id);
  if (!enemy) throw new Error(`${id} is not registered`);
  return enemy;
}

/** The same invariants tests/content.test.ts holds every registered enemy to. */
function expectValidContent(enemy: EnemySpec, moves: ReadonlyMap<string, MoveDef>, label: string): void {
  for (const blow of enemy.attacks) {
    expect(moves.get(blow.counter)?.kind, `${label}/${blow.id}`).toBe("defend");
    expect(blow.weight ?? 1, `${label}/${blow.id} weight`).toBeGreaterThan(0);
  }
  for (const spot of enemy.weakSpots) {
    for (const move of spot.moves) expect(moves.get(move)?.kind, `${label}/${spot.id}/${move}`).toBe("strike");
  }
  const attackIds = enemy.attacks.map((blow) => blow.id);
  expect(new Set(attackIds).size, `${label} attack ids`).toBe(attackIds.length);
  const phases = enemy.phases ?? [];
  expect(phases[0]?.belowHp, label).toBe(1);
  phases.forEach((phase, index) => {
    for (const id of phase.attackIds) expect(attackIds, `${label}/${phase.name}`).toContain(id);
    const before = phases[index - 1];
    if (before) expect(phase.belowHp, `${label}/${phase.name}`).toBeLessThan(before.belowHp);
    expect(phase.belowHp, `${label}/${phase.name}`).toBeGreaterThan(0);
    expect(phase.telegraphScale, `${label}/${phase.name}`).toBeGreaterThan(0);
  });
  if (enemy.finisher !== undefined) expect(moves.get(enemy.finisher)?.kind, `${label} finisher`).toBe("strike");
}

/** Plays one fight as a player who gets `skill` of the prompts right and takes `reactMs` to throw a strike. */
function play(
  enemy: EnemySpec,
  style: FightingStyle,
  seed: number,
  skill: number,
  reactMs: number,
): { seconds: number; outcome: string } {
  let chance = seed;
  const lucky = (): boolean => {
    chance = (Math.imul(chance, 1103515245) + 12345) >>> 0;
    return chance / 4294967296 < skill;
  };
  let state = startFight(enemy, seed);
  let ms = 0;
  let decided = "";
  let good = false;
  let strikeAt = 0;
  const STEP = 20;
  while (state.phase.kind !== "won" && state.phase.kind !== "lost" && ms < 150_000) {
    const phase = state.phase;
    const key = `${phase.kind}:${String(state.seed)}:${String(state.playerHp)}:${String(state.enemyHp)}`;
    if (key !== decided) {
      decided = key;
      good = lucky();
      strikeAt = ms + reactMs;
    }
    const held = new Set<string>();
    const struck: Strike[] = [];
    if (phase.kind === "defend" && good) held.add(phase.attack.counter);
    // The finisher is thrown whenever the engine asks for one.
    if ((phase.kind === "strike" || phase.kind === "finisher") && good && ms >= strikeAt) {
      struck.push({ move: phase.move, quality: 0.7, player: 0 });
    }
    state = step(state, enemy, style, { held, struck }, STEP).state;
    ms += STEP;
  }
  return { seconds: ms / 1000, outcome: state.phase.kind };
}

test("the five fallback levels are five different fights", () => {
  expect(new Set(LEVELS.map((level) => level.title)).size).toBe(FALLBACK_COUNT);
  expect(ENEMIES.length).toBeGreaterThanOrEqual(2);
});

test("every fallback level on every enemy passes the content invariants and stays in playable ranges", () => {
  for (const { level, enemies, fight } of CASES) {
    const label = `${level.title} on ${fight.id} of ${String(enemies.length)}`;
    expectValidContent(fight, MOVES, label);
    expect(fight.phases?.map((phase) => phase.name), label).toEqual(level.phases.map((phase) => phase.name));
    for (const blow of fight.attacks) {
      expect(blow.telegraphMs, `${label}/${blow.id}`).toBeGreaterThanOrEqual(800);
      expect(blow.telegraphMs, `${label}/${blow.id}`).toBeLessThanOrEqual(2400);
      expect(blow.damage, `${label}/${blow.id}`).toBeGreaterThanOrEqual(6);
      expect(blow.damage, `${label}/${blow.id}`).toBeLessThanOrEqual(30);
      expect(blow.weight, `${label}/${blow.id}`).toBeGreaterThanOrEqual(0.05);
      expect(Number.isInteger(blow.telegraphMs) && Number.isInteger(blow.damage), `${label}/${blow.id}`).toBe(true);
    }
    expect(Number.isInteger(fight.hp) && fight.hp > 0, `${label} hp ${String(fight.hp)}`).toBe(true);
    expect(fight.strikeWindowMs, label).toBeGreaterThanOrEqual(1600);
  }
});

test("the stand-in's model-facing fields are untouched and the level's words are used", () => {
  for (const { level, enemies, fight } of CASES) {
    const stand = enemies.find((enemy) => enemy.id === fight.id);
    expect(stand, level.title).toBeDefined();
    if (!stand) continue;
    if (enemies.length === 1) expect(fight.id).toBe(enemies[0]?.id);
    expect(fight.order).toBe(stand.order);
    expect(fight.weakSpots).toBe(stand.weakSpots);
    expect(fight.finisher).toBe(stand.finisher);
    expect(fight.place).toBe(stand.place);
    expect(fight.book).toBe(stand.book);
    expect(fight.name).toBe(level.monster.name);
    expect(fight.title).toBe(level.title);
    expect(fight.taunts).toEqual(level.taunts);
    // Every counter the stand-in already answers keeps the id its 3D model animates.
    for (const blow of fight.attacks) {
      const own = stand.attacks.find((candidate) => candidate.counter === blow.counter);
      expect(blow.id, `${level.title}/${blow.counter}`).toBe(own?.id ?? `gen_${blow.counter}`);
    }
  }
});

test("the stand-in is the enemy with the base's id, else the table's pick, else the first enemy", () => {
  const pick = (base: LevelSpec["monster"]["base"], enemies: readonly EnemySpec[]): string =>
    fightFromLevel({ ...storm, monster: { ...storm.monster, base } }, enemies, MOVES).id;
  expect(pick("cyclops", ENEMIES)).toBe("polyphemus");
  expect(pick("laestrygonian", ENEMIES)).toBe("polyphemus");
  expect(pick("suitor_horde", ENEMIES)).toBe("polyphemus");
  expect(pick("scylla", ENEMIES)).toBe("scylla");
  expect(pick("charybdis", ENEMIES)).toBe("scylla");
  expect(pick("sirens", ENEMIES)).toBe("scylla");
  const sirens: EnemySpec = { ...enemyNamed("scylla"), id: "sirens" };
  expect(pick("sirens", [...ENEMIES, sirens])).toBe("sirens");
  expect(pick("sirens", [enemyNamed("polyphemus")])).toBe("polyphemus");
  // With nothing registered there is still a fight, and it is valid content.
  const bare = fightFromLevel(storm, [], MOVES);
  expectValidContent(bare, MOVES, "no enemies");
  expect(play(bare, { id: "s", name: "S", blurb: "", strikes: ["jab"] }, 5, 1, 0).outcome).toBe("won");
});

test("attacks map by direction, merge on one id with added weights and weight-averaged warnings, and drop feints", () => {
  const level: LevelSpec = {
    ...storm,
    monster: { ...storm.monster, base: "cyclops", speed: 0.9, aggression: 0.2 },
    attack_pool: [
      attack("slam", "high", 1500, 0.6),
      attack("strike", "low", 350, 0.2),
      attack("feint", "high", 350, 1),
      attack("grab", "center", 925, 0),
      attack("sweep", "left", 925, 0.5),
      attack("projectile", "right", 925, 0.5),
    ],
  };
  const polyphemus = enemyNamed("polyphemus");
  const fight = fightFromLevel(level, ENEMIES, MOVES);
  expect(fight.attacks.map((blow) => [blow.id, blow.counter, blow.name])).toEqual([
    ["boulder", "duck", "High slam"],
    ["grab", "block", "Straight grab"],
    ["club_left", "dodge_right", "Left sweep"],
    ["club_right", "dodge_left", "Right throw"],
  ]);
  const [boulder, grab, clubLeft] = fight.attacks;
  // High 1500 at 0.6 and low 350 at 0.2 average 1212.5, which is three quarters of the way from 900 to 2200 at middle speed.
  expect(boulder.weight).toBe(0.8);
  expect(boulder.telegraphMs).toBe(1875);
  // 925 is the middle of the level's range, so the middle of the playable one. A weight of zero is lifted to the floor.
  expect(grab?.telegraphMs).toBe(1550);
  expect(grab?.weight).toBe(0.05);
  // At the lowest aggression a sweep keeps the stand-in's damage; a slam hits harder.
  expect(clubLeft?.damage).toBe(polyphemus.attacks.find((blow) => blow.id === "club_left")?.damage);
  expect(boulder.damage).toBeGreaterThan(polyphemus.attacks.find((blow) => blow.id === "boulder")?.damage ?? 99);

  // A faster, angrier monster warns sooner and hits harder with the same pool.
  const angry = fightFromLevel({ ...level, monster: { ...level.monster, speed: 1.5, aggression: 1 } }, ENEMIES, MOVES);
  expect(angry.attacks[0].telegraphMs).toBeLessThan(boulder.telegraphMs);
  expect(angry.attacks[0].damage).toBeGreaterThan(boulder.damage);
  expect(angry.strikeWindowMs).toBeLessThan(fight.strikeWindowMs);
});

test("low attacks are jumped once the game has a jump, under an id of their own", () => {
  const duck = MOVES.get("duck");
  if (!duck) throw new Error("duck is missing");
  const withJump = new Map<string, MoveDef>([...MOVES, ["jump", { ...duck, id: "jump" }]]);
  const fight = fightFromLevel(storm, ENEMIES, withJump);
  expectValidContent(fight, withJump, "with jump");
  expect(fight.attacks.find((blow) => blow.counter === "jump")?.id).toBe("gen_jump");
  expect(fightFromLevel(storm, ENEMIES, MOVES).attacks.map((blow) => blow.counter)).not.toContain("jump");
});

test("phases start where the fight's clock puts them, speed up with intensity and open with the slower attacks", () => {
  const fight = fightFromLevel(storm, ENEMIES, MOVES);
  const phases = fight.phases ?? [];
  // 22, 26 and 24 seconds: the second phase starts 22/72 in, the third 48/72 in.
  expect(phases.map((phase) => phase.belowHp)).toEqual([1, 0.69, 0.33]);
  expect(phases.map((phase) => phase.telegraphScale)).toEqual([0.97, 0.85, 0.75]);
  const ids = fight.attacks.map((blow) => blow.id);
  expect(phases[1]?.attackIds).toEqual(ids);
  expect(phases[2]?.attackIds).toEqual(ids);
  const openers: readonly string[] = phases[0]?.attackIds ?? [];
  expect(openers.length).toBe(2);
  const warning = (id: string): number => fight.attacks.find((blow) => blow.id === id)?.telegraphMs ?? 0;
  const slowestLeftOut = Math.max(...ids.filter((id) => !openers.includes(id)).map(warning));
  for (const id of openers) expect(warning(id)).toBeGreaterThanOrEqual(slowestLeftOut);

  // Calm to furious covers the whole range, and no phase makes a warning shorter than a body can answer.
  const extremes = fightFromLevel(
    { ...storm, phases: [{ name: "Calm", duration_s: 30, intensity: 0 }, { name: "Fury", duration_s: 30, intensity: 1 }] },
    ENEMIES,
    MOVES,
  );
  expect(extremes.phases?.map((phase) => phase.telegraphScale)).toEqual([1.15, 0.75]);
  for (const { fight: each, level } of CASES) {
    for (const phase of each.phases ?? []) {
      for (const id of phase.attackIds) {
        const blow = each.attacks.find((candidate) => candidate.id === id);
        expect((blow?.telegraphMs ?? 0) * phase.telegraphScale, `${level.title}/${phase.name}/${id}`).toBeGreaterThanOrEqual(800);
      }
    }
  }
});

test("a level made only of feints, or a game with no defend moves, falls back to the stand-in's own attacks", () => {
  for (const level of LEVELS) {
    const feints: LevelSpec = { ...level, attack_pool: level.attack_pool.map((blow) => ({ ...blow, type: "feint" })) };
    for (const enemy of ENEMIES) {
      const fight = fightFromLevel(feints, [enemy], MOVES);
      expect(fight.attacks).toBe(enemy.attacks);
      expectValidContent(fight, MOVES, `feints on ${enemy.id}`);
      for (const style of STYLES) expect(play(fight, style, 11, 1, 0).outcome, `${enemy.id}/${style.id}`).toBe("won");
      expect(play(fight, STYLES[0] ?? { id: "s", name: "S", blurb: "", strikes: ["jab"] }, 11, 0, 0).outcome).toBe("lost");
    }
  }
  const noMoves = fightFromLevel(storm, ENEMIES, new Map());
  expect(noMoves.attacks).toBe(enemyNamed("scylla").attacks);
});

test("odd but well-typed levels never throw and still give valid content", () => {
  const odd: readonly LevelSpec[] = [
    { ...storm, phases: [] },
    { ...storm, attack_pool: [] },
    { ...storm, taunts: [] },
    { ...storm, attack_pool: storm.attack_pool.map((blow) => ({ ...blow, weight: 0 })) },
    { ...storm, attack_pool: storm.attack_pool.map((blow) => ({ ...blow, telegraph_ms: 350 })), monster: { ...storm.monster, speed: 1.5 } },
    { ...storm, phases: Array.from({ length: 4 }, (_, index) => ({ name: `P${String(index)}`, duration_s: 40, intensity: 1 })) },
    { ...storm, phases: Array.from({ length: 150 }, (_, index) => ({ name: `P${String(index)}`, duration_s: 0, intensity: 2 })) },
  ];
  for (const [index, level] of odd.entries()) {
    for (const enemy of ENEMIES) {
      const fight = fightFromLevel(level, [enemy], MOVES);
      expectValidContent(fight, MOVES, `odd ${String(index)} on ${enemy.id}`);
      expect(Number.isFinite(fight.hp) && fight.hp > 0, `odd ${String(index)} hp`).toBe(true);
      for (const blow of fight.attacks) expect(Number.isFinite(blow.telegraphMs), `odd ${String(index)}`).toBe(true);
    }
  }
});

test("through the real engine: a player who does everything right wins inside 150 seconds, an idle one loses", () => {
  for (const { level, fight } of CASES) {
    for (const style of STYLES) {
      for (const seed of [1, 4242, 987_654_321]) {
        const label = `${level.title} on ${fight.id}, ${style.id}, seed ${String(seed)}`;
        const perfect = play(fight, style, seed, 1, 300);
        expect(perfect.outcome, label).toBe("won");
        expect(perfect.seconds, label).toBeLessThan(150);
        expect(play(fight, style, seed, 0, 300).outcome, label).toBe("lost");
      }
    }
  }
});

test("a player who gets most prompts right finishes in roughly the level's own length, and usually wins", () => {
  const boxer = STYLES.find((style) => style.id === "boxer");
  if (!boxer) throw new Error("the Boxer style is missing");
  for (const level of LEVELS) {
    const fight = fightFromLevel(level, ENEMIES, MOVES);
    const planned = level.phases.reduce((sum, phase) => sum + phase.duration_s, 0);
    const fights = Array.from({ length: 30 }, (_, index) => play(fight, boxer, 1000 + index * 7919, 0.85, 800));
    const won = fights.filter((each) => each.outcome === "won");
    const average = won.reduce((sum, each) => sum + each.seconds, 0) / Math.max(won.length, 1);
    const label = `${level.title}: planned ${String(planned)} s, played ${average.toFixed(0)} s, won ${String(won.length)}/30`;
    // Wide on purpose: the plan honours phases and weights, and should hold whether or not the engine does yet.
    expect(average, label).toBeGreaterThanOrEqual(planned * 0.7);
    expect(average, label).toBeLessThanOrEqual(planned * 1.4);
    expect(won.length, label).toBeGreaterThanOrEqual(20);
  }
});
