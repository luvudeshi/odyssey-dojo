// The fight's move feedback: made-up bodies in, a grade, points and one tip out.
import { describe, expect, test } from "vitest";
import { FEEDBACK_POINTS, FEEDBACK_RULES, TIP_MAX, strikeFeedback, tipsFor } from "../src/coach/extra/strikeFeedback";
import type { PoseFrame, PoseHistory } from "../src/core/types";
import { ENEMIES } from "../src/enemies/registry";
import { MOVES } from "../src/moves/registry";
import { EMPTY_HISTORY, JOINT, pushFrame } from "../src/pose/signals";
import { STYLES } from "../src/styles/registry";
import { LEFT_OUT, READY, RIGHT_OUT, STANDING, frameAt, pose, recording } from "./poseFixture";
import type { BodyPose } from "./poseFixture";

const J = JOINT;

/** The history the fight has just as a move made from READY (or `from`) counts: the swing, then a short hold. */
function made(to: BodyPose, from: BodyPose = READY): PoseHistory {
  return recording([[from, 300], [to, 130], [to, 70]]).reduce(pushFrame, EMPTY_HISTORY);
}

/** The same frames with `side`'s shoulder turned toward the camera, as the hips and shoulders turn into a punch. */
function turned(history: PoseHistory, side: "left" | "right"): PoseHistory {
  const front = side === "left" ? J.leftShoulder : J.rightShoulder;
  const back = side === "left" ? J.rightShoulder : J.leftShoulder;
  const frames = history.frames.map((frame) => ({
    ...frame,
    world: frame.world.map((point, i) => (i === front ? { ...point, z: point.z - 0.06 } : i === back ? { ...point, z: point.z + 0.06 } : point)),
  }));
  return { ...history, frames };
}

/** Left and right swapped: the same move made with the other hand. */
function mirrored(body: BodyPose): BodyPose {
  const flip = ([x, y, z]: readonly [number, number, number]) => [-x, y, z] as const;
  return { ...body, leftUpper: flip(body.rightUpper), leftFore: flip(body.rightFore), rightUpper: flip(body.leftUpper), rightFore: flip(body.leftFore) };
}

const HALF_LEFT = { leftUpper: [0.1, 0.6, -1], leftFore: [0.1, -0.6, -1] } as const;
const HALF_RIGHT = { rightUpper: [-0.1, 0.6, -1], rightFore: [-0.1, -0.6, -1] } as const;
const HOOK_LEFT = { leftUpper: [-0.3, 0.1, -1], leftFore: [1, 0, -0.3] } as const;
const UPPERCUT = { rightUpper: [0.05, 0.3, -1], rightFore: [-0.1, -1, -0.3] } as const;
const GUARD = pose({ leftUpper: [0.1, 0.6, -0.8], leftFore: [0.3, -1, 0.2], rightUpper: [-0.1, 0.6, -0.8], rightFore: [-0.3, -1, 0.2] });

describe("a clean move is praised and gets no tip", () => {
  const clean: readonly (readonly [string, PoseHistory])[] = [
    ["jab", made(pose(LEFT_OUT, READY))],
    ["cross", turned(made(pose(RIGHT_OUT, READY)), "right")],
    ["hook", turned(made(pose(HOOK_LEFT, READY)), "left")],
    ["uppercut", made(pose(UPPERCUT, READY))],
    ["block", made(GUARD)],
    ["duck", made(pose({ drop: 0.2 }, READY))],
    ["dodge_left", made(pose({ step: -0.3 }, READY))],
    ["dodge_right", made(pose({ step: 0.3 }, READY))],
  ];
  test.each(clean)("%s", (move, history) => {
    const feedback = strikeFeedback(move, history, 0.85);
    expect(feedback.tip).toBeNull();
    expect(feedback.grade).toBe("EXCELLENT");
    expect(feedback.points).toBe(FEEDBACK_POINTS.EXCELLENT);
  });

  test("clean but slow is GREAT, still with no tip", () => {
    expect(strikeFeedback("jab", made(pose(LEFT_OUT, READY)), 0.6)).toEqual({ grade: "GREAT", points: FEEDBACK_POINTS.GREAT, tip: null });
  });
});

