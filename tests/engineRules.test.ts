// Engine rule tests: seeded random fights against every registered enemy and style must never break the fight rules.
import { expect, test } from "vitest";
import { startFight, step } from "../src/combat/engine";
import type { StepResult } from "../src/combat/engine";
import type {
  CombatInput,
  CombatState,
  EnemyAttack,
  EnemySpec,
  FightingStyle,
  Strike,
  WeakSpot,
} from "../src/core/types";
import { ENEMIES } from "../src/enemies/registry";
import { MOVES } from "../src/moves/registry";
import { STYLES } from "../src/styles/registry";

type Rule = "health" | "score" | "power" | "phases" | "timers" | "names" | "ending" | "finished";
type Complain = (rule: Rule, what: string) => void;

interface Matchup {
  readonly enemy: EnemySpec;
  readonly style: FightingStyle;
}

/** One step's worth of what the player did and how much time passed. */
interface Frame {
  readonly input: CombatInput;
  readonly dtMs: number;
}

interface Tally {
  /** The first few broken cases of each rule, each with the matchup, seed and step that broke it. */
  readonly broken: Readonly<Record<Rule, string[]>>;
  steps: number;
  won: number;
  lost: number;
}

const MATCHUPS: readonly Matchup[] = ENEMIES.flatMap((enemy) => STYLES.map((style) => ({ enemy, style })));
const DEFENSES = [...MOVES.values()].filter((move) => move.kind === "defend").map((move) => move.id);
const NO_SUCH_MOVE = "no_such_move";
const THROWN: readonly string[] = [...MOVES.keys(), NO_SUCH_MOVE];
const STEP_SIZES: readonly number[] = [0, 0, 0.001, 0.25, 1, 16, 16.667, 33, 50, 100, 100];
/** How often a random player holds the right defense; fight number N uses entry N, so every matchup gets them all. */
const GUARDS: readonly number[] = [0, 0.25, 0.5, 0.75, 1];
/** Seeds at the ends of the 32-bit range, which every matchup also fights with. */
const EDGE_SEEDS: readonly number[] = [0, 1, 4294967295];

/** About this many random fights in all, shared out so the file stays fast as enemies and styles are added. */
const FIGHT_BUDGET = 200;
const MAX_STEPS = 6000;
const STEPS_AFTER_THE_END = 40;
const KEPT_PER_RULE = 5;
/** No fight should run longer than this, however it is played. */
const FIGHT_LIMIT_MS = 600_000;

/** A small seeded generator (mulberry32): no Math.random, so any fight here can be replayed from its seed. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** False for NaN as well as for anything outside low..high. */
function within(value: number, low: number, high: number): boolean {
  return value >= low && value <= high;
}

function over(state: CombatState): boolean {
  return state.phase.kind === "won" || state.phase.kind === "lost";
}

function isStrike(id: string): boolean {
  return MOVES.get(id)?.kind === "strike";
}

function ownAttack(enemy: EnemySpec, attack: EnemyAttack): boolean {
  return enemy.attacks.some((own) => own.id === attack.id) && MOVES.get(attack.counter)?.kind === "defend";
}

function ownSpot(enemy: EnemySpec, spot: WeakSpot): boolean {
  return enemy.weakSpots.some((own) => own.id === spot.id);
}

function seedsFor(matchupIndex: number): number[] {
  const count = Math.max(EDGE_SEEDS.length + GUARDS.length, Math.ceil(FIGHT_BUDGET / MATCHUPS.length));
  const spread = Array.from(
    { length: count - EDGE_SEEDS.length },
    (_, fight) => (matchupIndex * 7919 + fight * 104729 + 17) >>> 0,
  );
  return [...EDGE_SEEDS, ...spread];
}

function randomQuality(random: () => number): number {
  const chance = random();
  if (chance < 0.1) return 0;
  return chance > 0.9 ? 1 : random();
}

function randomStrike(move: string, random: () => number): Strike {
  return { move, quality: randomQuality(random), player: random() < 0.5 ? 0 : 1 };
}

/** How one random player behaves for a whole fight; each number is a chance per step. */
interface Habits {
  /** Holding the right defense while an attack is coming. */
  readonly guard: number;
  /** Throwing the prompted strike while the opening lasts; low values miss whole openings. */
  readonly reflex: number;
  /** Holding or throwing something unasked. */
  readonly noise: number;
}

