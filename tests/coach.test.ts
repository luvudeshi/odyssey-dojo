// The warm-up coach on made-up warm-ups, and its effect on the real engine's choice of attacks.
import { expect, test } from "vitest";
import { improvement, scoreWarmup, trainOn } from "../src/coach";
import type { DefenseId, Habit } from "../src/coach";
import { startFight, step } from "../src/combat/engine";
import type { EnemyAttack, EnemySpec, FightingStyle, PoseFrame } from "../src/core/types";
import { ENEMIES } from "../src/enemies/registry";
import { JOINT as J } from "../src/pose/signals";
import { frameAt } from "./poseFixture";

type P2 = readonly [number, number];
type P3 = readonly [number, number, number];
/** One arm's pose, written for the left arm: image elbow and wrist, then world elbow and wrist. */
type Arm = readonly [P2, P2, P3, P3];
const UP: Arm = [[0.4, 0.45], [0.46, 0.22], [-0.25, -0.25, -0.05], [-0.1, -0.55, -0.15]];
const LOW: Arm = [[0.4, 0.5], [0.45, 0.42], UP[2], UP[3]];
const HANG: Arm = [[0.4, 0.5], [0.4, 0.62], [-0.22, -0.2, 0], [-0.22, 0.05, 0]];
const FULL: Arm = [[0.41, 0.38], [0.44, 0.36], [-0.2, -0.5, -0.3], [-0.2, -0.5, -0.6]];
const SHORT: Arm = [FULL[0], FULL[1], [-0.3, -0.45, -0.2], [-0.2, -0.5, -0.45]];

/** A frame with each arm in a pose and the chest moved `shift` shoulder widths to the player's right. */
function pose(t: number, left: Arm, right: Arm, shift = 0): PoseFrame {
  const dx = shift * 0.16;
  return frameAt(
    t,
    {
      [J.leftShoulder]: [0.42 + dx, 0.35], [J.rightShoulder]: [0.58 + dx, 0.35],
      [J.leftElbow]: left[0], [J.leftWrist]: left[1],
      [J.rightElbow]: [1 - right[0][0], right[0][1]], [J.rightWrist]: [1 - right[1][0], right[1][1]],
    },
    {
      [J.leftElbow]: left[2], [J.leftWrist]: left[3],
      [J.rightElbow]: [-right[2][0], right[2][1], right[2][2]], [J.rightWrist]: [-right[3][0], right[3][1], right[3][2]],
    },
  );
}

interface Flaws {
  /** Where the punching arm goes after each punch. Clean: back up to the face. */
  readonly after?: Arm;
  readonly punch?: Arm;
  /** How many of the 20 "hands up" frames have the fists at the chest. */
  readonly lowFrames?: number;
  /** How far each step goes, in shoulder widths. */
  readonly left?: number;
  readonly right?: number;
}

/** Three punches (left, right, left), hands up, a step left and a step right, at 20 frames a second. */
function warmup({ after = UP, punch = FULL, lowFrames = 0, left = 0.8, right = 0.8 }: Flaws = {}): PoseFrame[] {
  const frames: PoseFrame[] = [];
  const add = (count: number, l: Arm, r: Arm, shift = 0): void => {
    for (let i = 0; i < count; i++) frames.push(pose(frames.length * 50, l, r, shift));
  };
  add(10, UP, UP);
  for (const side of ["left", "right", "left"] as const) {
    add(3, side === "left" ? punch : UP, side === "left" ? UP : punch);
    add(8, side === "left" ? after : UP, side === "left" ? UP : after);
    add(4, UP, UP);
  }
  add(lowFrames, LOW, LOW);
  add(20 - lowFrames, UP, UP);
  add(6, UP, UP, -left);
  add(6, UP, UP);
  add(6, UP, UP, right);
  add(6, UP, UP);
  return frames;
}

const ids = (frames: readonly PoseFrame[]): string[] => scoreWarmup(frames).map((habit) => habit.id);

test("a clean warm-up has nothing to train", () => {
  expect(scoreWarmup(warmup())).toEqual([]);
});

