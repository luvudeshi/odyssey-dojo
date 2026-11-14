// The front kick and the knee: each fires once on its full motion, on either leg, and on nothing less.
import { expect, test } from "vitest";
import { startFight, step } from "../src/combat/engine";
import type { CombatState, FightingStyle, PoseFrame, PoseHistory } from "../src/core/types";
import { ENEMIES } from "../src/enemies/registry";
import { createPoseInput } from "../src/input/poseInput";
import { move as frontKick } from "../src/moves/defs/frontKick";
import { move as knee } from "../src/moves/defs/knee";
import type { Side } from "../src/moves/handSignals";
import { KICK_IDS, legsVisible, styleForLegs } from "../src/moves/legSignals";
import { MOVES } from "../src/moves/registry";
import { EMPTY_HISTORY, JOINT, pushFrame } from "../src/pose/signals";
import { style as pankration } from "../src/styles/defs/pankration";
import { frameAt } from "./poseFixture";

const J = JOINT;
type Image = Record<number, readonly [number, number]>;
type World = Record<number, readonly [number, number, number]>;
/** One leg's knee and ankle: height in the picture, then world height and depth (negative is toward the camera). */
type Shape = readonly [kneeY: number, ankleY: number, knee: readonly [number, number], ankle: readonly [number, number]];

const DOWN: Shape = [0.8, 0.95, [0.45, 0], [0.88, 0]];
const HALF_UP: Shape = [0.76, 0.9, [0.35, -0.2], [0.75, -0.1]];
const CHAMBER: Shape = [0.67, 0.8, [0.05, -0.4], [0.4, -0.3]];
const KICK: Shape = [0.66, 0.68, [0.05, -0.42], [0, -0.85]];
const LOW_KICK: Shape = [0.72, 0.8, [0.2, -0.38], [0.5, -0.6]];
const KNEE_UP: Shape = [0.62, 0.78, [-0.05, -0.42], [0.3, -0.35]];
const LOW_KNEE: Shape = [0.69, 0.82, [0.1, -0.38], [0.48, -0.2]];
const LEFT_BENT: World = { [J.leftElbow]: [-0.3, -0.35, 0], [J.leftWrist]: [-0.2, -0.45, -0.05] };
const LEFT_OUT: World = { [J.leftElbow]: [-0.2, -0.5, -0.3], [J.leftWrist]: [-0.2, -0.5, -0.6] };

/** A frame with both legs in view: `side` leg in `shape`, the other standing. */
function legs(t: number, shape: Shape = DOWN, side: Side = "right", image: Image = {}, world: World = {}): PoseFrame {
  const left = side === "left" ? shape : DOWN;
  const right = side === "right" ? shape : DOWN;
  return frameAt(
    t,
    {
      [J.leftKnee]: [0.45, left[0]], [J.leftAnkle]: [0.45, left[1]],
      [J.rightKnee]: [0.55, right[0]], [J.rightAnkle]: [0.55, right[1]],
      ...image,
    },
    {
      [J.leftHip]: [-0.1, 0, 0], [J.rightHip]: [0.1, 0, 0],
      [J.leftKnee]: [-0.1, ...left[2]], [J.leftAnkle]: [-0.1, ...left[3]],
      [J.rightKnee]: [0.1, ...right[2]], [J.rightAnkle]: [0.1, ...right[3]],
      ...world,
    },
  );
}

function after(...frames: PoseFrame[]): PoseHistory {
  let history = EMPTY_HISTORY;
  for (let i = 0; i < 20; i++) history = pushFrame(history, legs(i * 33));
  return frames.reduce(pushFrame, history);
}

function hidden(frame: PoseFrame, index: number): PoseFrame {
  return { ...frame, image: frame.image.map((point, i) => (i === index ? { ...point, visibility: 0.2 } : point)) };
}

