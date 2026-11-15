// The outline figure for each extra move, in the shape `guideFor` in ../guide.ts returns: a short instruction and
// a looping figure that starts in a guard (strikes) or with the hands down (defends), winds up where the move has
// a wind-up, and ends in the move's own diagram. ../guide.ts has no entry for these moves, so `guideFor` returns
// null for them; `extraGuideFor` is the same call for an extra move.
import type { MoveDef, MoveDiagram } from "../../core/types";
import { GUARD, HANDS_DOWN, LOOP_MS, poseOf } from "../guide";
import type { Guide, GuideEnd, GuideKeyframe } from "../guide";
import { move as elbowStrike } from "./moves/elbowStrike";
import { move as highBlock } from "./moves/highBlock";
import { move as lowBlock } from "./moves/lowBlock";
import { move as lowKick } from "./moves/lowKick";
import { move as palmHeel } from "./moves/palmHeel";
import { move as roundhouseKick } from "./moves/roundhouseKick";
import { move as sideKick } from "./moves/sideKick";
import { move as wristRelease } from "./moves/wristRelease";

/** Where an end pointed at the camera is drawn: see `poseOf`. */
type Forward = NonNullable<Parameters<typeof poseOf>[1]>;

interface Spec {
  /** Three to six plain words. */
  readonly how: string;
  readonly moving: readonly GuideEnd[];
  /** The ends that go toward the camera at the diagram pose. */
  readonly forward?: Forward;
  /** The wind-up, as changes to the start pose, and its ends that point at the camera. */
  readonly before?: Partial<MoveDiagram>;
  readonly beforeForward?: Forward;
  /** True when the wind-up is held for a moment before the move. */
  readonly holdBefore?: boolean;
}

function build(move: MoveDef, spec: Spec): Guide {
  const begin = move.kind === "defend" ? HANDS_DOWN : GUARD;
  const key = (share: number, diagram: MoveDiagram, forward: Forward = {}): GuideKeyframe => {
    const ends = Object.keys(forward) as GuideEnd[];
    return { t: Math.round(share * LOOP_MS), pose: poseOf(diagram, forward), toward: ends.length > 0 ? 1 : 0, forward: ends };
  };
  const start = key(0, begin);
  const end = (share: number): GuideKeyframe => key(share, move.diagram, spec.forward);
  let keyframes: GuideKeyframe[];
  if (spec.before || spec.beforeForward) {
    const wind = (share: number): GuideKeyframe => key(share, { ...begin, ...spec.before }, spec.beforeForward);
    keyframes = spec.holdBefore ? [start, wind(0.18), wind(0.5), end(0.66)] : [start, wind(0.26), end(0.46), end(0.76)];
  } else {
    keyframes = [start, end(0.3), end(0.74)];
  }
  return { title: move.name, how: spec.how, keyframes, loopMs: LOOP_MS, moving: spec.moving };
}

const FOOT: readonly GuideEnd[] = ["rightFoot"];

/** The figure for each extra move, by move id. */
export const EXTRA_GUIDES: Readonly<Record<string, Guide>> = {
  roundhouse_kick: build(roundhouseKick, {
    how: "Knee out, swing foot round", moving: FOOT, forward: { rightFoot: [0.1, -0.08] },
    before: { rightKnee: [72, 62], rightFoot: [76, 76] },
  }),
  side_kick: build(sideKick, {
    how: "Knee up, push foot sideways", moving: FOOT, before: { rightKnee: [58, 60], rightFoot: [56, 78] },
  }),
  low_kick: build(lowKick, { how: "Straight leg, flick foot low", moving: FOOT, forward: { rightFoot: [0.06, -0.62] } }),
  elbow_strike: build(elbowStrike, {
    how: "Fold arm, swing elbow across", moving: ["leftWrist"], before: { leftElbow: [22, 32], leftWrist: [33, 27] },
  }),
  palm_heel: build(palmHeel, { how: "Push open palm at face", moving: ["rightWrist"], forward: { rightWrist: [0.1, 0.2] } }),
  high_block: build(highBlock, { how: "One forearm up over forehead", moving: ["leftWrist"] }),
  low_block: build(lowBlock, {
    how: "Sweep arm down and out", moving: ["rightWrist"], before: { rightElbow: [60, 44], rightWrist: [42, 31] },
  }),
  wrist_release: build(wristRelease, {
    how: "Arm out, fold elbow in", moving: ["leftWrist"], beforeForward: { leftWrist: [0.05, -0.25] }, holdBefore: true,
  }),
};

/** `guideFor` for an extra move. Null for a move with no entry in EXTRA_GUIDES. */
export function extraGuideFor(move: Pick<MoveDef, "id">): Guide | null {
  return EXTRA_GUIDES[move.id] ?? null;
}