test("lowering the arms at the end of the warm-up is not a punch", () => {
  const frames = warmup();
  const mid: Arm = [[0.4, 0.46], [0.4, 0.5], [-0.3, -0.3, 0], [-0.32, -0.22, 0]];
  for (const arm of [mid, mid, HANG, HANG, HANG, HANG, UP, UP]) frames.push(pose(frames.length * 50, arm, arm));
  expect(scoreWarmup(frames)).toEqual([]);
});

test("the two weakest habits come out worst first, each with a tip and a defense to train", () => {
  const dropped = scoreWarmup(warmup({ after: HANG, lowFrames: 20 }));
  expect(dropped.map((habit) => [habit.id, habit.trains])).toEqual([["dropped_hands", "block"], ["low_guard", "block"]]);
  expect(dropped[0]?.severity).toBe(1);
  expect(dropped[1]?.severity).toBeCloseTo(20 / 66);

  const weakLeft = scoreWarmup(warmup({ left: 0.06, lowFrames: 20 }));
  expect(weakLeft.map((habit) => [habit.id, habit.trains])).toEqual([["weak_left", "dodge_left"], ["low_guard", "block"]]);
  expect(weakLeft[0]?.severity).toBeCloseTo(0.9);
  expect(scoreWarmup(warmup({ right: 0.06 })).map((habit) => [habit.id, habit.trains])).toEqual([["weak_right", "dodge_right"]]);

  const short = scoreWarmup(warmup({ punch: SHORT, left: 0.3 }));
  expect(short.map((habit) => [habit.id, habit.trains])).toEqual([["short_punches", "strike"], ["weak_left", "dodge_left"]]);
  expect(short[0]?.severity).toBeGreaterThan(0.8);
  expect(short[1]?.severity).toBeCloseTo(0.5);

  for (const habit of [...dropped, ...weakLeft, ...short]) {
    expect(habit.tip.length).toBeGreaterThan(10);
    expect(habit.label.length).toBeGreaterThan(3);
    expect(habit.severity).toBeGreaterThan(0);
    expect(habit.severity).toBeLessThanOrEqual(1);
  }
});

test("never more than two habits, ties keep a fixed order, and a mild flaw is left out", () => {
  expect(ids(warmup({ after: HANG, left: 0, punch: SHORT, lowFrames: 20 }))).toEqual(["dropped_hands", "weak_left"]);
  expect(ids(warmup({ left: 0.55, lowFrames: 5 }))).toEqual([]);
  expect(scoreWarmup(warmup({ after: HANG }))).toEqual(scoreWarmup(warmup({ after: HANG })));
});

test("empty, very short and unreadable input gives no habits and never throws", () => {
  expect(scoreWarmup([])).toEqual([]);
  expect(scoreWarmup(warmup().slice(0, 3))).toEqual([]);
  expect(scoreWarmup(Array.from({ length: 40 }, (_, i) => ({ t: i * 50, image: [], world: [] })))).toEqual([]);
  const broken = warmup().map((frame, i) => (i % 7 === 0 ? { t: Number.NaN, image: [], world: [] } : frame));
  for (const habit of scoreWarmup(broken)) expect(Number.isFinite(habit.severity)).toBe(true);
});

const DEFENSES: readonly DefenseId[] = ["block", "duck", "dodge_left", "dodge_right"];
const habit = (trains: Habit["trains"], severity = 1): Habit => ({ id: "low_guard", label: "L", tip: "T", severity, trains });
const bare = (enemy: EnemySpec): unknown => ({
  ...enemy,
  attacks: enemy.attacks.map((attack) => ({ ...attack, weight: 0 })),
});
const pools = (enemy: EnemySpec): EnemyAttack[][] =>
  (enemy.phases ?? [null]).map((phase) => enemy.attacks.filter((a) => !phase || phase.attackIds.includes(a.id)));
const share = (pool: readonly EnemyAttack[], grown: ReadonlySet<string>): number =>
  pool.reduce((sum, a) => sum + (grown.has(a.id) ? (a.weight ?? 1) : 0), 0) / pool.reduce((sum, a) => sum + (a.weight ?? 1), 0);
