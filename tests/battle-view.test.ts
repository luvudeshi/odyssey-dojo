// The battle view's pure parts: the synthetic hero pose, the action choice, the event bookkeeping, the camera shots
// and the monster's motion. Real engine states, no mocks.
import { expect, test } from "vitest";
import { startFight, step } from "../src/combat/engine";
import type { CombatInput, EnemySpec, FightingStyle } from "../src/core/types";
import { JOINT } from "../src/pose/signals";
import { battle, decay, noteInput, resetBattle, syncBattle } from "../src/render/battle";
import type { Battle } from "../src/render/battle";
import { cameraShot, makeShot } from "../src/render/cameraShots";
import { HURT_SECONDS, STRIKE_SECONDS, USED, blendPose, chooseAction, makePose, syntheticPose } from "../src/render/heroPose";
import type { ActionInput, HeroAction } from "../src/render/heroPose";
import { ADVANCE, makeMotion, monsterMotion } from "../src/render/monsterMotion";

const ACTIONS: HeroAction[] = ["idle", "block", "duck", "dodgeLeft", "dodgeRight", "punch", "thrust", "hurt", "victory", "defeat"];
const J = JOINT;
const height = (pose: ReturnType<typeof makePose>, joint: number): number => 0.95 - (pose[joint]?.y ?? NaN);

test("every action gives finite landmarks with the feet near the floor", () => {
  for (const action of ACTIONS) {
    for (const [t, p] of [[0, 0], [1.3, 0.5], [7, 1]] as const) {
      const pose = syntheticPose(action, t, p);
      for (const index of USED) {
        const point = pose[index];
        expect([point?.x, point?.y, point?.z].every((v) => Number.isFinite(v))).toBe(true);
      }
      expect(Math.abs(height(pose, J.leftAnkle))).toBeLessThan(0.15);
      expect(Math.abs(height(pose, J.rightAnkle))).toBeLessThan(0.15);
    }
  }
});

test("it is deterministic", () => {
  expect(syntheticPose("punch", 2.5, 0.4)).toEqual(syntheticPose("punch", 2.5, 0.4));
});

test("left stays left and right stays right", () => {
  for (const action of ACTIONS) {
    const pose = syntheticPose(action, 0.7, 0.5);
    expect(pose[J.leftShoulder]?.x).toBeLessThan(pose[J.rightShoulder]?.x ?? -Infinity);
    expect(pose[J.leftHip]?.x).toBeLessThan(pose[J.rightHip]?.x ?? -Infinity);
  }
  const mean = (action: HeroAction): number => {
    const pose = syntheticPose(action, 0, 0.5);
    return ((pose[J.leftShoulder]?.x ?? 0) + (pose[J.rightShoulder]?.x ?? 0)) / 2;
  };
  expect(mean("dodgeLeft")).toBeLessThan(mean("idle"));
  expect(mean("dodgeRight")).toBeGreaterThan(mean("idle"));
});

test("wrists reach forward (toward -z) on a punch and a thrust", () => {
  const idle = syntheticPose("idle", 0, 0.5);
  const punch = syntheticPose("punch", 0, 0.5);
  const thrust = syntheticPose("thrust", 0, 0.5);
  expect(punch[J.rightWrist]?.z).toBeLessThan((idle[J.rightWrist]?.z ?? 0) - 0.3);
  expect(thrust[J.leftWrist]?.z).toBeLessThan((idle[J.leftWrist]?.z ?? 0) - 0.3);
  expect(thrust[J.rightWrist]?.z).toBeLessThan((idle[J.rightWrist]?.z ?? 0) - 0.3);
});

test("the head drops on a duck and the hands rise on victory", () => {
  expect(height(syntheticPose("duck", 0, 0), J.nose)).toBeLessThan(height(syntheticPose("idle", 0, 0), J.nose) - 0.25);
  expect(height(syntheticPose("victory", 0, 1), J.leftWrist)).toBeGreaterThan(height(syntheticPose("idle", 0, 1), J.nose));
});

