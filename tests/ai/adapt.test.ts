// The level adapter: every generated fight is valid content, keeps its stand-in's model-facing fields, and plays to an end.
import { expect, test } from "vitest";
import { fightFromLevel } from "../../src/ai/adapt";
import { ATTACK_TYPES, DIRECTIONS, LevelSpecSchema, MONSTER_BASES } from "../../src/ai/contracts";
import type { LevelAttack, LevelSpec } from "../../src/ai/contracts";
import { FALLBACK_COUNT, fallbackLevel } from "../../src/ai/fallbacks";
import { PLAYER_HP, startFight, step } from "../../src/combat/engine";
import type { EnemySpec, FightingStyle, MoveDef, Strike } from "../../src/core/types";
import { ENEMIES } from "../../src/enemies/registry";
import { MOVES } from "../../src/moves/registry";
import { STYLES } from "../../src/styles/registry";

// Taken before any fight is built, to show the adapter leaves the registered enemies alone.
const REGISTERED = JSON.stringify(ENEMIES);

// One phrase per handcrafted level, so all five are covered.
const LEVELS = ["thunder storm", "drunk and sloppy", "heavy as a mountain", "fast and precise", "calm and patient"].map(
  (phrase) => fallbackLevel({ phrase, god: "athena", rival_god: "poseidon" }),
);
const storm = fallbackLevel({ phrase: "thunder storm", god: "athena", rival_god: "poseidon" });

/** The game's moves without the jump, as they were before it landed: low blows are ducked there. */
const NO_JUMP: ReadonlyMap<string, MoveDef> = new Map([...MOVES].filter(([id]) => id !== "jump"));

function enemyNamed(id: string): EnemySpec {
  const enemy = ENEMIES.find((candidate) => candidate.id === id);
  if (!enemy) throw new Error(`${id} is not registered`);
  return enemy;
}

/**
 * Polyphemus with numbers written down here, so the tests that expect exact values do not move when he is retuned.
 * These are his numbers on main when this file was written.
 */
const CYCLOPS: EnemySpec = {
  ...enemyNamed("polyphemus"),
  hp: 400,
  strikeWindowMs: 2600,
  attacks: [
    { id: "club_left", name: "Club swing", telegraphMs: 1800, damage: 7, counter: "dodge_right" },
    { id: "club_right", name: "Club swing", telegraphMs: 1800, damage: 7, counter: "dodge_left" },
    { id: "grab", name: "Grasping hand", telegraphMs: 1700, damage: 8, counter: "block" },
    { id: "boulder", name: "Boulder throw", telegraphMs: 2000, damage: 10, counter: "duck" },
  ],
};

/** The same enemy as PR #135 retunes him: every blow at or below the adapter's usual damage floor of 6. */
const SOFT_CYCLOPS: EnemySpec = {
  ...CYCLOPS,
  hp: 162,
  attacks: [
    { id: "club_left", name: "Club swing", telegraphMs: 1800, damage: 5, counter: "dodge_right" },
    { id: "club_right", name: "Club swing", telegraphMs: 1800, damage: 5, counter: "dodge_left" },
    { id: "grab", name: "Grasping hand", telegraphMs: 1700, damage: 4, counter: "block" },
    { id: "boulder", name: "Boulder throw", telegraphMs: 2000, damage: 6, counter: "duck" },
  ],
};

/** The registered enemies together, each one alone, and the softly tuned Polyphemus alone. */
const ENEMY_LISTS: readonly (readonly EnemySpec[])[] = [ENEMIES, ...ENEMIES.map((enemy) => [enemy]), [SOFT_CYCLOPS]];

/** Every level on its natural stand-in, and forced onto each enemy in turn. */
const CASES = LEVELS.flatMap((level) =>
  ENEMY_LISTS.map((enemies) => ({ level, enemies, fight: fightFromLevel(level, enemies, MOVES) })),
);

const attack = (
  type: LevelAttack["type"],
  direction: LevelAttack["direction"],
  telegraph_ms: number,
  weight: number,
): LevelAttack => ({ type, direction, telegraph_ms, combo: 1, weight });

/** The task's stand-in table, written out again here so a wrong pick in the adapter shows. */
const STAND_INS: Readonly<Record<LevelSpec["monster"]["base"], string>> = {
  cyclops: "polyphemus",
  laestrygonian: "polyphemus",
  scylla: "scylla",
  charybdis: "scylla",
  sirens: "scylla",
  suitor_horde: "suitors",
};