/** Everything the reader says was struck while the frames are fed one at a time. */
function thrown(frames: readonly PoseFrame[], moves = MOVES): { struck: string[]; held: string[] } {
  const read = createPoseInput(moves);
  let history = after();
  const struck = read(history).struck.map((strike) => strike.move);
  const held = new Set<string>();
  for (const frame of frames) {
    history = pushFrame(history, frame);
    const input = read(history);
    struck.push(...input.struck.map((strike) => strike.move));
    input.held.forEach((id) => held.add(id));
  }
  return { struck, held: [...held] };
}

const kickMotion = (side: Side): PoseFrame[] => [legs(700, CHAMBER, side), legs(850, KICK, side)];
const kneeMotion = (side: Side): PoseFrame[] => [legs(700, KNEE_UP, side), legs(850, KNEE_UP, side)];
const holdFor = (shape: Shape, from: number): PoseFrame[] =>
  Array.from({ length: 18 }, (_, i) => legs(from + i * 100, shape));

test("each kick fires exactly once on its full motion, on either leg, and not on the first half", () => {
  for (const side of ["left", "right"] as const) {
    for (const [move, motion, end] of [[frontKick, kickMotion(side), KICK], [knee, kneeMotion(side), KNEE_UP]] as const) {
      const only = new Map([[move.id, move]]);
      expect(thrown(motion.slice(0, 1), only).struck, `${move.id} ${side} early`).toEqual([]);
      expect(thrown(motion, only).struck, `${move.id} ${side}`).toEqual([move.id]);
      expect(thrown([...motion, ...holdFor(end, 900).map((f) => legs(f.t, end, side))], only).struck).toEqual([move.id]);
    }
  }
});

test("standing still, or a leg already held up with no wind-up, fires nothing", () => {
  expect(thrown([legs(700), legs(800)]).struck).toEqual([]);
  for (const shape of [KICK, KNEE_UP, CHAMBER]) {
    const held = after(...holdFor(shape, 700));
    expect(frontKick.detect(held)).toBe(0);
    expect(knee.detect(held)).toBe(0);
  }
  // A straight leg swung up with no chamber is not a front kick, and a chamber from long ago does not count.
  expect(frontKick.detect(after(legs(700, HALF_UP), legs(850, KICK)))).toBe(0);
  expect(frontKick.detect(after(legs(700, CHAMBER), legs(900, CHAMBER), legs(1450, KICK)))).toBe(0);
  expect(frontKick.detect(after(legs(700, CHAMBER), legs(1150, KICK)))).toBe(1);
});

test("a duck, with the hips dropping and both knees bending, is a duck and not a kick", () => {
  const duck = (t: number): PoseFrame =>
    legs(
      t,
      DOWN,
      "right",
      {
        [J.nose]: [0.5, 0.3], [J.leftShoulder]: [0.42, 0.45], [J.rightShoulder]: [0.58, 0.45],
        [J.leftElbow]: [0.4, 0.6], [J.rightElbow]: [0.6, 0.6], [J.leftWrist]: [0.4, 0.72], [J.rightWrist]: [0.6, 0.72],
        [J.leftHip]: [0.45, 0.74], [J.rightHip]: [0.55, 0.74], [J.leftKnee]: [0.43, 0.81], [J.rightKnee]: [0.57, 0.81],
      },
      {
        [J.leftKnee]: [-0.12, 0.3, -0.25], [J.rightKnee]: [0.12, 0.3, -0.25],
        [J.leftAnkle]: [-0.1, 0.6, 0], [J.rightAnkle]: [0.1, 0.6, 0],
      },
    );
  const result = thrown([duck(700), duck(850), duck(1000), legs(1150), duck(1300), duck(1450)]);
  expect(result.struck).toEqual([]);
  expect(result.held).toEqual(["duck"]);
});