describe("the tip names what the body did", () => {
  test("jab and cross with the other hand hanging: guard hand", () => {
    expect(strikeFeedback("jab", made(pose(LEFT_OUT, STANDING)), 0.85)).toMatchObject({ grade: "GOOD", tip: "Guard hand by your chin" });
    expect(strikeFeedback("cross", turned(made(pose(RIGHT_OUT, STANDING)), "right"), 0.85).tip).toBe("Guard hand by your chin");
  });

  test("jab and cross thrown with a half-bent arm: extend", () => {
    expect(strikeFeedback("jab", made(pose(HALF_LEFT, READY)), 0.85)).toMatchObject({ grade: "GOOD", tip: "Extend your arm fully" });
    expect(strikeFeedback("cross", turned(made(pose(HALF_RIGHT, READY)), "right"), 0.85).tip).toBe("Extend your arm fully");
  });

  test("a cross thrown square to the camera: hips", () => {
    expect(strikeFeedback("cross", made(pose(RIGHT_OUT, READY)), 0.85)).toMatchObject({ grade: "GREAT", tip: "Turn your hips into it" });
  });

  test("a clean shape thrown slowly: speed", () => {
    expect(strikeFeedback("jab", made(pose(LEFT_OUT, READY)), 0.3).tip).toBe("Snap it out faster");
  });

  test("hook with the elbow dropped, either hand", () => {
    const low = pose({ leftUpper: [-0.3, 0.7, -0.8], leftFore: [1, 0, -0.3] }, READY);
    expect(strikeFeedback("hook", made(low), 0.85).tip).toBe("Lift your elbow higher");
    expect(strikeFeedback("hook", made(mirrored(low)), 0.85).tip).toBe("Lift your elbow higher");
    expect(strikeFeedback("hook", made(pose({ ...HOOK_LEFT, rightUpper: STANDING.rightUpper, rightFore: STANDING.rightFore }, READY)), 0.85).tip).toBe("Guard hand by your chin");
  });

  test("uppercut that stops at the chest, or with the guard down", () => {
    const short = pose({ rightUpper: [0.05, 0.6, -0.8], rightFore: [-0.1, -0.3, -1] }, READY);
    expect(strikeFeedback("uppercut", made(short), 0.85).tip).toBe("Drive the fist higher");
    expect(strikeFeedback("uppercut", made(pose(UPPERCUT, STANDING)), 0.85).tip).toBe("Guard hand by your chin");
  });

  test("block with the hands at the chest, or one hand down", () => {
    expect(strikeFeedback("block", made(READY, STANDING))).toMatchObject({ grade: "NEEDS IMPROVEMENT", tip: "Hands too low" });
    expect(strikeFeedback("block", made(pose({ rightUpper: READY.rightUpper, rightFore: READY.rightFore }, GUARD))).tip).toBe("Raise your right hand");
    expect(strikeFeedback("block", made(pose({ leftUpper: READY.leftUpper, leftFore: READY.leftFore }, GUARD))).tip).toBe("Raise your left hand");
  });

  test("a shallow duck, and a duck with the hands down", () => {
    expect(strikeFeedback("duck", made(pose({ drop: 0.09 }, READY))).tip).toBe("Bend your knees deeper");
    expect(strikeFeedback("duck", made(pose({ drop: 0.2 }), STANDING))).toMatchObject({ grade: "GREAT", tip: "Keep your hands up" });
  });

  test("a short dodge, to either side", () => {
    expect(strikeFeedback("dodge_left", made(pose({ step: -0.14 }, READY))).tip).toBe("Step further left");
    expect(strikeFeedback("dodge_right", made(pose({ step: 0.14 }, READY))).tip).toBe("Step further right");
  });

  test("the same tip whether it is read as the move counts or after the hand has come back", () => {
    const after = recording([[READY, 300], [pose(HALF_LEFT, READY), 130], [READY, 200]]).reduce(pushFrame, EMPTY_HISTORY);
    expect(strikeFeedback("jab", after, 0.85).tip).toBe("Extend your arm fully");
  });
});

