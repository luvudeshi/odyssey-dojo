// The move guide's pure half: for each move, a short instruction and a looping figure (start pose, the move, back),
// and a live checklist of what the move's detector is looking for, read from the frames the game holds right now.
// The figure comes from the move's own `diagram`; the checklist from src/moves/measures.ts, relabelled for a player.
// A new move needs an entry in GUIDES and in LABELS: tests/coachGuide.test.ts fails without them.
import type { Baseline, MoveDef, MoveDiagram, PoseHistory } from "../core/types";
import type { Side } from "../moves/handSignals";
import { otherSide } from "../moves/handSignals";
import { SIDES } from "../moves/legSignals";
import { MEASURES, readMeasure } from "../moves/measures";
import type { Measure } from "../moves/measures";
import { ghostJoints } from "../render/ghost/ghostPose";
import type { GhostJoints } from "../render/ghost/ghostPose";

type Pt = readonly [number, number];
export type GuideJoint = keyof GhostJoints;
/** The part of the body a move is about: its limb is highlighted and its path gets the arrow. */
export type GuideEnd = "leftWrist" | "rightWrist" | "leftFoot" | "rightFoot" | "leftKnee" | "rightKnee" | "head";
/** A flat figure in metres: x to the right of the picture (the player's left is at the left), y up from the floor. */
export type GuidePose = Readonly<Record<GuideJoint, Pt>>;

export interface GuideKeyframe {
  /** Milliseconds into the loop. */
  readonly t: number;
  readonly pose: GuidePose;
  /** 0..1: how far the `forward` ends are pushed toward the camera here. A flat figure cannot show it, so they grow. */
  readonly toward: number;
  readonly forward: readonly GuideEnd[];
}

export interface Guide {
  readonly title: string;
  /** Three to six plain words. */
  readonly how: string;
  /** Two to four poses, the first one the start; after the last the figure goes back to the first by `loopMs`. */
  readonly keyframes: readonly GuideKeyframe[];
  readonly loopMs: number;
  readonly moving: readonly GuideEnd[];
}

/** Metres per diagram unit, and the middle of the hips in the diagram's box: both as in src/render/ghost/ghostPose.ts. */
const UNIT = 0.028;
const HIP_BOX: Pt = [50, 62];
export const LOOP_MS = 960;

type Arms = Pick<MoveDiagram, "leftElbow" | "leftWrist" | "rightElbow" | "rightWrist">;
/** Fists at the chest, elbows bent: where a strike starts and comes back to. Lower than a block, so it is not one. */
export const GUARD: Arms = { leftElbow: [33, 47], leftWrist: [44, 40], rightElbow: [67, 47], rightWrist: [56, 40] };
/** Hands down: where a defend starts, so the block and the duck are seen to happen. */
export const HANDS_DOWN: Arms = { leftElbow: [34, 46], leftWrist: [33, 60], rightElbow: [66, 46], rightWrist: [67, 60] };

/**
 * Where an end pointed at the camera is drawn: metres out from its own shoulder or hip (away from the middle) and
 * up. Null leaves it where the diagram has it. The diagrams draw a straight punch as an arm out to the side, which
 * the detectors reject; seen from the front a punch at the camera is a fist in front of its shoulder.
 */
type Forward = Readonly<Partial<Record<GuideEnd, Pt | null>>>;