test("a front kick is not a knee, a knee is not a front kick, and neither is a hand strike", () => {
  expect(thrown(kickMotion("right")).struck).toEqual(["front_kick"]);
  expect(thrown(kickMotion("left")).struck).toEqual(["front_kick"]);
  expect(thrown(kneeMotion("right")).struck).toEqual(["knee"]);
  expect(thrown(kneeMotion("left")).struck).toEqual(["knee"]);
  // The kick coming back down through the chamber does not turn into a knee.
  expect(thrown([...kickMotion("right"), legs(950, CHAMBER), legs(1050)]).struck).toEqual(["front_kick"]);
  // A jab thrown with the legs in view is still only a jab.
  const jab = [legs(700, DOWN, "right", {}, LEFT_BENT), legs(900, DOWN, "right", {}, LEFT_OUT)];
  expect(thrown(jab).struck).toEqual(["jab"]);
});

test("no kick is read when the tracker cannot see the knees and ankles", () => {
  expect(legsVisible(legs(0))).toBe(true);
  expect(legsVisible(frameAt(0))).toBe(false);
  expect(legsVisible(legs(0, DOWN, "right", { [J.leftAnkle]: [0.45, 1.08] }))).toBe(false);
  for (const index of [J.leftKnee, J.rightKnee, J.leftAnkle, J.rightAnkle]) {
    expect(legsVisible(hidden(legs(0), index))).toBe(false);
    const kick = kickMotion("right").map((frame) => hidden(frame, index));
    const kneed = kneeMotion("right").map((frame) => hidden(frame, index));
    expect(frontKick.detect(after(...kick))).toBe(0);
    expect(knee.detect(after(...kneed))).toBe(0);
  }
  // Hidden only at the finish, or only at the wind-up, is still not a kick.
  const [chamber, finish] = kickMotion("right");
  if (!chamber || !finish) throw new Error("no kick motion");
  expect(frontKick.detect(after(chamber, hidden(finish, J.rightAnkle)))).toBe(0);
  expect(frontKick.detect(after(hidden(chamber, J.rightAnkle), finish))).toBe(0);
  expect(frontKick.detect(after(chamber, finish))).toBe(1);
});

test("a faster, higher kick rates higher, and quality stays between 0 and 1", () => {
  const pairs = [
    [frontKick, after(legs(700, CHAMBER), legs(800, KICK)), after(legs(700, CHAMBER), legs(1150, LOW_KICK))],
    [
      knee,
      after(legs(700, KNEE_UP), legs(850, KNEE_UP)),
      after(legs(700, HALF_UP), legs(900, HALF_UP), legs(1050, LOW_KNEE), legs(1200, LOW_KNEE)),
    ],
  ] as const;
  for (const [move, good, poor] of pairs) {
    expect(move.detect(good), move.id).toBe(1);
    expect(move.detect(poor), move.id).toBe(1);
    const high = move.quality?.(good) ?? -1;
    const low = move.quality?.(poor) ?? -1;
    expect(high, move.id).toBeGreaterThan(low + 0.2);
    for (const value of [high, low]) {
      expect(value, move.id).toBeGreaterThanOrEqual(0.4);
      expect(value, move.id).toBeLessThanOrEqual(1);
    }
    expect(move.quality?.(EMPTY_HISTORY), move.id).toBe(0);
    expect(move.quality?.(after()), move.id).toBe(0);
  }
  // Speed and height each count on their own.
  const rate = (move: typeof knee, ...frames: PoseFrame[]): number => move.quality?.(after(...frames)) ?? -1;
  const snap = rate(frontKick, legs(700, CHAMBER), legs(800, KICK));
  expect(snap).toBeGreaterThan(rate(frontKick, legs(700, CHAMBER), legs(1150, KICK)));
  expect(snap).toBeGreaterThan(rate(frontKick, legs(700, CHAMBER), legs(800, [0.7, 0.78, KICK[2], KICK[3]])));
  const drive = rate(knee, legs(700, KNEE_UP), legs(850, KNEE_UP));
  expect(drive).toBeGreaterThan(rate(knee, legs(700, LOW_KNEE), legs(850, LOW_KNEE)));
  expect(drive).toBeGreaterThan(rate(knee, legs(700, HALF_UP), legs(1000, KNEE_UP), legs(1150, KNEE_UP)));
});