function expectedStandIn(level: LevelSpec, enemies: readonly EnemySpec[]): EnemySpec | undefined {
  return (
    enemies.find((enemy) => enemy.id === level.monster.base) ??
    enemies.find((enemy) => enemy.id === STAND_INS[level.monster.base]) ??
    enemies[0]
  );
}

/** The side the player is told a blow comes from, by the defence that answers it. */
const SIDE_OF_COUNTER: Readonly<Record<string, string>> = {
  dodge_right: "Left",
  dodge_left: "Right",
  duck: "High",
  block: "Straight",
  jump: "Low",
};

/** The defence that answers a blow from each side, written out again here. */
const COUNTER_OF_SIDE: Readonly<Record<LevelAttack["direction"], string>> = {
  left: "dodge_right",
  right: "dodge_left",
  high: "duck",
  center: "block",
  low: "jump",
};

/** The stand-in's attack this one was handed over or filled in from: the same id, name, warning and defence. */
function ownAttack(blow: EnemySpec["attacks"][number], stand: EnemySpec): EnemySpec["attacks"][number] | undefined {
  return stand.attacks.find(
    (own) => own.id === blow.id && own.name === blow.name && own.telegraphMs === blow.telegraphMs && own.counter === blow.counter,
  );
}

/** The lowest damage a blow may have on this stand-in: 6, or its own lightest blow when that is lower. */
function damageFloor(stand: EnemySpec): number {
  return Math.min(6, ...stand.attacks.map((blow) => blow.damage));
}

/**
 * How many different defences the adapter promises on this stand-in: three, or fewer when the level's sides and the
 * stand-in's own attacks do not reach three between them.
 */
function promisedDefences(level: LevelSpec, stand: EnemySpec, moves: ReadonlyMap<string, MoveDef>): number {
  const defends = (id: string): boolean => moves.get(id)?.kind === "defend";
  const fromLevel = level.attack_pool
    .filter((blow) => blow.type !== "feint")
    .map((blow) => (blow.direction === "low" && !defends("jump") ? "duck" : COUNTER_OF_SIDE[blow.direction]));
  return Math.min(3, new Set([...fromLevel, ...stand.attacks.map((blow) => blow.counter)].filter(defends)).size);
}

/** A level whose real attacks all come from the given sides, plus one feint. */
function levelFrom(directions: readonly [LevelAttack["direction"], ...LevelAttack["direction"][]]): LevelSpec {
  return {
    ...storm,
    attack_pool: [
      ...Array.from({ length: 6 }, (_, index) => attack("slam", directions[index % directions.length] ?? directions[0], 900, 0.5)),
      attack("feint", "left", 700, 1),
    ],
  };
}