/** The diagram as a flat figure. A raised leg is drawn as the diagram draws it, out from its hip. */
export function poseOf(diagram: MoveDiagram, forward: Forward = {}): GuidePose {
  const joints = ghostJoints(diagram);
  const flat = ([x, y]: readonly [number, number, number]): Pt => [x, y];
  const leg = (hip: Pt, point: Pt | undefined, standing: Pt): Pt =>
    point ? [hip[0] + (point[0] - HIP_BOX[0]) * UNIT, hip[1] - (point[1] - HIP_BOX[1]) * UNIT] : standing;
  const leftHip = flat(joints.leftHip);
  const rightHip = flat(joints.rightHip);
  const pose: Record<GuideJoint, Pt> = {
    head: flat(joints.head),
    leftShoulder: flat(joints.leftShoulder), rightShoulder: flat(joints.rightShoulder),
    leftElbow: flat(joints.leftElbow), rightElbow: flat(joints.rightElbow),
    leftWrist: flat(joints.leftWrist), rightWrist: flat(joints.rightWrist),
    leftHip, rightHip,
    leftKnee: leg(leftHip, diagram.leftKnee, flat(joints.leftKnee)), rightKnee: leg(rightHip, diagram.rightKnee, flat(joints.rightKnee)),
    leftFoot: leg(leftHip, diagram.leftFoot, flat(joints.leftFoot)), rightFoot: leg(rightHip, diagram.rightFoot, flat(joints.rightFoot)),
  };
  for (const side of SIDES) {
    const sign = side === "left" ? -1 : 1;
    const limbs = [[`${side}Wrist`, `${side}Elbow`, `${side}Shoulder`], [`${side}Foot`, `${side}Knee`, `${side}Hip`]] as const;
    for (const [end, middle, root] of limbs) {
      const offset = forward[end];
      if (!offset) continue;
      const [x, y] = pose[root];
      pose[end] = [x + sign * offset[0], y + offset[1]];
      pose[middle] = [x + (sign * offset[0]) / 2, y + offset[1] / 2];
    }
  }
  return pose;
}

/** Where the figure stands before the move: strikes from a guard at the chest, defends with the hands down. */
export function startPose(move: MoveDef): GuidePose {
  return poseOf(move.kind === "defend" ? HANDS_DOWN : GUARD);
}

interface Spec {
  readonly how: string;
  readonly moving: readonly GuideEnd[];
  /** The ends that go toward the camera at the diagram pose. */
  readonly forward?: Forward;
  /** A pose between the start and the diagram (a wind-up), as changes to the start. */
  readonly before?: Partial<MoveDiagram>;
  /** A pose after the diagram (the diagram shows the wind-up, or the first half), as changes to the diagram. */
  readonly then?: Partial<MoveDiagram>;
  readonly thenForward?: Forward;
  /** When each pose after the start is reached, as shares of the loop, where the usual pace does not suit the move. */
  readonly times?: readonly [number, number, number];
}

const L: readonly GuideEnd[] = ["leftWrist"];
const R: readonly GuideEnd[] = ["rightWrist"];
const BOTH: readonly GuideEnd[] = ["leftWrist", "rightWrist"];
const BODY: readonly GuideEnd[] = ["head"];
/** A straight punch: the fist just outside its shoulder and a little above it. */
const OUT: Pt = [0.13, 0.05];
const both = (offset: Pt): Forward => ({ leftWrist: offset, rightWrist: offset });
const AT_CHEST: Partial<MoveDiagram> = { leftElbow: [30, 48], leftWrist: [45, 42], rightElbow: [70, 48], rightWrist: [55, 42] };

