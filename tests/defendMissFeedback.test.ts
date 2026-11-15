// Feedback for a defend that failed, or counted late, read from the frames of the attack's warning. Every body
// here is drawn with tests/helpers/poses.ts: none was recorded from a camera.
import { describe, expect, test } from "vitest";
import {
  BEAT_TIP, HOLD_TIP, REACT_TIP, defendMissFeedback, defendTimingFeedback, missTipsFor,
} from "../src/coach/extra/defendMissFeedback";
import { FEEDBACK_POINTS, TIP_MAX, strikeFeedback } from "../src/coach/extra/strikeFeedback";
import type { PoseFrame, PoseHistory } from "../src/core/types";
import { MOVES } from "../src/moves/registry";
import { JOINT } from "../src/pose/signals";
import { DOWN, GUARD, NEUTRAL, histories, pose, sequence, withLegs } from "./helpers/poses";
import type { Key, Pose } from "./helpers/poses";

/** sequence() starts the keys after 20 still frames of 33 ms: the warning is shown then, and lasts WARNING_MS. */
const START = 20 * 33;
const WARNING_MS = 1200;
const END = START + WARNING_MS;
const NEEDS = { grade: "NEEDS IMPROVEMENT", points: FEEDBACK_POINTS["NEEDS IMPROVEMENT"] } as const;
const DEFEND_IDS = [...MOVES.values()].filter((move) => move.kind === "defend").map((move) => move.id).sort();
const LEG_WORDS = /knee|step|leg|foot|feet/i;

const BLOCK = pose(GUARD);
const HALF_GUARD = pose({ ...GUARD, elbow: [0.4, 0.52], wrist: [0.44, 0.46] });
const duck = (dy = 0.12): Pose => pose(DOWN, DOWN, 0, dy);
const dodge = (dx: number): Pose => pose(DOWN, DOWN, dx, 0);
const jump = (dy = 0.12): Pose => pose(DOWN, DOWN, 0, -dy);

/** All the frames, with the baseline the fight would have set from the first still ones. */
function played(keys: readonly Key[], edit: (frame: PoseFrame) => PoseFrame = (frame) => frame): PoseHistory {
  const frames = sequence(keys).map(edit);
  return { frames, baseline: histories(frames).at(-1)?.baseline ?? null };
}
/** Still until `at` ms into the warning, the move 200 ms later, held until 1700 ms (past the hit). */
const madeAt = (to: Pose, at: number, from: Pose = NEUTRAL): PoseHistory =>
  played([{ t: 0, pose: from }, { t: at, pose: from }, { t: at + 200, pose: to }, { t: 1700, pose: to }]);
const still = (body: Pose = NEUTRAL): PoseHistory => played([{ t: 0, pose: body }, { t: 1700, pose: body }]);
const miss = (id: string, history: PoseHistory | null): ReturnType<typeof defendMissFeedback> =>
  defendMissFeedback(id, history, START, END);

describe("a defend that failed says what went wrong", () => {
  test.each(DEFEND_IDS)("%s: never moved, React sooner", (id) => {
    expect(miss(id, still())).toEqual({ ...NEEDS, tip: REACT_TIP });
  });

  test.each([
    ["block", BLOCK], ["duck", duck()], ["dodge_left", dodge(-0.12)], ["dodge_right", dodge(0.12)], ["jump", jump()],
  ] as const)("%s made only after the attack landed: A beat sooner", (id, body) => {
    expect(miss(id, madeAt(body, 1250))).toEqual({ ...NEEDS, tip: BEAT_TIP });
  });

  test("a guard made early and let go before the hit: hold it", () => {
    const history = played([{ t: 0, pose: NEUTRAL }, { t: 200, pose: BLOCK }, { t: 500, pose: BLOCK }, { t: 700, pose: NEUTRAL }, { t: 1700, pose: NEUTRAL }]);
    expect(miss("block", history)).toEqual({ ...NEEDS, tip: HOLD_TIP });
  });

  test.each([
    ["dodge_left", dodge(0.12), "Other way: dodge left"],
    ["dodge_right", dodge(-0.12), "Other way: dodge right"],
    ["block", duck(), "Block, don't duck"],
    ["duck", BLOCK, "Duck, don't block"],
    ["duck", dodge(0.12), "Duck, don't dodge"],
    ["jump", duck(), "Jump, don't duck"],
    ["dodge_left", BLOCK, "Dodge, don't block"],
  ] as const)("asked for %s, made something else: %s", (id, body, tip) => {
    expect(miss(id, madeAt(body, 200))).toEqual({ ...NEEDS, tip });
  });

  test.each([
    ["block", HALF_GUARD, "Hands too low"],
    ["dodge_left", dodge(-0.025), "Lean further left"],
    ["dodge_right", dodge(0.025), "Lean further right"],
    ["duck", duck(0.03), "Duck lower"],
    ["jump", jump(0.02), "Jump higher"],
  ] as const)("%s made too little, waist up: the body tip (%s)", (id, body, tip) => {
    expect(miss(id, madeAt(body, 200))).toEqual({ ...NEEDS, tip });
  });

  test.each([
    ["dodge_right", dodge(0.025), "Step further right"],
    ["duck", duck(0.03), "Bend your knees deeper"],
  ] as const)("%s made too little with the legs in view: the leg tip (%s)", (id, body, tip) => {
    expect(miss(id, madeAt(withLegs(body), 200, withLegs(NEUTRAL)))).toEqual({ ...NEEDS, tip });
  });

  test("every tip fits the flash, and no leg tip for a waist-up player", () => {
    const bodies = [NEUTRAL, BLOCK, HALF_GUARD, duck(), duck(0.03), dodge(0.12), dodge(-0.12), dodge(0.025), jump(), jump(0.02)];
    for (const id of DEFEND_IDS) {
      for (const body of bodies) {
        for (const at of [200, 1250]) {
          const { tip } = miss(id, madeAt(body, at));
          expect(tip, `${id} ${String(at)}`).not.toBeNull();
          expect(tip?.length).toBeLessThanOrEqual(TIP_MAX);
          expect(tip).not.toMatch(LEG_WORDS);
          expect(missTipsFor(id)).toContain(tip);
        }
      }
    }
  });
});