test("blending moves from one pose to another and can write over its input", () => {
  const a = syntheticPose("idle", 0, 0);
  const b = syntheticPose("duck", 0, 0);
  const out = makePose();
  blendPose(out, a, b, 0.5);
  expect(out[J.nose]?.y).toBeCloseTo(((a[J.nose]?.y ?? 0) + (b[J.nose]?.y ?? 0)) / 2);
  blendPose(a, a, b, 1);
  expect(a[J.nose]?.y).toBeCloseTo(b[J.nose]?.y ?? NaN);
});

const quiet: ActionInput = {
  held: new Set(), struckMove: "", sinceStrike: 9, sinceHurt: 9, won: false, lost: false, finisherMove: null,
};

test("the action follows what the player is doing, with the end of the fight first", () => {
  expect(chooseAction(quiet)).toBe("idle");
  expect(chooseAction({ ...quiet, held: new Set(["block"]) })).toBe("block");
  expect(chooseAction({ ...quiet, held: new Set(["duck"]) })).toBe("duck");
  expect(chooseAction({ ...quiet, held: new Set(["dodge_left"]) })).toBe("dodgeLeft");
  expect(chooseAction({ ...quiet, held: new Set(["dodge_right"]) })).toBe("dodgeRight");
  expect(chooseAction({ ...quiet, struckMove: "jab", sinceStrike: STRIKE_SECONDS / 2 })).toBe("punch");
  expect(chooseAction({ ...quiet, struckMove: "jab", sinceStrike: STRIKE_SECONDS + 0.1 })).toBe("idle");
  expect(chooseAction({ ...quiet, struckMove: "stake_thrust", sinceStrike: 0.1 })).toBe("thrust");
  expect(chooseAction({ ...quiet, struckMove: "hook", sinceStrike: 0.1, finisherMove: "hook" })).toBe("thrust");
  expect(chooseAction({ ...quiet, held: new Set(["block"]), sinceHurt: HURT_SECONDS / 2 })).toBe("hurt");
  expect(chooseAction({ ...quiet, won: true, sinceHurt: 0 })).toBe("victory");
  expect(chooseAction({ ...quiet, lost: true, won: true })).toBe("defeat");
  // The killing blow shows before the victory pose.
  expect(chooseAction({ ...quiet, won: true, struckMove: "stake_thrust", sinceStrike: 0.1 })).toBe("thrust");
});

const enemy: EnemySpec = {
  id: "dummy", name: "Dummy", title: "", order: 0, hp: 20, strikeWindowMs: 1000,
  attacks: [{ id: "swing", name: "Swing", telegraphMs: 1000, damage: 60, counter: "block" }],
  weakSpots: [{ id: "head", label: "head", position: [1, 2, 3], moves: ["jab"] }],
  taunts: [],
};
const style: FightingStyle = { id: "s", name: "S", blurb: "", strikes: ["jab"] };
const idle: CombatInput = { held: new Set(), struck: [] };

function fresh(): Battle {
  const b = { ...battle };
  resetBattle(b);
  return b;
}

test("battle events are stamped from real state changes", () => {
  const b = fresh();
  let state = startFight(enemy, 1);
  syncBattle(b, state, 10);
  expect(b.playerHitAt).toBe(-Infinity);
  for (let i = 0; i < 200 && b.playerHitAt === -Infinity; i++) {
    state = step(state, enemy, style, idle, 100).state;
    syncBattle(b, state, 20 + i);
  }
  expect(b.playerHitAt).toBeGreaterThan(19);
  expect(b.state).toBe(state);
});

test("input notes keep the held defends and the last strike", () => {
  const b = fresh();
  noteInput({ held: new Set(["block"]), struck: [{ move: "jab", quality: 1, player: 0 }] }, 5, b);
  expect(b.held.has("block")).toBe(true);
  expect([b.struckMove, b.struckAt]).toEqual(["jab", 5]);
  noteInput(idle, 6, b);
  expect([b.held.size, b.struckAt]).toEqual([0, 5]);
});