const GUIDES: Readonly<Record<string, Spec>> = {
  jab: { how: "Left fist straight out, fast", moving: L, forward: { leftWrist: OUT } },
  cross: { how: "Right fist straight out, fast", moving: R, forward: { rightWrist: OUT } },
  spear_thrust: { how: "Both fists straight out together", moving: BOTH, forward: both(OUT) },
  double_palm: { how: "Push both palms straight forward", moving: BOTH, forward: both([-0.1, 0.04]) },
  chain_punch: {
    how: "Left punch, then right punch", moving: BOTH, forward: { leftWrist: OUT }, thenForward: { rightWrist: OUT },
    then: { leftElbow: GUARD.leftElbow, leftWrist: GUARD.leftWrist },
  },
  reverse_punch: { how: "Right fist out, left to hip", moving: BOTH, forward: { rightWrist: OUT } },
  // The forearm of a hook points at the camera the whole way; a slower swing than a punch keeps the elbow's bend steady.
  hook: {
    how: "Swing bent left arm across", moving: L, forward: { leftWrist: null },
    before: { leftElbow: [24, 34], leftWrist: [20, 20] }, times: [0.2, 0.52, 0.8],
  },
  uppercut: { how: "Right fist up from waist", moving: R, before: { rightElbow: [70, 50], rightWrist: [64, 62] } },
  rising_palm: { how: "Left palm up from waist", moving: L, before: { leftElbow: [30, 50], leftWrist: [36, 62] } },
  hammer_fist: { how: "Raise left fist, hammer down", moving: L, then: { leftElbow: [30, 42], leftWrist: [40, 52] } },
  overhead_strike: { how: "Raise right hand, chop down", moving: R, then: { rightElbow: [70, 42], rightWrist: [60, 52] } },
  thunderbolt: { how: "Raise a hand, throw down", moving: R, then: { rightElbow: [70, 44], rightWrist: [62, 58] } },
  knife_hand: { how: "Right hand across, chop outward", moving: R, before: { rightElbow: [60, 44], rightWrist: [42, 31] } },
  aegis_push: { how: "Push both palms from chest", moving: BOTH, forward: both([-0.08, -0.05]), before: AT_CHEST },
  sun_burst: { how: "Hands together, then fling wide", moving: BOTH, before: AT_CHEST },
  // The draw has to be held for a moment before the string hand drops.
  moon_arrow: { how: "Draw the bow, let go", moving: R, then: { rightElbow: [72, 44], rightWrist: [78, 56] }, times: [0.24, 0.52, 0.68] },
  stake_thrust: { how: "Hands together, drive down forward", moving: BOTH, forward: both([-0.16, -0.4]), before: AT_CHEST },
  trident_sweep: {
    how: "Sweep both arms across", moving: BOTH,
    before: { leftElbow: [52, 44], leftWrist: [70, 42], rightElbow: [76, 40], rightWrist: [90, 36] },
  },
  swift_dash: { how: "One fast step sideways", moving: BODY },
  front_kick: {
    how: "Knee up, snap foot out", moving: ["rightFoot"], forward: { rightFoot: [0.08, -0.06] },
    before: { rightKnee: [58, 60], rightFoot: [56, 78] },
  },
  knee: { how: "Drive one knee up high", moving: ["rightKnee"], forward: { rightKnee: null } },
  block: { how: "Both fists up to face", moving: BOTH },
  duck: { how: "Bend knees, drop your head", moving: BODY },
  dodge_left: { how: "Step or lean left", moving: BODY },
  dodge_right: { how: "Step or lean right", moving: BODY },
  jump: { how: "Hop straight up", moving: BODY },
};

/** Null for a move with no entry in GUIDES. */
export function guideFor(move: MoveDef): Guide | null {
  const spec = GUIDES[move.id];
  if (!spec) return null;
  const begin = move.kind === "defend" ? HANDS_DOWN : GUARD;
  const key = (share: number, diagram: MoveDiagram, forward: Forward = {}): GuideKeyframe => {
    const ends = Object.keys(forward) as GuideEnd[];
    return { t: Math.round(share * LOOP_MS), pose: poseOf(diagram, forward), toward: ends.length > 0 ? 1 : 0, forward: ends };
  };
  const start = key(0, begin);
  const forward = spec.forward ?? {};
  // A start pose on the move itself (`diagramFrom`, proposed for MoveDef) wins over the wind-up written here.
  const from = (move as MoveDef & { readonly diagramFrom?: MoveDiagram }).diagramFrom;
  const before = from ?? (spec.before && { ...begin, ...spec.before });
  let keyframes: GuideKeyframe[];
  if (spec.then) {
    const after = { ...move.diagram, ...spec.then };
    const last = spec.thenForward ?? forward;
    const [a, b, c] = spec.times ?? [0.3, 0.5, 0.78];
    // With its own times the diagram pose is held, then let go of; otherwise the pose after it is the one held.
    keyframes = [start, key(a, move.diagram, forward), spec.times ? key(b, move.diagram, forward) : key(b, after, last), key(c, after, last)];
  } else if (before) {
    const [a, b, c] = spec.times ?? [0.26, 0.46, 0.76];
    keyframes = [start, key(a, before), key(b, move.diagram, forward), key(c, move.diagram, forward)];
  } else {
    keyframes = [start, key(0.3, move.diagram, forward), key(0.74, move.diagram, forward)];
  }
  return { title: move.name, how: spec.how, keyframes, loopMs: LOOP_MS, moving: spec.moving };
}