describe("a defend that counted, and when", () => {
  test("made early and clean: strikeFeedback's word, no timing note", () => {
    const history = madeAt(BLOCK, 200);
    const result = defendTimingFeedback("block", history, START, END);
    expect(result.tip).toBeNull();
    expect(result.grade).toBe("EXCELLENT");
  });

  test.each([
    ["block", BLOCK], ["duck", duck()], ["dodge_left", dodge(-0.12)], ["dodge_right", dodge(0.12)], ["jump", jump(0.15)],
  ] as const)("%s made clean in the last quarter: one grade down, React sooner", (id, body) => {
    const early = defendTimingFeedback(id, madeAt(body, 100), START, END);
    const late = defendTimingFeedback(id, madeAt(body, 950), START, END);
    if (early.tip !== null) return expect(late.tip).toBe(early.tip);
    expect(early.grade).toBe("EXCELLENT");
    expect(late).toEqual({ grade: "GREAT", points: FEEDBACK_POINTS.GREAT, tip: REACT_TIP });
  });

  test("a late defend with something to fix keeps that tip, not the timing note", () => {
    const result = defendTimingFeedback("block", madeAt(HALF_GUARD, 950), START, END);
    expect(result.tip).not.toBe(REACT_TIP);
  });
});

describe("with no body to read", () => {
  test.each(DEFEND_IDS)("%s on the keyboard: a grade, no tip", (id) => {
    expect(miss(id, null)).toEqual({ ...NEEDS, tip: null });
    expect(miss(id, undefined as unknown as null)).toEqual({ ...NEEDS, tip: null });
    expect(defendTimingFeedback(id, null, START, END)).toEqual(strikeFeedback(id, null));
  });

  test("shoulders not seen: no tip", () => {
    const dim = (frame: PoseFrame): PoseFrame => ({
      ...frame,
      image: frame.image.map((point, index) => (index === JOINT.leftShoulder || index === JOINT.rightShoulder ? { ...point, visibility: 0.1 } : point)),
    });
    expect(miss("block", played([{ t: 0, pose: NEUTRAL }, { t: 1700, pose: BLOCK }], dim))).toEqual({ ...NEEDS, tip: null });
  });

  test("wrists not seen: still a tip, never a throw", () => {
    const dim = (frame: PoseFrame): PoseFrame => ({
      ...frame,
      image: frame.image.map((point, index) => (index === JOINT.leftWrist || index === JOINT.rightWrist ? { ...point, visibility: 0.1 } : point)),
    });
    const result = miss("block", played([{ t: 0, pose: NEUTRAL }, { t: 1700, pose: NEUTRAL }], dim));
    expect(result.grade).toBe("NEEDS IMPROVEMENT");
    expect(result.tip).toBe(REACT_TIP);
  });

  test("odd input never throws", () => {
    const history = still();
    expect(miss("not_a_move", history)).toEqual({ ...NEEDS, tip: REACT_TIP });
    expect(defendMissFeedback("block", history, END, START)).toEqual({ ...NEEDS, tip: null });
    expect(defendMissFeedback("block", history, Number.NaN, END)).toEqual({ ...NEEDS, tip: null });
    expect(defendMissFeedback("block", { frames: [], baseline: null }, START, END)).toEqual({ ...NEEDS, tip: null });
    expect(() => defendTimingFeedback("block", { frames: history.frames, baseline: null }, START, END)).not.toThrow();
  });
});

describe("every defend in the registry", () => {
  test.each(DEFEND_IDS)("%s gets a non-empty miss tip that fits", (id) => {
    const tips = missTipsFor(id);
    expect(tips.length).toBeGreaterThan(0);
    for (const tip of tips) expect(tip.length).toBeLessThanOrEqual(TIP_MAX);
    expect(miss(id, still()).tip).toBeTruthy();
    expect(miss(id, madeAt(BLOCK, 200)).tip).toBeTruthy();
  });
});

