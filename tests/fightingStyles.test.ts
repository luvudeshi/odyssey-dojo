// Karate, Kung Fu and the Boxer's uppercut: each strike fires on its full motion and on nothing less.
import { expect, test } from "vitest";
import { startFight, step } from "../src/combat/engine";
import type { CombatState, MoveDef, PoseFrame, PoseHistory } from "../src/core/types";
import { ENEMIES } from "../src/enemies/registry";
import { createPoseInput } from "../src/input/poseInput";
import { MOVES } from "../src/moves/registry";
import { EMPTY_HISTORY, JOINT, pushFrame } from "../src/pose/signals";
import { STYLES } from "../src/styles/registry";
import { frameAt } from "./poseFixture";

const J = JOINT;
type Image = Record<number, readonly [number, number]>;
type World = Record<number, readonly [number, number, number]>;

// World points are metres from the hips: y is negative upward, z is negative toward the camera.
const LEFT_BENT: World = { [J.leftElbow]: [-0.3, -0.35, 0], [J.leftWrist]: [-0.2, -0.45, -0.05] };
const LEFT_OUT: World = { [J.leftElbow]: [-0.2, -0.5, -0.3], [J.leftWrist]: [-0.2, -0.5, -0.6] };
const RIGHT_BENT: World = { [J.rightElbow]: [0.3, -0.35, 0], [J.rightWrist]: [0.2, -0.45, -0.05] };
const RIGHT_OUT: World = { [J.rightElbow]: [0.2, -0.5, -0.3], [J.rightWrist]: [0.2, -0.5, -0.6] };
/** The left fist pulled back to the hip, elbow bent behind it. */
const LEFT_AT_HIP: World = { [J.leftElbow]: [-0.25, -0.25, 0.2], [J.leftWrist]: [-0.22, -0.1, 0] };
/** An arm held out to the side, straight. */
const RIGHT_SIDEWAYS: World = { [J.rightElbow]: [0.5, -0.5, 0], [J.rightWrist]: [0.8, -0.5, 0] };

function standing(): PoseHistory {
  let history = EMPTY_HISTORY;
  for (let i = 0; i < 20; i++) history = pushFrame(history, frameAt(i * 33));
  return history;
}

function after(...frames: PoseFrame[]): PoseHistory {
  return frames.reduce(pushFrame, standing());
}

function pose(t: number, image: Image, world: World = {}): PoseFrame {
  return frameAt(t, image, world);
}

const get = (id: string): MoveDef => {
  const move = MOVES.get(id);
  if (!move) throw new Error(`no move ${id}`);
  return move;
};

/** The full motion for each new strike, as frames after standing still. */
const MOTIONS: Record<string, readonly PoseFrame[]> = {
  reverse_punch: [
    pose(700, {}, { ...RIGHT_BENT, ...LEFT_AT_HIP }),
    pose(900, { [J.leftWrist]: [0.42, 0.6] }, { ...RIGHT_OUT, ...LEFT_AT_HIP }),
  ],
  knife_hand: [
    pose(700, { [J.rightWrist]: [0.44, 0.33] }, RIGHT_BENT),
    pose(950, { [J.rightWrist]: [0.78, 0.36] }, RIGHT_SIDEWAYS),
  ],
  hammer_fist: [pose(700, { [J.leftWrist]: [0.42, 0.08] }), pose(950, { [J.leftWrist]: [0.44, 0.45] })],
  double_palm: [
    pose(700, { [J.leftWrist]: [0.47, 0.4], [J.rightWrist]: [0.53, 0.4] }, { ...LEFT_BENT, ...RIGHT_BENT }),
    pose(900, { [J.leftWrist]: [0.47, 0.36], [J.rightWrist]: [0.53, 0.36] }, { ...LEFT_OUT, ...RIGHT_OUT }),
  ],
  chain_punch: [
    pose(700, {}, { ...LEFT_BENT, ...RIGHT_BENT }),
    pose(850, {}, { ...LEFT_OUT, ...RIGHT_BENT }),
    pose(1000, {}, { ...LEFT_BENT, ...RIGHT_BENT }),
    pose(1150, {}, { ...LEFT_BENT, ...RIGHT_OUT }),
  ],
  rising_palm: [pose(700, {}), pose(900, { [J.leftWrist]: [0.47, 0.27] }, LEFT_BENT)],
  uppercut: [pose(700, {}), pose(900, { [J.rightWrist]: [0.53, 0.27] }, RIGHT_BENT)],
};
const NEW_MOVES = Object.keys(MOTIONS);

test("each new strike fires once on its full motion", () => {
  for (const id of NEW_MOVES) {
    const move = get(id);
    const read = createPoseInput(new Map([[id, move]]));
    let history = standing();
    expect(read(history).struck, id).toEqual([]);
    for (const frame of MOTIONS[id] ?? []) {
      history = pushFrame(history, frame);
      if (frame !== MOTIONS[id]?.at(-1)) expect(read(history).struck, `${id} fired early`).toEqual([]);
    }
    expect(read(history).struck.map((strike) => strike.move), id).toEqual([id]);
    expect(read(history).struck, `${id} fired twice`).toEqual([]);
  }
});