const ENDS: readonly GuideEnd[] = ["leftWrist", "rightWrist", "leftFoot", "rightFoot", "leftKnee", "rightKnee", "head"];
export type Toward = Readonly<Record<GuideEnd, number>>;
const JOINTS: readonly GuideJoint[] = [
  "head", "leftShoulder", "rightShoulder", "leftElbow", "rightElbow", "leftWrist", "rightWrist",
  "leftHip", "rightHip", "leftKnee", "rightKnee", "leftFoot", "rightFoot",
];
const record = <K extends string, V>(keys: readonly K[], value: (key: K) => V): Record<K, V> =>
  Object.fromEntries(keys.map((key) => [key, value(key)])) as Record<K, V>;
/** How far toward the camera each end is at a keyframe. */
export const towardOf = (key: GuideKeyframe): Toward => record(ENDS, (end) => (key.forward.includes(end) ? key.toward : 0));

/** The figure `ms` into the loop: the keyframes blended, easing in and out of each. */
export function poseAt(guide: Guide, ms: number): { pose: GuidePose; toward: Toward } {
  const first = guide.keyframes[0];
  if (!first) throw new Error("a guide has at least one keyframe");
  const t = ((ms % guide.loopMs) + guide.loopMs) % guide.loopMs;
  const after = guide.keyframes.findIndex((key) => key.t > t);
  const from = guide.keyframes[after < 0 ? guide.keyframes.length - 1 : Math.max(0, after - 1)] ?? first;
  const to = after < 0 ? first : (guide.keyframes[after] ?? first);
  const span = (after < 0 ? guide.loopMs : to.t) - from.t;
  const share = span > 0 ? (t - from.t) / span : 1;
  const k = share * share * (3 - 2 * share);
  const mix = (a: number, b: number): number => a + (b - a) * k;
  const [a, b] = [towardOf(from), towardOf(to)];
  return {
    pose: record(JOINTS, (name): Pt => [mix(from.pose[name][0], to.pose[name][0]), mix(from.pose[name][1], to.pose[name][1])]),
    toward: record(ENDS, (end) => mix(a[end], b[end])),
  };
}

/** The drawing's box, in its own units (100 to the metre): wide enough for a flung arm, tall enough for a raised hand. */
export const VIEW = { width: 240, top: -45, height: 245 } as const;
const FLOOR = 190;
/** How much bigger an end coming straight at the camera is drawn. */
const GROW = 1.6;
const LEG = 0.95;

export interface ScreenFigure {
  readonly at: Readonly<Record<GuideJoint, Pt>>;
  /** How many times bigger than usual each end is drawn: 1, up to 1 + GROW for a fist coming straight at the camera. */
  readonly size: Toward;
}

/**
 * The figure in the drawing's units. `mirrored` (the default in the component) keeps the player's left at the left
 * of the picture, like a mirror; without it the figure faces the player like a teacher, left at the right.
 */
export function toScreen(pose: GuidePose, toward: Toward, mirrored = true): ScreenFigure {
  const points: Record<GuideJoint, Pt> = { ...pose };
  for (const side of SIDES) {
    // A planted leg shorter than a standing one is a bent knee: push the knee out to the side.
    const [hip, knee, foot] = [pose[`${side}Hip`], pose[`${side}Knee`], pose[`${side}Foot`]];
    const length = Math.hypot(foot[0] - hip[0], foot[1] - hip[1]);
    const straight = Math.abs((knee[0] - hip[0]) * (foot[1] - hip[1]) - (knee[1] - hip[1]) * (foot[0] - hip[0])) < 1e-6;
    if (straight && length < LEG - 0.02) {
      points[`${side}Knee`] = [knee[0] + (side === "left" ? -0.3 : 0.3) * Math.sqrt(LEG * LEG - length * length), knee[1]];
    }
  }
  const flip = mirrored ? 1 : -1;
  return {
    at: record(JOINTS, (name): Pt => [VIEW.width / 2 + flip * points[name][0] * 100, FLOOR - points[name][1] * 100]),
    size: record(ENDS, (end) => 1 + GROW * toward[end]),
  };
}