/** A stream of repeatable numbers, each 0 or more and below 1. */
function dice(seed: number): () => number {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** A random level that passes the schema. One in three attacks from a single side, one in three from two. */
function randomLevel(seed: number): LevelSpec {
  const next = dice(seed);
  const between = (low: number, high: number): number => low + next() * (high - low);
  const oneOf = <T,>(items: readonly [T, ...T[]]): T => items[Math.floor(next() * items.length)] ?? items[0];
  const sides = Math.floor(next() * 3);
  const allowed: readonly [LevelAttack["direction"], ...LevelAttack["direction"][]] =
    sides === 0 ? [oneOf(DIRECTIONS)] : sides === 1 ? [oneOf(DIRECTIONS), oneOf(DIRECTIONS)] : DIRECTIONS;
  return LevelSpecSchema.parse({
    ...storm,
    monster: { ...storm.monster, base: oneOf(MONSTER_BASES), speed: between(0.3, 1.5), aggression: between(0.2, 1) },
    attack_pool: Array.from({ length: 6 + Math.floor(next() * 7) }, () => ({
      type: oneOf(ATTACK_TYPES),
      direction: oneOf(allowed),
      telegraph_ms: between(350, 1500),
      combo: 1 + Math.floor(next() * 4),
      weight: next() < 0.1 ? 0 : next(),
    })),
    phases: Array.from({ length: 2 + Math.floor(next() * 3) }, (_, index) => ({
      name: `Phase ${String(index)}`,
      duration_s: between(15, 40),
      intensity: next(),
    })),
  });
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

/**
 * Numbers a body can answer and the HUD can show. The ranges are held on the attacks the adapter made. An attack it
 * took from the stand-in keeps the stand-in's own warning, and its damage may only have been lowered.
 */
function expectPlayableRanges(fight: EnemySpec, stand: EnemySpec, label: string): void {
  for (const blow of fight.attacks) {
    const own = ownAttack(blow, stand);
    if (own) {
      expect(blow.damage, `${label}/${blow.id} is the stand-in's own`).toBeLessThanOrEqual(own.damage);
    } else {
      expect(blow.telegraphMs, `${label}/${blow.id}`).toBeGreaterThanOrEqual(800);
      expect(blow.telegraphMs, `${label}/${blow.id}`).toBeLessThanOrEqual(2400);
      expect(blow.damage, `${label}/${blow.id}`).toBeLessThanOrEqual(30);
      expect(Number.isInteger(blow.telegraphMs) && Number.isInteger(blow.damage), `${label}/${blow.id}`).toBe(true);
    }
    expect(blow.damage, `${label}/${blow.id}`).toBeGreaterThanOrEqual(damageFloor(stand));
    expect(blow.weight ?? 1, `${label}/${blow.id}`).toBeGreaterThanOrEqual(0.05);
    // No phase makes a warning shorter than a body can answer, unless the stand-in's own attack already was.
    for (const phase of fight.phases ?? []) {
      if (!phase.attackIds.includes(blow.id)) continue;
      const least = own ? Math.min(800, own.telegraphMs) : 800;
      expect(blow.telegraphMs * phase.telegraphScale, `${label}/${phase.name}/${blow.id}`).toBeGreaterThanOrEqual(least);
    }
  }
  expect(Number.isInteger(fight.hp) && fight.hp > 0, `${label} hp ${String(fight.hp)}`).toBe(true);
  expect(fight.strikeWindowMs, label).toBeGreaterThanOrEqual(1600);
}

/** The stand-in's own attacks, in its order and unchanged but for damage, which may only have been softened. */
function expectStandInAttacks(fight: EnemySpec, stand: EnemySpec, label: string): void {
  const withoutDamage = (blow: EnemySpec["attacks"][number]): object => ({ ...blow, damage: 0 });
  expect(fight.attacks.map(withoutDamage), label).toEqual(stand.attacks.map(withoutDamage));
  fight.attacks.forEach((blow, index) => {
    expect(blow.damage, `${label}/${blow.id}`).toBeLessThanOrEqual(stand.attacks[index]?.damage ?? 0);
    expect(blow.damage, `${label}/${blow.id}`).toBeGreaterThanOrEqual(damageFloor(stand));
  });
}

/**
 * Plays one fight as a player who gets `skill` of the prompts right and takes `reactMs` to throw a strike.
 * With `onePose`, the player holds that one defence against every attack instead of reading the prompt.
 */
function play(
  enemy: EnemySpec,
  style: FightingStyle,
  seed: number,
  skill: number,
  reactMs: number,
  onePose = "",
): { seconds: number; outcome: string; playerHp: number } {
  let chance = seed;
  const lucky = (): boolean => {
    chance = (Math.imul(chance, 1103515245) + 12345) >>> 0;
    return chance / 4294967296 < skill;
  };
  let state = startFight(enemy, seed);
  let ms = 0;
  let decided = "";
  let clock = 0;
  let good = false;
  let strikeAt = 0;
  const STEP = 20;
  while (state.phase.kind !== "won" && state.phase.kind !== "lost" && ms < 150_000) {
    const phase = state.phase;
    const key = `${phase.kind}:${String(state.seed)}:${String(state.playerHp)}:${String(state.enemyHp)}`;
    const left = "msLeft" in phase ? phase.msLeft : 0;
    // A new prompt is a new beat, or the same beat with its clock wound back: a missed finisher is offered again.
    if (key !== decided || left > clock) {
      decided = key;
      good = lucky();
      strikeAt = ms + reactMs;
    }
    clock = left;
    const held = new Set<string>();
    const struck: Strike[] = [];
    if (onePose !== "") held.add(onePose);
    else if (phase.kind === "defend" && good) held.add(phase.attack.counter);
    // The finisher is thrown whenever the engine asks for one.
    if ((phase.kind === "strike" || phase.kind === "finisher") && good && ms >= strikeAt) {
      struck.push({ move: phase.move, quality: 0.7, player: 0 });
    }
    state = step(state, enemy, style, { held, struck }, STEP).state;
    ms += STEP;
  }
  return { seconds: ms / 1000, outcome: state.phase.kind, playerHp: state.playerHp };
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
    const stand = expectedStandIn(level, enemies);
    expect(stand, label).toBeDefined();
    if (stand) expectPlayableRanges(fight, stand, label);
  }
});