const grownIds = (enemy: EnemySpec, trained: EnemySpec): Set<string> =>
  new Set(trained.attacks.filter((a, i) => (a.weight ?? 1) > (enemy.attacks[i]?.weight ?? 1)).map((a) => a.id));

test("trainOn changes only weights, on every enemy, and helps in every phase", () => {
  expect(ENEMIES.length).toBeGreaterThan(0);
  for (const enemy of ENEMIES) {
    const frozen = JSON.stringify(enemy);
    expect(trainOn(enemy, [])).toEqual(enemy);
    expect(trainOn(enemy, [habit("strike"), habit("block", 0), habit("duck", Number.NaN)])).toEqual(enemy);
    for (const defense of DEFENSES) {
      const trained = trainOn(enemy, [habit(defense), habit("strike", 0.5)]);
      expect(bare(trained)).toEqual(bare(enemy));
      for (const [i, attack] of trained.attacks.entries()) {
        const base = enemy.attacks[i]?.weight ?? 1;
        const weight = attack.weight ?? 1;
        expect(Number.isFinite(weight) && weight > 0).toBe(true);
        expect(weight / base).toBeLessThanOrEqual(2.5);
        expect(weight / base).toBe(attack.counter === defense ? 2.5 : weight / base);
      }
      const grown = grownIds(enemy, trained);
      for (const [p, pool] of pools(enemy).entries()) {
        const trainedPool = pools(trained)[p] ?? [];
        expect(share(trainedPool, grown), `${enemy.id} ${defense} phase ${String(p)}`).toBeGreaterThan(share(pool, grown) * 1.2);
      }
      const mild = trainOn(enemy, [habit(defense, 0.2)]);
      const hit = mild.attacks.find((attack) => attack.counter === defense);
      expect((hit?.weight ?? 1) / (enemy.attacks.find((a) => a.id === hit?.id)?.weight ?? 1)).toBeCloseTo(1.3);
    }
    expect(JSON.stringify(enemy)).toBe(frozen);
  }
});

const style: FightingStyle = { id: "s", name: "S", blurb: "", strikes: ["jab"] };

/** How often the real engine picks one of `wanted` over many telegraphs in one phase, from a fixed seed. */
function thrown(enemy: EnemySpec, phaseIndex: number, wanted: ReadonlySet<string>): number {
  let seed = 7;
  let count = 0;
  for (let i = 0; i < 2000; i++) {
    const waiting = { ...startFight(enemy, seed), phaseIndex, phase: { kind: "recover", msLeft: 1 } as const };
    const next = step(waiting, enemy, style, { held: new Set(), struck: [] }, 10).state;
    if (next.phase.kind !== "defend") throw new Error("expected a telegraph");
    if (wanted.has(next.phase.attack.id)) count += 1;
    seed = next.seed;
  }
  return count;
}

test("in the real engine a trained monster throws the targeted attacks more often, in every phase", () => {
  for (const enemy of ENEMIES) {
    for (const defense of DEFENSES) {
      const trained = trainOn(enemy, [habit(defense)]);
      const grown = grownIds(enemy, trained);
      for (const p of pools(enemy).keys()) {
        const before = thrown(enemy, p, grown);
        expect(before).toBeGreaterThan(0);
        expect(thrown(trained, p, grown), `${enemy.id} ${defense} phase ${String(p)}`).toBeGreaterThan(before * 1.2);
      }
    }
  }
});

test("the end-of-fight report has one line per habit", () => {
  const before = [habit("block", 0.8), { ...habit("dodge_left", 0.5), id: "weak_left" as const, label: "W" }];
  expect(improvement(before, [habit("block", 0.3)])).toEqual(["L: better. Keep going.", "W: fixed. Well done."]);
  expect(improvement(before.slice(0, 1), [habit("block", 0.85)])).toEqual(["L: about the same. T"]);
  expect(improvement(before.slice(0, 1), [habit("block", 1)])).toEqual(["L: worse than in the warm-up. T"]);
  expect(improvement([], before)).toEqual([]);
});