/** The smallest box, as an SVG viewBox, that holds the figure all the way round the loop: for a small card. */
export function fitView(guide: Guide, mirrored = true): string {
  const points = guide.keyframes.flatMap((key) => {
    const screen = toScreen(key.pose, towardOf(key), mirrored);
    return JOINTS.map((name) => screen.at[name]);
  });
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const pad = 20;
  const [left, top] = [Math.min(...xs) - pad, Math.min(...ys) - pad];
  return [left, top, Math.max(...xs) + pad - left, FLOOR + 6 - top].map((value) => value.toFixed(0)).join(" ");
}

/** One thing the detector is looking for, in the player's words. */
export interface LiveCheck {
  /** At most 28 characters. */
  readonly label: string;
  readonly met: boolean;
  /** 0..1: how near it is. 1 only when met. */
  readonly progress: number;
}

export interface LiveChecks {
  /** At most `max` (four unless told): the ones the player controls most, plus any of the rest that is failing. */
  readonly checks: readonly LiveCheck[];
  /** 0..1 over every condition of the move, shown or not. 1 only when all are met, which is when the detector fires. */
  readonly overall: number;
  readonly matched: boolean;
}

/** A label and its rank: 1 is shown first, 0 is shown only while it fails (the player rarely causes it). */
type Label = readonly [string, number];
const m = (label: string, rank = 1): Label => [label, rank];
const x = (label: string): Label => [label, 0];
const cap = (side: Side): string => (side === "left" ? "Left" : "Right");
const out = (side: Side, rank = 1): Label[] => [m(`${cap(side)} arm straight`, rank), m(`${cap(side)} fist shoulder high`, rank + 1)];
const thrust = (side: Side, rank = 1): Label[] => [...out(side, rank), m(`Snap ${side} arm out fast`, rank + 2)];
const punch = (side: Side): Label[] => [...thrust(side), x("Not a chop from overhead")];
const oneHanded = (side: Side): Label[] => [
  x(`Keep ${otherSide(side)} arm back`), x(`Keep ${otherSide(side)} arm still`), x("Punch forward, not sideways"), ...punch(side),
];
const rising = (side: Side, hand: string): Label[] => [
  m(`${cap(side)} ${hand} up to chin`), x("Not above your head"), x("Hand close to your body"),
  m(`Keep ${side} elbow bent`, 2), x("Don't snap the arm straight"), m("Start from your waist"),
  x(`Keep ${otherSide(side)} hand down`),
];
const same = (labels: Label[]) => (): Label[] => labels;