test("the stand-in's model-facing fields are untouched and the level's words are used", () => {
  for (const { level, enemies, fight } of CASES) {
    const stand = expectedStandIn(level, enemies);
    expect(stand, level.title).toBeDefined();
    if (!stand) continue;
    expect(fight.id, level.title).toBe(stand.id);
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
  expect(pick("suitor_horde", ENEMIES)).toBe("suitors");
  expect(pick("scylla", ENEMIES)).toBe("scylla");
  // Charybdis and the Sirens are registered under their own ids, so they play themselves.
  expect(pick("charybdis", ENEMIES)).toBe("charybdis");
  expect(pick("sirens", ENEMIES)).toBe("sirens");
  // Without them the table's pick stands in, and without that the first enemy does.
  const without = (...ids: string[]): EnemySpec[] => ENEMIES.filter((enemy) => !ids.includes(enemy.id));
  expect(pick("charybdis", without("charybdis"))).toBe("scylla");
  expect(pick("sirens", without("sirens"))).toBe("scylla");
  expect(pick("sirens", without("sirens", "scylla"))).toBe(without("sirens", "scylla")[0]?.id);
  expect(pick("suitor_horde", without("suitors"))).toBe(without("suitors")[0]?.id);
  expect(pick("sirens", [enemyNamed("circe")])).toBe("circe");
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
  // The low strike is jumped, under an id of its own: Polyphemus has no attack that is jumped.
  const jumped = fightFromLevel(level, [CYCLOPS], MOVES);
  expect(jumped.attacks.map((blow) => [blow.id, blow.counter, blow.name, blow.weight, blow.telegraphMs])).toEqual([
    ["boulder", "duck", "High slam", 0.6, 2200],
    ["gen_jump", "jump", "Low strike", 0.2, 900],
    ["grab", "block", "Straight grab", 0.05, 1550],
    ["club_left", "dodge_right", "Left sweep", 0.5, 1550],
    ["club_right", "dodge_left", "Right throw", 0.5, 1550],
  ]);

  // In a game with no jump the low strike is ducked, so it merges with the high slam.
  const fight = fightFromLevel(level, [CYCLOPS], NO_JUMP);
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
  // At the lowest aggression a sweep keeps the stand-in's damage of 7; a slam hits a tenth harder than its 10.
  expect(clubLeft?.damage).toBe(7);
  expect(boulder.damage).toBe(11);

  // A faster, angrier monster warns sooner and hits harder with the same pool.
  const angry = fightFromLevel({ ...level, monster: { ...level.monster, speed: 1.5, aggression: 1 } }, [CYCLOPS], NO_JUMP);
  expect(angry.attacks[0].telegraphMs).toBeLessThan(boulder.telegraphMs);
  expect(angry.attacks[0].damage).toBeGreaterThan(boulder.damage);
  expect(angry.strikeWindowMs).toBeLessThan(fight.strikeWindowMs);
});

test("low attacks are jumped, under an id of their own, and ducked in a game with no jump", () => {
  expect(MOVES.get("jump")?.kind).toBe("defend");
  const fight = fightFromLevel(storm, ENEMIES, MOVES);
  expectValidContent(fight, MOVES, "with jump");
  expect(fight.attacks.find((blow) => blow.counter === "jump")?.id).toBe("gen_jump");
  const ducked = fightFromLevel(storm, ENEMIES, NO_JUMP);
  expectValidContent(ducked, NO_JUMP, "without jump");
  expect(ducked.attacks.map((blow) => blow.counter)).not.toContain("jump");
  expect(ducked.attacks.length).toBe(fight.attacks.length - 1);
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
  // Five defences now that low blows are jumped, so the slower three open the fight.
  expect(ids.length).toBe(5);
  const openers: readonly string[] = phases[0]?.attackIds ?? [];
  expect(openers.length).toBe(3);
  const warning = (id: string): number => fight.attacks.find((blow) => blow.id === id)?.telegraphMs ?? 0;
  const slowestLeftOut = Math.max(...ids.filter((id) => !openers.includes(id)).map(warning));
  for (const id of openers) expect(warning(id)).toBeGreaterThanOrEqual(slowestLeftOut);

  // Calm to furious covers the whole range.
  const extremes = fightFromLevel(
    { ...storm, phases: [{ name: "Calm", duration_s: 30, intensity: 0 }, { name: "Fury", duration_s: 30, intensity: 1 }] },
    ENEMIES,
    MOVES,
  );
  expect(extremes.phases?.map((phase) => phase.telegraphScale)).toEqual([1.15, 0.75]);
});

test("a level made only of feints, or a game with no defend moves, falls back to the stand-in's own attacks", () => {
  for (const level of LEVELS) {
    const feints: LevelSpec = { ...level, attack_pool: level.attack_pool.map((blow) => ({ ...blow, type: "feint" })) };
    for (const enemy of [...ENEMIES, SOFT_CYCLOPS]) {
      const fight = fightFromLevel(feints, [enemy], MOVES);
      expectStandInAttacks(fight, enemy, `feints on ${enemy.id}`);
      expectValidContent(fight, MOVES, `feints on ${enemy.id}`);
      for (const style of STYLES) expect(play(fight, style, 11, 1, 0).outcome, `${enemy.id}/${style.id}`).toBe("won");
      expect(play(fight, STYLES[0] ?? { id: "s", name: "S", blurb: "", strikes: ["jab"] }, 11, 0, 0).outcome).toBe("lost");
    }
  }
  const noMoves = fightFromLevel(storm, ENEMIES, new Map());
  expectStandInAttacks(noMoves, enemyNamed("scylla"), "no moves");
  // These blows are light enough for the longer fight, so they are handed over as they are.
  const cyclops: LevelSpec = { ...storm, monster: { ...storm.monster, base: "cyclops" }, attack_pool: [] };
  expect(fightFromLevel(cyclops, [CYCLOPS], MOVES).attacks).toBe(CYCLOPS.attacks);
  expect(fightFromLevel(cyclops, [SOFT_CYCLOPS], MOVES).attacks).toBe(SOFT_CYCLOPS.attacks);
});

test("an attack is named for the side its defence answers: a low blow that has to be ducked reads as a high one", () => {
  for (const { level, fight } of CASES) {
    for (const blow of fight.attacks) {
      expect(blow.name.split(" ")[0], `${level.title}/${blow.id}`).toBe(SIDE_OF_COUNTER[blow.counter]);
    }
  }
  // The Charybdis level's heaviest low attack is a grab. It is jumped and keeps its own name, on Charybdis herself.
  const tide = fallbackLevel({ phrase: "calm and patient", god: "athena", rival_god: "poseidon" });
  const tideFight = fightFromLevel(tide, ENEMIES, MOVES);
  expect(tideFight.id).toBe("charybdis");
  const names = (fight: EnemySpec, counter: string): unknown[] =>
    fight.attacks.filter((blow) => blow.counter === counter).map((blow) => [blow.id, blow.name]);
  expect(names(tideFight, "jump")).toEqual([["gen_jump", "Low grab"]]);
  expect(names(tideFight, "duck")).toEqual([["spout", "High throw"]]);
  const jumped = fightFromLevel(levelFrom(["low"]), ENEMIES, MOVES).attacks[0];
  expect([jumped.counter, jumped.name]).toEqual(["jump", "Low slam"]);
  // In a game with no jump the same blows are ducked. They used to be shown as "Low grab incoming" over a DUCK prompt.
  expect(names(fightFromLevel(tide, ENEMIES, NO_JUMP), "duck")).toEqual([["spout", "High grab"]]);
  const onlyLow = fightFromLevel(levelFrom(["low"]), ENEMIES, NO_JUMP).attacks[0];
  expect([onlyLow.counter, onlyLow.name]).toEqual(["duck", "High slam"]);
});

test("a level that attacks from one or two sides is filled in with the stand-in's own attacks, so no single pose wins untouched", () => {
  const style = STYLES[0] ?? { id: "s", name: "S", blurb: "", strikes: ["jab"] };
  // With the jump, and in a game without it, where a low blow counts as a high one.
  const games = [
    { moves: MOVES, game: "jump", lowIs: "low" },
    { moves: NO_JUMP, game: "no jump", lowIs: "high" },
  ] as const;
  const sides = [["center"], ["low"], ["left"], ["left", "right"], ["high", "low"]] as const;
  for (const { moves, game, lowIs, directions } of games.flatMap((each) => sides.map((directions) => ({ ...each, directions })))) {
    for (const enemy of [...ENEMIES, SOFT_CYCLOPS]) {
      const label = `${directions.join("+")} on ${enemy.id}, ${game}`;
      const fight = fightFromLevel(levelFrom(directions), [enemy], moves);
      expectValidContent(fight, moves, label);
      expectPlayableRanges(fight, enemy, label);
      // Three on every enemy today. An enemy with fewer defences of its own gives what it has.
      const defences = new Set(fight.attacks.map((blow) => blow.counter)).size;
      expect(defences, label).toBe(promisedDefences(levelFrom(directions), enemy, moves));

      // The level's own attacks come first, under their generated names; the rest are the stand-in's, as it has them.
      const own = fight.attacks.filter((blow) => blow.name.endsWith(" slam"));
      const filled = fight.attacks.filter((blow) => !own.includes(blow));
      expect(fight.attacks, label).toEqual([...own, ...filled]);
      expect(own.length, label).toBe(new Set(directions.map((side) => (side === "low" ? lowIs : side))).size);
      const ownWeight = own.reduce((sum, blow) => sum + (blow.weight ?? 1), 0);
      expect(ownWeight, label).toBeCloseTo(3);
      for (const blow of filled) {
        const original = enemy.attacks.find((candidate) => candidate.id === blow.id);
        expect({ ...blow, damage: 0, weight: 0 }, `${label}/${blow.id}`).toEqual({ ...original, damage: 0, weight: 0 });
        expect(blow.damage, `${label}/${blow.id}`).toBeLessThanOrEqual(original?.damage ?? 0);
        // Often enough to matter: about one prompt in seven or eight each.
        expect(blow.weight, `${label}/${blow.id}`).toBe(0.45);
      }
      // The level's own attacks open the fight even when the filled-in ones warn for longer.
      const openers: readonly string[] = fight.phases?.[0]?.attackIds ?? [];
      expect(openers.length, label).toBe(Math.min(2, fight.attacks.length));
      for (const blow of own.slice(0, 2)) expect(openers, label).toContain(blow.id);

      for (const seed of [3, 77, 2024]) {
        expect(play(fight, style, seed, 1, 300).outcome, label).toBe("won");
        expect(play(fight, style, seed, 0, 300).outcome, label).toBe("lost");
        // One pose cannot answer two defences. With a single defence there is nothing else to be hit by.
        if (defences < 2) continue;
        for (const blow of fight.attacks) {
          expect(play(fight, style, seed, 1, 300, blow.counter).playerHp, `${label} holding ${blow.counter}`).toBeLessThan(PLAYER_HP);
        }
      }
    }
  }
  // A stand-in with nothing to add is left with what the level gave: still valid, still one defence.
  const lonely: EnemySpec = { ...enemyNamed("scylla"), attacks: [{ id: "bite", name: "Bite", telegraphMs: 1200, damage: 9, counter: "block" }] };
  const thin = fightFromLevel(levelFrom(["center"]), [lonely], MOVES);
  expectValidContent(thin, MOVES, "lonely");
  expect(thin.attacks.map((blow) => blow.id)).toEqual(["bite"]);
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

test("400 random schema-valid levels on every enemy never throw, give valid content and need three defences", () => {
  const style = STYLES[0] ?? { id: "s", name: "S", blurb: "", strikes: ["jab"] };
  for (let seed = 1; seed <= 400; seed++) {
    const level = randomLevel(seed);
    for (const enemies of ENEMY_LISTS) {
      const label = `random ${String(seed)} of ${String(enemies.length)}`;
      const fight = fightFromLevel(level, enemies, MOVES);
      const stand = expectedStandIn(level, enemies);
      expect(stand, label).toBeDefined();
      if (!stand) continue;
      expect(fight.id, label).toBe(stand.id);
      expectValidContent(fight, MOVES, label);
      expectPlayableRanges(fight, stand, label);
      const defences = new Set(fight.attacks.map((blow) => blow.counter)).size;
      expect(defences, label).toBeGreaterThanOrEqual(promisedDefences(level, stand, MOVES));
      expect(fight.phases?.length, label).toBe(level.phases.length);
      if (seed % 20 !== 0) continue;
      const perfect = play(fight, style, seed, 1, 300);
      expect([perfect.outcome, perfect.seconds < 150], label).toEqual(["won", true]);
      expect(play(fight, style, seed, 0, 300).outcome, label).toBe("lost");
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

test("a player who gets most prompts right finishes in roughly the level's own length and wins, on every enemy", () => {
  const boxer = STYLES.find((style) => style.id === "boxer");
  if (!boxer) throw new Error("the Boxer style is missing");
  for (const { level, enemies, fight } of CASES) {
    const planned = level.phases.reduce((sum, phase) => sum + phase.duration_s, 0);
    const fights = Array.from({ length: 30 }, (_, index) => play(fight, boxer, 1000 + index * 7919, 0.85, 800));
    const won = fights.filter((each) => each.outcome === "won").length;
    const average = fights.reduce((sum, each) => sum + each.seconds, 0) / fights.length;
    const healthLeft = fights.reduce((sum, each) => sum + each.playerHp, 0) / fights.length;
    const label =
      `${level.title} on ${fight.id} of ${String(enemies.length)}: planned ${String(planned)} s, ` +
      `played ${average.toFixed(0)} s, won ${String(won)}/30, health left ${healthLeft.toFixed(0)}`;
    // The engine scales strike damage by quality, which the plan leaves out: at this player's 0.7 the fights run 5 to 10
    // percent short of the plan.
    expect(average, label).toBeGreaterThanOrEqual(planned * 0.8);
    expect(average, label).toBeLessThanOrEqual(planned * 1.25);
    // The monster's damage is budgeted for the longer fight, so the same level is survivable on every registered enemy.
    expect(won, label).toBeGreaterThanOrEqual(27);
    expect(healthLeft, label).toBeGreaterThanOrEqual(50);
  }
});

test("a stand-in whose blows are lighter than 6 keeps them: nothing is lifted above its own tuning", () => {
  const style = STYLES[0] ?? { id: "s", name: "S", blurb: "", strikes: ["jab"] };
  const calm = { ...storm.monster, base: "cyclops", speed: 0.9, aggression: 0.2 } as const;
  // At the lowest aggression a sweep, a throw and a grab do the stand-in's own 5, 5 and 4. They used to be lifted to 6.
  const level: LevelSpec = {
    ...storm,
    monster: calm,
    attack_pool: [
      attack("sweep", "left", 925, 0.5),
      attack("projectile", "right", 925, 0.5),
      attack("grab", "center", 925, 0.5),
      attack("strike", "high", 925, 0.5),
    ],
  };
  const fight = fightFromLevel(level, [SOFT_CYCLOPS], MOVES);
  expect(fight.attacks.map((blow) => [blow.id, blow.damage])).toEqual([
    ["club_left", 5],
    ["club_right", 5],
    ["grab", 4],
    // A strike does nine tenths of the boulder's 6.
    ["boulder", 5],
  ]);
  // On the stand-in as main has it the same level is unchanged by the lower floor: 7, 7, 9 and 9.
  expect(fightFromLevel(level, [CYCLOPS], MOVES).attacks.map((blow) => blow.damage)).toEqual([7, 7, 9, 9]);

  // An attack filled in from the stand-in keeps its own damage too.
  const filled = fightFromLevel(levelFrom(["center"]), [SOFT_CYCLOPS], MOVES);
  expect(filled.attacks.slice(1).map((blow) => [blow.id, blow.damage])).toEqual([
    ["club_left", 5],
    ["club_right", 5],
  ]);

  // Softening only ever lowers a blow. This stand-in is heavy enough to be softened, and has one blow under the floor.
  const mixed: EnemySpec = {
    ...CYCLOPS,
    attacks: [
      { id: "club_left", name: "Club swing", telegraphMs: 1800, damage: 30, counter: "dodge_right" },
      { id: "club_right", name: "Club swing", telegraphMs: 1800, damage: 30, counter: "dodge_left" },
      { id: "grab", name: "Grasping hand", telegraphMs: 1700, damage: 3, counter: "block" },
      { id: "boulder", name: "Boulder throw", telegraphMs: 2000, damage: 30, counter: "duck" },
    ],
  };
  const softenedFight = fightFromLevel({ ...storm, attack_pool: [] }, [mixed], MOVES);
  expect(softenedFight.attacks.map((blow) => blow.id)).toEqual(mixed.attacks.map((blow) => blow.id));
  expect(softenedFight.attacks[0].damage).toBeLessThan(30);
  expect(softenedFight.attacks[2]?.damage).toBe(3);

  // Every fallback level on the soft stand-in is still a fight: it can be won, and standing still loses it.
  for (const each of LEVELS) {
    const soft = fightFromLevel(each, [SOFT_CYCLOPS], MOVES);
    expectPlayableRanges(soft, SOFT_CYCLOPS, `${each.title} on the soft stand-in`);
    for (const blow of soft.attacks) expect(blow.damage, `${each.title}/${blow.id}`).toBeGreaterThanOrEqual(4);
    expect(play(soft, style, 7, 1, 300).outcome, each.title).toBe("won");
    expect(play(soft, style, 7, 0, 300).outcome, each.title).toBe("lost");
  }
});

test("a level that skipped the schema (NaN, Infinity, 1e308, an unknown attack) still gives a fight that ends", () => {
  const style = STYLES[0] ?? { id: "s", name: "S", blurb: "", strikes: ["jab"] };
  const monster = (change: Partial<LevelSpec["monster"]>): LevelSpec => ({ ...storm, monster: { ...storm.monster, ...change } });
  const attacks = (change: Partial<LevelAttack>): LevelSpec => ({
    ...storm,
    attack_pool: storm.attack_pool.map((blow) => ({ ...blow, ...change })),
  });
  const phases = (change: Partial<LevelSpec["phases"][number]>): LevelSpec => ({
    ...storm,
    phases: storm.phases.map((phase) => ({ ...phase, ...change })),
  });
  // What a parsed level can never hold, but a level built by hand or read from storage could.
  const [unknown = ""] = "whirlwind".split(" ");
  const broken: readonly (readonly [string, LevelSpec])[] = [
    ["speed NaN", monster({ speed: Number.NaN })],
    ["aggression NaN", monster({ aggression: Number.NaN })],
    ["telegraph_ms NaN", attacks({ telegraph_ms: Number.NaN })],
    ["weight NaN", attacks({ weight: Number.NaN })],
    ["weight Infinity", attacks({ weight: Number.POSITIVE_INFINITY })],
    ["weight 1e308", attacks({ weight: 1e308 })],
    ["weight -Infinity", attacks({ weight: Number.NEGATIVE_INFINITY })],
    ["duration_s NaN", phases({ duration_s: Number.NaN })],
    ["duration_s Infinity", phases({ duration_s: Number.POSITIVE_INFINITY })],
    ["duration_s 1e308", phases({ duration_s: 1e308 })],
    ["intensity NaN", phases({ intensity: Number.NaN })],
    ["unknown attack type", attacks({ type: unknown as LevelAttack["type"] })],
    ["unknown direction", attacks({ direction: unknown as LevelAttack["direction"] })],
    ["one unknown attack type among good ones", { ...storm, attack_pool: [...storm.attack_pool, { ...attack("slam", "left", 900, 1), type: unknown as LevelAttack["type"] }] }],
  ];
  for (const [what, level] of broken) {
    for (const enemies of ENEMY_LISTS) {
      const label = `${what} of ${String(enemies.length)}`;
      const stand = expectedStandIn(level, enemies);
      expect(stand, label).toBeDefined();
      if (!stand) continue;
      const fight = fightFromLevel(level, enemies, MOVES);
      expectValidContent(fight, MOVES, label);
      expectPlayableRanges(fight, stand, label);
      for (const phase of fight.phases ?? []) {
        expect(Number.isFinite(phase.belowHp) && Number.isFinite(phase.telegraphScale), `${label}/${phase.name}`).toBe(true);
      }
      const perfect = play(fight, style, 31, 1, 300);
      expect([perfect.outcome, perfect.seconds < 150], label).toEqual(["won", true]);
      expect(play(fight, style, 31, 0, 300).outcome, label).toBe("lost");
    }
  }
  // A level with every attack unknown plays as one with no attacks: the stand-in's own.
  const none = fightFromLevel(attacks({ type: unknown as LevelAttack["type"] }), [CYCLOPS], MOVES);
  expect(none.attacks).toEqual(fightFromLevel({ ...storm, attack_pool: [] }, [CYCLOPS], MOVES).attacks);
});

test("the fight is paced for 60 to 90 seconds whatever the phases add up to", () => {
  const lasting = (count: number, seconds: number): EnemySpec =>
    fightFromLevel(
      { ...storm, phases: Array.from({ length: count }, (_, index) => ({ name: `P${String(index)}`, duration_s: seconds, intensity: 0.5 })) },
      ENEMIES,
      MOVES,
    );
  // Four phases of 40 seconds are 160: paced as 90. Two of 15 are 30: paced as 60.
  expect(lasting(4, 40).hp).toBe(lasting(4, 22.5).hp);
  expect(lasting(2, 15).hp).toBe(lasting(2, 30).hp);
  // Inside the range the length does count: 90 seconds needs more health than 60.
  expect(lasting(2, 40).hp).toBeGreaterThan(lasting(2, 30).hp);
  expect(lasting(4, 22.5).hp).toBeGreaterThan(lasting(4, 15).hp);
});

test("the registered enemies are exactly as they were before any fight was built", () => {
  expect(JSON.stringify(ENEMIES)).toBe(REGISTERED);
});