/** Random held defenses and thrown moves, plus the right answer to the prompt as often as the habits say. */
function randomInput(state: CombatState, random: () => number, { guard, reflex, noise }: Habits): CombatInput {
  const phase = state.phase;
  const held = new Set<string>();
  for (const id of DEFENSES) if (random() < noise) held.add(id);
  const struck: Strike[] = [];
  while (struck.length < 3 && random() < noise) {
    struck.push(randomStrike(THROWN[Math.floor(random() * THROWN.length)] ?? NO_SUCH_MOVE, random));
  }
  if (phase.kind === "defend" && random() < guard) held.add(phase.attack.counter);
  if ((phase.kind === "strike" || phase.kind === "finisher") && random() < reflex) {
    struck.push(randomStrike(phase.move, random));
  }
  return { held, struck };
}

/** Frame times of every kind: zero, far below a frame, ordinary frames and 100 ms hitches. */
function randomStepMs(random: () => number): number {
  if (random() < 0.5) return STEP_SIZES[Math.floor(random() * STEP_SIZES.length)] ?? 100;
  return random() * 100;
}

/**
 * Plays one seeded random fight, handing every step to `seen`. It keeps stepping for a while after the fight
 * ends, so the caller can see that nothing more happens.
 */
function randomFight(
  { enemy, style }: Matchup,
  seed: number,
  fightNumber: number,
  seen: (before: CombatState, frame: Frame, after: StepResult, stepNumber: number) => void,
): CombatState {
  const random = seeded(seed);
  const habits: Habits = {
    guard: GUARDS[fightNumber % GUARDS.length] ?? 1,
    reflex: random() ** 3,
    noise: random() * 0.3,
  };
  let state = startFight(enemy, seed);
  let afterTheEnd = 0;
  for (let stepNumber = 0; stepNumber < MAX_STEPS && afterTheEnd < STEPS_AFTER_THE_END; stepNumber++) {
    const frame: Frame = { input: randomInput(state, random, habits), dtMs: randomStepMs(random) };
    const after = step(state, enemy, style, frame.input, frame.dtMs);
    seen(state, frame, after, stepNumber);
    if (over(state)) afterTheEnd++;
    state = after.state;
  }
  return state;
}

function checkState(
  before: CombatState,
  after: CombatState,
  start: CombatState,
  { enemy, style }: Matchup,
  complain: Complain,
): void {
  if (!within(after.playerHp, 0, start.playerHp)) complain("health", `player health is ${String(after.playerHp)}`);
  if (!within(after.enemyHp, 0, start.enemyHp)) complain("health", `enemy health is ${String(after.enemyHp)}`);
  if (!(after.score >= 0)) complain("score", `score is ${String(after.score)}`);
  if (!(after.combo >= 0)) complain("score", `combo is ${String(after.combo)}`);
  if (!within(after.power, 0, 1)) complain("power", `power is ${String(after.power)}`);

  const lastPhase = (enemy.phases?.length ?? 1) - 1;
  if (!Number.isInteger(after.phaseIndex) || !within(after.phaseIndex, 0, lastPhase)) {
    complain("phases", `phaseIndex is ${String(after.phaseIndex)}, outside 0..${String(lastPhase)}`);
  }
  if (after.phaseIndex < before.phaseIndex) {
    complain("phases", `phaseIndex fell from ${String(before.phaseIndex)} to ${String(after.phaseIndex)}`);
  }

  const phase = after.phase;
  if ("msLeft" in phase && !(phase.msLeft >= 0)) {
    complain("timers", `${phase.kind} has msLeft ${String(phase.msLeft)}`);
  }
  if ("totalMs" in phase && !(phase.msLeft <= phase.totalMs)) {
    complain("timers", `${phase.kind} has msLeft ${String(phase.msLeft)} of totalMs ${String(phase.totalMs)}`);
  }
  if (phase.kind === "defend" && !ownAttack(enemy, phase.attack)) {
    complain("names", `the defend prompt names attack ${phase.attack.id} with counter ${phase.attack.counter}`);
  }
  if (phase.kind === "strike" && !ownSpot(enemy, phase.weakSpot)) {
    complain("names", `the strike prompt names weak spot ${phase.weakSpot.id}`);
  }
  if (phase.kind === "strike" && !(isStrike(phase.move) && style.strikes.includes(phase.move))) {
    complain("names", `the strike prompt asks for ${phase.move}`);
  }
  if (phase.kind === "finisher" && !isStrike(phase.move)) {
    complain("names", `the finisher prompt asks for ${phase.move}`);
  }
}