/** For every move, a label for each of its conditions in src/moves/measures.ts, in the same order. */
export const LABELS: Readonly<Record<string, (side: Side) => Label[]>> = {
  jab: same(oneHanded("left")),
  cross: same(oneHanded("right")),
  spear_thrust: same([x("Thrust forward, not wide"), ...punch("left"), ...punch("right")]),
  double_palm: same([...thrust("left"), ...thrust("right"), m("Hands close together")]),
  chain_punch: (side) => [...thrust(side), m(`Pull ${otherSide(side)} fist back`, 2), m(`${cap(otherSide(side))} punch goes first`)],
  reverse_punch: same([...thrust("right"), m("Left fist back at hip"), x("Left elbow bent")]),
  hook: same([
    x("Don't fold arm too tight"), m("Keep left elbow bent"), m("Left fist shoulder high", 2), x("Arm bent the whole way"),
    x("Swing, don't curl in"), m("Swing fist across fast"),
  ]),
  uppercut: same(rising("right", "fist")),
  rising_palm: same(rising("left", "palm")),
  hammer_fist: same([m("Bring left fist down"), m("Left fist over head first")]),
  overhead_strike: same([m("Chop right hand down"), m("Right hand over head first")]),
  thunderbolt: (side) => [m(`Throw ${side} hand down`), m(`${cap(side)} hand over head first`)],
  knife_hand: same([m("Right hand out to the side"), m("Hand at neck height", 2), m("Right arm opened out", 2), m("Start across your chest")]),
  aegis_push: same([
    m("Hands at shoulder height", 2), m("Both arms straight"), m("Hands close together", 3), m("Start at your chest", 2),
    m("Push toward the camera"),
  ]),
  sun_burst: same([m("Both arms straight"), m("Arms at shoulder height", 2), m("Arms flung wide"), m("Start with hands together")]),
  moon_arrow: (side) => [...out(side), m(`Let go: drop ${otherSide(side)} hand`), m("Hold the draw a moment")],
  stake_thrust: same([m("Hands together"), m("Hands down low"), m("Arms straight"), m("Start at your chest")]),
  trident_sweep: same([
    x("Hands between head and hips"), x("Start hands at chest height"), m("Finish on the other side"), m("Both hands sweep far, fast"),
  ]),
  swift_dash: same([m("Step sideways, fast")]),
  front_kick: (side) => [m("Whole body in view", 3), m(`Lift ${side} foot high`), m(`Snap ${side} leg straight`), m("Lift your knee first", 2)],
  knee: (side) => [
    m("Whole body in view", 3), m(`${cap(side)} knee up high`), m("Foot tucked under knee", 2), m("Hold it up a moment", 2),
    x("Start with foot on floor"),
  ],
  block: same([m("Both fists up by your face")]),
  duck: same([m("Drop your shoulders lower")]),
  dodge_left: same([m("Move your body left")]),
  dodge_right: same([m("Move your body right")]),
  jump: same([m("Hop up off the floor")]),
};

const MAX_SHOWN = 4;
interface Read extends LiveCheck { readonly rank: number }

function readOption(measures: readonly Measure[], labels: readonly Label[], history: PoseHistory | null): Read[] {
  return measures.map((measure, index) => {
    const [label, rank] = labels[index] ?? [measure.name.slice(0, 28), 1];
    if (!history || history.frames.length === 0) return { label, rank, met: false, progress: 0 };
    const { passed, margin } = readMeasure(measure, history);
    const near = Number.isNaN(margin) ? 0 : Math.min(0.95, Math.max(0, 1 + margin / 100));
    return { label, rank, met: passed, progress: passed ? 1 : near };
  });
}

/**
 * What the move's detector sees on the newest frame of `history`. `baseline`, when given, is used in place of the
 * history's own. A move either side can make shows the side that is nearest. Never throws: no frames is all unmet.
 */
export function liveChecks(move: MoveDef, history: PoseHistory | null, baseline?: Baseline | null, max = MAX_SHOWN): LiveChecks {
  const held = history && baseline !== undefined ? { ...history, baseline } : history;
  const total = (reads: readonly Read[]): number => reads.reduce((sum, read) => sum + (read.met ? 1 : 0) + read.progress, 0);
  const options = (MEASURES[move.id] ?? []).map((measures, index) =>
    readOption(measures, LABELS[move.id]?.(SIDES[index] ?? "left") ?? [], held));
  const reads = options.reduce<readonly Read[]>((best, option) => (best.length === 0 || total(option) > total(best) ? option : best), []);
  if (reads.length === 0) return { checks: [], overall: 0, matched: false };
  const shown = reads.filter((read) => read.rank > 0).sort((a, b) => a.rank - b.rank).slice(0, max);
  for (const failing of reads.filter((read) => read.rank === 0 && !read.met)) {
    // A rarely failed condition takes a free row, or the place of the last one already met: it is why the move is not firing.
    const spare = shown.map((read) => read.met).lastIndexOf(true);
    if (shown.length < max) shown.push(failing);
    else if (spare >= 0) shown[spare] = failing;
  }
  const matched = reads.every((read) => read.met);
  const mean = reads.reduce((sum, read) => sum + read.progress, 0) / reads.length;
  return {
    checks: shown.map(({ label, met, progress }) => ({ label, met, progress })),
    overall: matched ? 1 : Math.min(0.99, mean),
    matched,
  };
}