test("decay runs from 1 to 0", () => {
  expect([decay(10, 10, 2), decay(11, 10, 2), decay(13, 10, 2)]).toEqual([1, 0.5, 0]);
});

function inPhase(kind: "defend" | "strike" | "finisher" | "won" | "lost", msLeft = 200): Battle {
  const b = fresh();
  const state = startFight(enemy, 1);
  const attack = enemy.attacks[0];
  const weakSpot = enemy.weakSpots[0];
  const phase =
    kind === "defend" ? ({ kind, attack, msLeft, totalMs: 1000 } as const)
    : kind === "strike" ? ({ kind, weakSpot, move: "jab", msLeft: 500, totalMs: 1000 } as const)
    : kind === "finisher" ? ({ kind, move: "jab", msLeft: 500, totalMs: 1000 } as const)
    : ({ kind } as const);
  b.state = { ...state, phase };
  return b;
}

test("camera: pulls back and lower on a windup, pushes in on a strike window, orbits at the end", () => {
  const rest = cameraShot(makeShot(), fresh(), 0, true);
  const defend = cameraShot(makeShot(), inPhase("defend"), 0, true);
  expect(defend.pz).toBeGreaterThan(rest.pz);
  expect(defend.py).toBeLessThan(rest.py);
  const strike = cameraShot(makeShot(), inPhase("strike"), 0, true);
  expect(strike.pz).toBeLessThan(rest.pz);
  // Looking mostly at the weak spot [1, 2, 3] in the monster's space, which sits at z=-4, so z=-1.
  expect(strike.lz).toBeGreaterThan(rest.lz);
  expect(strike.lz).toBeLessThan(-1);
  expect(strike.ly).toBeGreaterThan(rest.ly);
  const a = cameraShot(makeShot(), inPhase("finisher"), 0, true);
  const b = cameraShot(makeShot(), inPhase("finisher"), 4, true);
  expect(a.px).not.toBeCloseTo(b.px);
  expect(cameraShot(makeShot(), inPhase("won"), 0, true).fov).toBeGreaterThan(rest.fov);
  expect(cameraShot(makeShot(), inPhase("lost"), 0, true).py).toBeLessThan(1);
});

test("camera: calm motion stops the sway; a hit punches in; a phase change goes wide", () => {
  const b = fresh();
  const t1 = cameraShot(makeShot(), b, 1, true);
  const t2 = cameraShot(makeShot(), b, 3, true);
  expect(t1.px).toBe(t2.px);
  expect(cameraShot(makeShot(), b, 1, false).px).not.toBe(cameraShot(makeShot(), b, 3, false).px);
  b.enemyHitAt = 5;
  expect(cameraShot(makeShot(), b, 5.1, true).kick).toBeGreaterThan(0);
  expect(cameraShot(makeShot(), b, 9, true).kick).toBe(0);
  b.phaseAt = 5;
  expect(cameraShot(makeShot(), b, 5.1, true).fov).toBeGreaterThan(t1.fov + 5);
});

test("monster: advances through a windup, recoils when hit, staggers on a phase change, sinks when it falls", () => {
  const motion = makeMotion();
  expect(monsterMotion(motion, fresh(), 0, true).advanceTarget).toBe(0);
  const b = inPhase("defend", 0);
  expect(monsterMotion(motion, b, 0, true).advanceTarget).toBeCloseTo(ADVANCE);
  b.enemyHitAt = 1;
  expect(monsterMotion(motion, b, 1.05, true).z).toBeLessThan(0);
  const s = fresh();
  s.phaseAt = 1;
  expect(Math.abs(monsterMotion(motion, s, 1.1, false).rz)).toBeGreaterThan(0);
  expect(monsterMotion(motion, s, 1.1, true).y).toBeLessThan(0);
  const w = inPhase("won");
  w.wonAt = 0;
  expect(monsterMotion(motion, w, 2, true).y).toBeLessThan(-0.2);
});