test("the kicks have their own keys, a teaching line and leg points; Pankration names real strikes", () => {
  const keys = [...MOVES.values()].map((move) => move.key);
  expect(new Set(keys).size).toBe(keys.length);
  for (const move of [frontKick, knee]) {
    expect(MOVES.get(move.id), move.id).toBe(move);
    expect(move.kind).toBe("strike");
    expect(move.key, move.id).toMatch(/^[a-pr-z]$/);
    expect(move.teaches?.length ?? 0, move.id).toBeGreaterThan(20);
    expect(KICK_IDS).toContain(move.id);
    const points = [move.diagram.rightKnee, move.diagram.rightFoot, move.diagram.leftElbow, move.diagram.rightWrist];
    for (const point of points) {
      expect(point, move.id).toBeDefined();
      for (const value of point ?? []) expect(value >= 0 && value <= 100, `${move.id} diagram`).toBe(true);
    }
  }
  for (const id of pankration.strikes) expect(MOVES.get(id)?.kind, id).toBe("strike");
  for (const id of KICK_IDS) expect(pankration.strikes).toContain(id);
  const hands = styleForLegs(pankration, false);
  expect(styleForLegs(pankration, true)).toBe(pankration);
  expect(hands.strikes.length).toBeGreaterThan(0);
  expect(hands.strikes.some((id) => KICK_IDS.includes(id))).toBe(false);
  // A style with no kicks is left alone, and a style of only kicks keeps them, so there is always a strike to ask for.
  const kicksOnly: FightingStyle = { ...pankration, strikes: ["front_kick", "knee"] };
  expect(styleForLegs(kicksOnly, false)).toBe(kicksOnly);
});

/** Plays keyboard fights against every enemy and returns the strikes that were asked for. */
function askedIn(style: FightingStyle): Set<string> {
  const asked = new Set<string>();
  for (const enemy of ENEMIES) {
    for (const seed of [7, 99, 1234]) {
      let state: CombatState = startFight(enemy, seed);
      for (let i = 0; i < 200000 && state.phase.kind !== "won" && state.phase.kind !== "lost"; i++) {
        const phase = state.phase;
        const held = new Set(phase.kind === "defend" ? [phase.attack.counter] : []);
        const wanted = phase.kind === "strike" || phase.kind === "finisher" ? phase.move : null;
        if (phase.kind === "strike") asked.add(phase.move);
        const struck = wanted === null ? [] : [{ move: wanted, quality: 0.7, player: 0 as const }];
        state = step(state, enemy, style, { held, struck }, 50).state;
      }
      expect(state.phase.kind, `${style.id} vs ${enemy.id}`).toBe("won");
    }
  }
  return asked;
}

test("Pankration is asked for kicks and hand strikes; with the legs out of view, only hand strikes", () => {
  const whole = askedIn(pankration);
  for (const id of pankration.strikes) expect([...whole], id).toContain(id);
  const hands = askedIn(styleForLegs(pankration, false));
  expect(hands.size).toBeGreaterThan(0);
  for (const id of hands) expect(KICK_IDS, id).not.toContain(id);
  // Against every enemy on main, every weak spot leaves a Pankration player a hand strike to throw.
  for (const enemy of ENEMIES) {
    for (const spot of enemy.weakSpots) {
      const fitting = spot.moves.filter((id) => pankration.strikes.includes(id));
      const pool = fitting.length > 0 ? fitting : pankration.strikes;
      expect(pool.some((id) => !KICK_IDS.includes(id)), `${enemy.id}/${spot.id}`).toBe(true);
    }
  }
});