function checkEvents(before: CombatState, after: StepResult, { enemy, style }: Matchup, complain: Complain): void {
  for (const event of after.events) {
    switch (event.type) {
      case "telegraph":
      case "defended":
      case "playerHit":
        if (!ownAttack(enemy, event.attack)) {
          complain("names", `${event.type} names attack ${event.attack.id} with counter ${event.attack.counter}`);
        }
        if (event.type === "playerHit" && !(event.damage >= 0)) {
          complain("health", `playerHit does ${String(event.damage)} damage`);
        }
        break;
      case "opening":
        if (!ownSpot(enemy, event.weakSpot)) complain("names", `opening names weak spot ${event.weakSpot.id}`);
        if (!(isStrike(event.move) && style.strikes.includes(event.move))) {
          complain("names", `opening asks for ${event.move}`);
        }
        break;
      case "enemyHit":
        if (!isStrike(event.move)) complain("names", `enemyHit names ${event.move}`);
        if (!within(event.quality, 0, 1)) complain("names", `enemyHit has quality ${String(event.quality)}`);
        if (!(event.damage >= 0)) complain("health", `enemyHit does ${String(event.damage)} damage`);
        break;
      case "phaseChanged":
        if (enemy.phases?.[event.index]?.name !== event.name) {
          complain("phases", `phaseChanged names phase ${String(event.index)} "${event.name}"`);
        }
        break;
      case "finished":
        if (event.move !== enemy.finisher || !isStrike(event.move)) complain("names", `finished names ${event.move}`);
        break;
      case "powerUnleashed":
        if (!(event.damage >= 0)) complain("health", `powerUnleashed does ${String(event.damage)} damage`);
        break;
      case "whiffed":
      case "won":
      case "lost":
        break;
    }
  }
  for (const ending of ["won", "lost"] as const) {
    const said = after.events.filter((event) => event.type === ending).length;
    const reached = before.phase.kind !== ending && after.state.phase.kind === ending;
    if (said !== (reached ? 1 : 0)) {
      const turn = reached ? "became" : "did not become";
      complain("ending", `${String(said)} "${ending}" events on a step where the fight ${turn} ${ending}`);
    }
  }
}

function runRandomFights(): Tally {
  const tally: Tally = {
    broken: { health: [], score: [], power: [], phases: [], timers: [], names: [], ending: [], finished: [] },
    steps: 0,
    won: 0,
    lost: 0,
  };
  MATCHUPS.forEach((matchup, matchupIndex) => {
    seedsFor(matchupIndex).forEach((seed, fightNumber) => {
      const start = startFight(matchup.enemy, seed);
      const final = randomFight(matchup, seed, fightNumber, (before, frame, after, stepNumber) => {
        const complain: Complain = (rule, what) => {
          const where = `${matchup.enemy.id} vs ${matchup.style.id}, seed ${String(seed)}, step ${String(stepNumber)}`;
          if (tally.broken[rule].length < KEPT_PER_RULE) {
            tally.broken[rule].push(`${where} (${String(frame.dtMs)} ms): ${what}`);
          }
        };
        tally.steps++;
        checkState(before, after.state, start, matchup, complain);
        checkEvents(before, after, matchup, complain);
        if (!over(before)) return;
        if (after.events.length > 0) {
          const sent = after.events.map((event) => event.type).join(", ");
          complain("finished", `a ${before.phase.kind} fight sent ${sent}`);
        }
        if (after.state !== before && JSON.stringify(after.state) !== JSON.stringify(before)) {
          complain("finished", `a ${before.phase.kind} fight changed to ${JSON.stringify(after.state)}`);
        }
      });
      if (final.phase.kind === "won") tally.won++;
      if (final.phase.kind === "lost") tally.lost++;
    });
  });
  return tally;
}

let tally: Tally | undefined;

/** Every rule below reads the same set of random fights, so they are only played once. */
function randomFights(): Tally {
  tally ??= runRandomFights();
  return tally;
}

/** Replays recorded frames from a fresh fight. Each state is frozen first, so a step that edits it throws. */
function replay({ enemy, style }: Matchup, seed: number, frames: readonly Frame[]): string[] {
  let state = startFight(enemy, seed);
  return frames.map((frame) => {
    Object.freeze(state);
    Object.freeze(state.phase);
    Object.freeze(state.mastery);
    const after = step(state, enemy, style, frame.input, frame.dtMs);
    state = after.state;
    return JSON.stringify(after);
  });
}