test("no new strike fires while standing still or holding a guard", () => {
  const guard = pose(700, { [J.leftWrist]: [0.47, 0.22], [J.rightWrist]: [0.53, 0.22] }, { ...LEFT_BENT, ...RIGHT_BENT });
  let held = standing();
  for (let t = 700; t < 2400; t += 100) held = pushFrame(held, { ...guard, t });
  for (const id of NEW_MOVES) {
    expect(get(id).detect(standing()), `${id} standing`).toBe(0);
    expect(get(id).detect(held), `${id} holding a guard`).toBe(0);
  }
});

test("half a motion is not enough", () => {
  // A cross with the left arm hanging is not a reverse punch.
  expect(get("reverse_punch").detect(after(pose(700, {}, RIGHT_BENT), pose(900, {}, RIGHT_OUT)))).toBe(0);
  // An arm already out to the side, with no chamber across the body, is not a knife hand.
  const sideways = pose(700, { [J.rightWrist]: [0.78, 0.36] }, RIGHT_SIDEWAYS);
  expect(get("knife_hand").detect(after(sideways, { ...sideways, t: 1400 }))).toBe(0);
  // A hand lowered from shoulder height was never overhead.
  expect(get("hammer_fist").detect(after(pose(700, { [J.leftWrist]: [0.42, 0.33] }), pose(950, {})))).toBe(0);
  // Both arms thrust out shoulder-width apart is a spear thrust, not a double palm.
  const apart = after(pose(700, {}, { ...LEFT_BENT, ...RIGHT_BENT }), pose(900, {}, { ...LEFT_OUT, ...RIGHT_OUT }));
  expect(get("double_palm").detect(apart)).toBe(0);
  expect(get("spear_thrust").detect(apart)).toBe(1);
  // One punch is a jab, not a chain; and two punches too far apart are not a chain either.
  expect(get("chain_punch").detect(after(pose(700, {}, LEFT_BENT), pose(900, {}, LEFT_OUT)))).toBe(0);
  const slow = after(
    pose(700, {}, { ...LEFT_OUT, ...RIGHT_BENT }),
    pose(900, {}, { ...LEFT_BENT, ...RIGHT_BENT }),
    pose(1650, {}, { ...LEFT_BENT, ...RIGHT_BENT }),
    pose(1750, {}, { ...LEFT_BENT, ...RIGHT_OUT }),
  );
  expect(get("chain_punch").detect(slow)).toBe(0);
  // A hand raised slowly, or already resting high, did not rise from the waist just now.
  const high = pose(700, { [J.rightWrist]: [0.53, 0.27] }, RIGHT_BENT);
  expect(get("uppercut").detect(after(high, { ...high, t: 1300 }))).toBe(0);
  expect(get("rising_palm").detect(after(pose(700, {}), pose(900, { [J.rightWrist]: [0.53, 0.27] }, RIGHT_BENT)))).toBe(0);
});

test("the existing strikes still read as themselves with the new moves loaded", () => {
  const read = createPoseInput(MOVES);
  const jab = after(pose(700, {}, LEFT_BENT), pose(900, {}, LEFT_OUT));
  expect(read(jab).struck.map((strike) => strike.move)).toEqual(["jab"]);
});

test("every style, old and new, has real strikes, a blurb and a unique id; every move has a unique key and id", () => {
  expect(STYLES.map((style) => style.id).sort()).toEqual(["boxer", "hoplite", "karate", "kung_fu", "pankration"]);
  expect(new Set(STYLES.map((style) => style.id)).size).toBe(STYLES.length);
  for (const style of STYLES) {
    expect(style.blurb.length, style.id).toBeGreaterThan(10);
    for (const id of style.strikes) expect(MOVES.get(id)?.kind, `${style.id}/${id}`).toBe("strike");
  }
  expect(STYLES.find((style) => style.id === "boxer")?.strikes).toContain("uppercut");
  const keys = [...MOVES.values()].map((move) => move.key);
  expect(new Set(keys).size).toBe(keys.length);
  for (const id of NEW_MOVES) {
    const move = get(id);
    expect(move.teaches?.length ?? 0, id).toBeGreaterThan(20);
    expect(move.key, id).toMatch(/^[a-z]$/);
    for (const point of [move.diagram.leftElbow, move.diagram.leftWrist, move.diagram.rightElbow, move.diagram.rightWrist]) {
      for (const value of point) expect(value >= 0 && value <= 100, `${id} diagram`).toBe(true);
    }
  }
});

test("a keyboard fight can be won in every style against every enemy, and only asks for that style's strikes", () => {
  for (const style of STYLES) {
    for (const enemy of ENEMIES) {
      let state: CombatState = startFight(enemy, 7);
      const asked = new Set<string>();
      for (let i = 0; i < 200000 && state.phase.kind !== "won" && state.phase.kind !== "lost"; i++) {
        const phase = state.phase;
        const held = new Set(phase.kind === "defend" ? [phase.attack.counter] : []);
        const wanted = phase.kind === "strike" || phase.kind === "finisher" ? phase.move : null;
        if (phase.kind === "strike") asked.add(phase.move);
        const struck = wanted === null ? [] : [{ move: wanted, quality: 0.7, player: 0 as const }];
        state = step(state, enemy, style, { held, struck }, 50).state;
      }
      expect(state.phase.kind, `${style.id} vs ${enemy.id}`).toBe("won");
      expect(asked.size, `${style.id} vs ${enemy.id}`).toBeGreaterThan(0);
      for (const move of asked) expect(style.strikes, `${style.id} vs ${enemy.id}`).toContain(move);
    }
  }
});