describe("the knee, read from the legs", () => {
  type Leg = readonly [kneeY: number, ankleY: number, knee: readonly [number, number], ankle: readonly [number, number]];
  const DOWN: Leg = [0.8, 0.95, [0.45, 0], [0.88, 0]];
  const KNEE_UP: Leg = [0.62, 0.78, [-0.05, -0.42], [0.3, -0.35]];
  const LOW_KNEE: Leg = [0.69, 0.82, [0.1, -0.38], [0.48, -0.2]];
  const HANDS_UP = { [J.leftWrist]: [0.44, 0.3], [J.rightWrist]: [0.56, 0.3] } as const;

  function legs(t: number, right: Leg, left: Leg = DOWN, image: Record<number, readonly [number, number]> = HANDS_UP): PoseFrame {
    return frameAt(
      t,
      { [J.leftKnee]: [0.45, left[0]], [J.leftAnkle]: [0.45, left[1]], [J.rightKnee]: [0.55, right[0]], [J.rightAnkle]: [0.55, right[1]], ...image },
      {
        [J.leftHip]: [-0.1, 0, 0], [J.rightHip]: [0.1, 0, 0],
        [J.leftKnee]: [-0.1, ...left[2]], [J.leftAnkle]: [-0.1, ...left[3]],
        [J.rightKnee]: [0.1, ...right[2]], [J.rightAnkle]: [0.1, ...right[3]],
      },
    );
  }
  const kneed = (...last: PoseFrame[]): PoseFrame[] => [legs(0, DOWN), legs(33, DOWN), ...last];

  test("a high, folded knee with the hands up is clean", () => {
    expect(strikeFeedback("knee", kneed(legs(66, KNEE_UP), legs(99, KNEE_UP)), 0.85)).toMatchObject({ grade: "EXCELLENT", tip: null });
  });
  test("a low knee, on either leg", () => {
    expect(strikeFeedback("knee", kneed(legs(66, LOW_KNEE)), 0.85).tip).toBe("Knee higher");
    expect(strikeFeedback("knee", kneed(legs(66, DOWN, LOW_KNEE)), 0.85).tip).toBe("Knee higher");
  });
  test("a good knee with the hands hanging", () => {
    expect(strikeFeedback("knee", kneed(legs(66, KNEE_UP, DOWN, {})), 0.85).tip).toBe("Keep your hands up");
  });
});

describe("every move a fight can ask for has feedback", () => {
  const askable = new Set<string>();
  for (const style of STYLES) style.strikes.forEach((id) => askable.add(id));
  for (const enemy of ENEMIES) {
    enemy.attacks.forEach((attack) => askable.add(attack.counter));
    enemy.weakSpots.forEach((spot) => { spot.moves.forEach((id) => askable.add(id)); });
    if (enemy.finisher) askable.add(enemy.finisher);
  }
  for (const move of MOVES.values()) if (move.kind === "defend") askable.add(move.id);

  test("the fights ask for strikes and defends", () => {
    expect(askable.size).toBeGreaterThanOrEqual(15);
    expect([...askable].every((id) => MOVES.has(id))).toBe(true);
  });

  test.each([...askable].sort())("%s has at least two short tips of its own", (id) => {
    expect(FEEDBACK_RULES[id]).toBeDefined();
    const tips = tipsFor(id);
    expect(tips.length).toBeGreaterThanOrEqual(2);
    for (const tip of tips) {
      expect(tip.length).toBeGreaterThan(0);
      expect(tip.length).toBeLessThanOrEqual(TIP_MAX);
    }
  });

  test("no rule is left over for a move that does not exist", () => {
    expect(Object.keys(FEEDBACK_RULES).filter((id) => !MOVES.has(id))).toEqual([]);
  });
});

describe("with no body to read", () => {
  const empty: PoseFrame = { t: 0, image: [], world: [] };
  const broken = frameAt(0, { [J.leftShoulder]: [NaN, NaN], [J.rightShoulder]: [NaN, NaN] });

  test("nothing throws, and there is no tip", () => {
    for (const id of [...Object.keys(FEEDBACK_RULES), "no_such_move"]) {
      for (const history of [null, undefined, [], [empty], [broken], EMPTY_HISTORY, { frames: [empty, empty], baseline: null }]) {
        expect(strikeFeedback(id, history, 0.7).tip).toBeNull();
        expect(strikeFeedback(id, history).tip).toBeNull();
      }
    }
  });

  test("the grade comes from the strike's quality, on the fight's own lines", () => {
    expect(strikeFeedback("jab", null, 0.95).grade).toBe("EXCELLENT");
    expect(strikeFeedback("jab", null, 0.85).grade).toBe("GREAT");
    expect(strikeFeedback("jab", null, 0.7)).toEqual({ grade: "GOOD", points: 50, tip: null });
    expect(strikeFeedback("jab", null, 0.2).grade).toBe("NEEDS IMPROVEMENT");
    expect(strikeFeedback("block", null).grade).toBe("GOOD");
    expect(strikeFeedback("jab", null, NaN).grade).toBe("GOOD");
  });

  test("a body with nothing but shoulders in view gets a grade and no tip", () => {
    const whole = frameAt(0);
    const frame = { ...whole, image: whole.image.map((point, i) => (i === J.leftShoulder || i === J.rightShoulder ? point : { ...point, visibility: 0 })) };
    for (const id of Object.keys(FEEDBACK_RULES)) expect(strikeFeedback(id, [frame], 0.85).tip).toBeNull();
  });
});

test("points go down with the grade", () => {
  expect(FEEDBACK_POINTS).toEqual({ EXCELLENT: 150, GREAT: 100, GOOD: 50, "NEEDS IMPROVEMENT": 25 });
});