/** Plays a whole fight at a fixed frame time as a player who answers every prompt, or one who does nothing. */
function playOut({ enemy, style }: Matchup, seed: number, dtMs: number, perfect: boolean): CombatState {
  let state = startFight(enemy, seed);
  for (let ms = 0; ms < FIGHT_LIMIT_MS && !over(state); ms += dtMs) {
    const phase = state.phase;
    const held = new Set<string>();
    const struck: Strike[] = [];
    if (perfect && phase.kind === "defend") held.add(phase.attack.counter);
    if (perfect && (phase.kind === "strike" || phase.kind === "finisher")) {
      struck.push({ move: phase.move, quality: 1, player: 0 });
    }
    state = step(state, enemy, style, { held, struck }, dtMs).state;
  }
  return state;
}

test("the random fights cover every enemy and style, thousands of steps, and both endings", () => {
  expect(MATCHUPS.length).toBe(ENEMIES.length * STYLES.length);
  expect(MATCHUPS.length).toBeGreaterThan(0);
  const fights = randomFights();
  expect(fights.steps).toBeGreaterThan(50_000);
  expect(fights.won).toBeGreaterThan(0);
  expect(fights.lost).toBeGreaterThan(0);
});

test("health never goes below zero or above where it started, and no hit does negative damage", () => {
  expect(randomFights().broken.health).toEqual([]);
});

test("score and combo never go negative", () => {
  expect(randomFights().broken.score).toEqual([]);
});

test("power stays within 0..1", () => {
  expect(randomFights().broken.power).toEqual([]);
});

test("phaseIndex never decreases and stays inside the enemy's phases", () => {
  expect(randomFights().broken.phases).toEqual([]);
});

test("msLeft never goes below zero or above totalMs", () => {
  expect(randomFights().broken.timers).toEqual([]);
});

test("every event and prompt names a real move, attack or weak spot", () => {
  expect(randomFights().broken.names).toEqual([]);
});

test("a fight says won or lost exactly once, on the step that ends it", () => {
  expect(randomFights().broken.ending).toEqual([]);
});

test("a finished fight never changes again and sends no more events", () => {
  expect(randomFights().broken.finished).toEqual([]);
});

test("the same seed and inputs always give the same result, and a step never edits the state it is given", () => {
  MATCHUPS.forEach((matchup, matchupIndex) => {
    seedsFor(matchupIndex)
      .slice(0, EDGE_SEEDS.length + 2)
      .forEach((seed, fightNumber) => {
        const frames: Frame[] = [];
        const first: string[] = [];
        randomFight(matchup, seed, fightNumber, (_before, frame, after) => {
          frames.push(frame);
          first.push(JSON.stringify(after));
        });
        const label = `${matchup.enemy.id} vs ${matchup.style.id}, seed ${String(seed)}: first step that differs`;
        for (const again of [replay(matchup, seed, frames), replay(matchup, seed, frames)]) {
          expect(again.length, label).toBe(first.length);
          expect(again.findIndex((result, index) => result !== first[index]), label).toBe(-1);
        }
      });
  });
});

test("a player who answers every prompt wins well inside ten minutes", () => {
  MATCHUPS.forEach((matchup, matchupIndex) => {
    for (const dtMs of [16, 100]) {
      for (const seed of seedsFor(matchupIndex).slice(0, EDGE_SEEDS.length + 1)) {
        const label = `${matchup.enemy.id} vs ${matchup.style.id}, seed ${String(seed)}, ${String(dtMs)} ms steps`;
        expect(playOut(matchup, seed, dtMs, true).phase.kind, label).toBe("won");
      }
    }
  });
});

test("a player who does nothing loses well inside ten minutes", () => {
  MATCHUPS.forEach((matchup, matchupIndex) => {
    for (const dtMs of [16, 100]) {
      for (const seed of seedsFor(matchupIndex).slice(0, EDGE_SEEDS.length + 1)) {
        const label = `${matchup.enemy.id} vs ${matchup.style.id}, seed ${String(seed)}, ${String(dtMs)} ms steps`;
        expect(playOut(matchup, seed, dtMs, false).phase.kind, label).toBe("lost");
      }
    }
  });
});
