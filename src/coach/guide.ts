// The move guide's pure half: for each move, a short instruction and a looping figure (start pose, the move, back),
// and a live checklist of what the move's detector is looking for, read from the frames the game holds right now.
// The figure comes from the move's own `diagram`; the checklist from src/moves/measures.ts, relabelled for a player.
// A new move needs an entry in GUIDES. Its checklist labels are in LABELS, tied to the conditions by name.
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
  jab: { how: "Keep them back: left fist out", moving: L, forward: { leftWrist: OUT } },
  cross: { how: "Power hand: right fist out", moving: R, forward: { rightWrist: OUT } },
  spear_thrust: { how: "Hold them off: both hands out", moving: BOTH, forward: both(OUT) },
  double_palm: { how: "Push both palms: make space", moving: BOTH, forward: both([-0.1, 0.04]) },
  chain_punch: {
    how: "Left punch, then right punch", moving: BOTH, forward: { leftWrist: OUT }, thenForward: { rightWrist: OUT },
    then: { leftElbow: GUARD.leftElbow, leftWrist: GUARD.leftWrist },
  },
  reverse_punch: { how: "Right fist out, left to hip", moving: BOTH, forward: { rightWrist: OUT } },
  // The forearm of a hook points at the camera the whole way; a slower swing than a punch keeps the elbow's bend steady.
  hook: {
    how: "Round the guard: swing bent arm", moving: L, forward: { leftWrist: null },
    before: { leftElbow: [24, 34], leftWrist: [20, 20] }, times: [0.2, 0.52, 0.8],
  },
  uppercut: { how: "Up close: right fist upward", moving: R, before: { rightElbow: [70, 50], rightWrist: [64, 62] } },
  rising_palm: { how: "Break a grip: palm up", moving: L, before: { leftElbow: [30, 50], leftWrist: [36, 62] } },
  hammer_fist: { how: "Break free: fist up, hammer down", moving: L, then: { leftElbow: [30, 42], leftWrist: [40, 52] } },
  overhead_strike: { how: "Raise right hand, chop down", moving: R, then: { rightElbow: [70, 42], rightWrist: [60, 52] } },
  thunderbolt: { how: "Raise a hand, throw down", moving: R, then: { rightElbow: [70, 44], rightWrist: [62, 58] } },
  knife_hand: { how: "Sweep a reaching arm aside", moving: R, before: { rightElbow: [60, 44], rightWrist: [42, 31] } },
  aegis_push: { how: "Make space: push both palms", moving: BOTH, forward: both([-0.08, -0.05]), before: AT_CHEST },
  sun_burst: { how: "Break a grab: fling arms wide", moving: BOTH, before: AT_CHEST },
  // The draw has to be held for a moment before the string hand drops.
  moon_arrow: { how: "Draw the bow, let go", moving: R, then: { rightElbow: [72, 44], rightWrist: [78, 56] }, times: [0.24, 0.52, 0.68] },
  stake_thrust: { how: "Hands together, drive down forward", moving: BOTH, forward: both([-0.16, -0.4]), before: AT_CHEST },
  trident_sweep: {
    how: "Clear a grab: sweep across", moving: BOTH,
    before: { leftElbow: [52, 44], leftWrist: [70, 42], rightElbow: [76, 40], rightWrist: [90, 36] },
  },
  swift_dash: { how: "Off the line: one fast step", moving: BODY },
  front_kick: {
    how: "Kick out to keep distance", moving: ["rightFoot"], forward: { rightFoot: [0.08, -0.06] },
    before: { rightKnee: [58, 60], rightFoot: [56, 78] },
  },
  knee: { how: "Drive one knee up high", moving: ["rightKnee"], forward: { rightKnee: null } },
  block: { how: "Cover your head: fists up", moving: BOTH },
  duck: { how: "Under the swing: bend knees", moving: BODY },
  dodge_left: { how: "Step off the line: left", moving: BODY },
  dodge_right: { how: "Step off the line: right", moving: BODY },
  jump: { how: "Clear a low sweep: hop up", moving: BODY },
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

/** A written label and its rank: 1 is shown first, 0 is shown only while it fails (the player rarely causes it). */
export interface Written {
  /** Which condition it is for: the start of its `conditionKey`, whole or up to one of its commas. */
  readonly key: string;
  /** The way the condition compares, which has to agree too: a condition turned round is not the same condition. */
  readonly kind: Kind;
  /** At most 28 characters. */
  readonly label: string;
  readonly rank: number;
}
type Kind = "min" | "max" | "anyOf";
const kindOf = (measure: Measure): Kind => ("anyOf" in measure ? "anyOf" : measure.need);
/** A condition's name up to its first comma or bracket: what it measures, without the unit or the explanation. */
const headOf = (name: string): string => name.split(/,| \(/)[0] ?? name;

/**
 * What a condition is called, whatever its numbers: its name in src/moves/measures.ts without what is in brackets
 * and with every number as "#". So "ms since left elbow was bent under 115" and "... under 120" are one condition.
 */
export function conditionKey(name: string): string {
  return name.replace(/\s*\([^)]*\)/g, "").replace(/-?\d+(?:\.\d+)?/g, "#").trim();
}

const MAX_LABEL = 28;
/**
 * A label made from the condition itself, for one nobody has written a label for: its name without units and
 * numbers. Clumsier than a written one, but it is about the right condition.
 */
export function plainLabel(measure: Measure): string {
  const head = headOf(measure.name)
    .replace(/\s+in \d[\d.]* ms\b|\s+\d[\d.]* ms ago\b|\s+(?:under|over) \d[\d.]*/g, "")
    .replace(/\b(?:was|were|has|have) /g, "");
  const since = /^ms since (.*)$/.exec(head);
  // "ms since X" at most so long is "X first"; at least so long is "not straight after X".
  const said = since ? `${kindOf(measure) === "min" ? "Not" : "First"}: ${since[1] ?? ""}` : head.replace(/^ms /, "");
  const words = said.replace(/\b(?:degrees|shoulder widths|torso lengths|confidence|ms|\d\S*)\b/g, "").replace(/\s+/g, " ").trim().split(" ");
  let label = "";
  for (const word of words) {
    if (`${label} ${word}`.trim().length > MAX_LABEL) break;
    label = `${label} ${word}`.trim();
  }
  // Cut short, it does not end on a word left hanging ("Left wrist above the").
  label = label.replace(/(?: (?:the|its|a|to|at|of|off|from|in|on|and|not))+$/, "") || (words[0] ?? "").slice(0, MAX_LABEL) || "This move";
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const min = (key: string, label: string, rank = 1): Written => ({ key, kind: "min", label, rank });
const max = (key: string, label: string, rank = 1): Written => ({ key, kind: "max", label, rank });
const group = (key: string, label: string, rank = 1): Written => ({ key, kind: "anyOf", label, rank });
const cap = (side: Side): string => (side === "left" ? "Left" : "Right");
const out = (side: Side, rank = 1): Written[] => [
  min(`${side} elbow straight`, `${cap(side)} arm straight`, rank),
  max(`${side} fist off shoulder height`, `${cap(side)} fist shoulder high`, rank + 1),
];
const thrust = (side: Side, rank = 1): Written[] =>
  [...out(side, rank), max(`ms since ${side} elbow was bent under #`, `Snap ${side} arm out fast`, rank + 2)];
const punch = (side: Side, chop = "Not a chop from overhead"): Written[] =>
  [...thrust(side), min(`ms since ${side} hand was over the nose`, chop, 0)];
const oneHanded = (side: Side): Written[] => [
  group(`${otherSide(side)} arm not out`, `Keep ${otherSide(side)} arm back`, 0),
  max(`${otherSide(side)} elbow opening in # ms`, `Keep ${otherSide(side)} arm still`, 0),
  max(`${side} fist out to its side`, "Punch forward, not sideways", 0),
  ...punch(side),
  // The conditions of the lenient-strikes branch (`strike` in src/moves/handSignals.ts), written ahead of it landing.
  max(`${otherSide(side)} arm on its way out too`, `Keep ${otherSide(side)} arm back`, 0),
  max(`${side} hand rising with the elbow low`, "Lift elbow, don't scoop up", 0),
  min(`${side} arm out on this frame and the one before`, `${cap(side)} arm out`),
  min(`${side} elbow opened or upper arm rose in # ms`, `Snap ${side} arm out fast`, 2),
  min(`ms since ${side} hand was over the punching band`, "Not a chop from overhead", 0),
  max(`${side} fist's sideways travel in # ms`, "Punch forward, not sideways", 0),
  max(`${side} fist swept across`, "Straight, not a hook", 0),
  max(`${otherSide(side)} fist swept across just now`, "Not straight after a hook", 0),
  max(`${side} arm folding up or dropping in the last # ms`, "Fist going out, not back", 0),
];
/**
 * One arm of a move made with both, or of one with more to it than the punch (`strike` in src/moves/measures.ts).
 * The rows that show only while they fail name their side, so two arms in one list never read the same.
 */
const strike = (side: Side, snap = 2): Written[] => [
  min(`${side} arm out on this frame and the one before`, `${cap(side)} arm out`),
  min(`${side} elbow opened or upper arm rose in # ms`, `Snap ${side} arm out fast`, snap),
  min(`ms since ${side} hand was over the punching band`, `No ${side} chop from overhead`, 0),
  max(`${side} fist's sideways travel in # ms`, `${cap(side)} hand forward, not wide`, 0),
  max(`${side} arm folding up or dropping in the last # ms`, `${cap(side)} hand out, not back`, 0),
];
const rising = (side: Side, hand: string): Written[] => [
  min(`${side} wrist above the shoulder line`, `${cap(side)} ${hand} up to chin`),
  max(`${side} wrist above the shoulder line`, "Not above your head", 0),
  max(`${side} wrist out to its side`, "Hand close to your body", 0),
  max(`${side} elbow bent`, `Keep ${side} elbow bent`, 2),
  max(`${side} elbow opening in # ms`, "Don't snap the arm straight", 0),
  max(`ms since ${side} wrist was at the waist`, "Start from your waist"),
  group(`${otherSide(side)} hand not coming up too`, `Keep ${otherSide(side)} hand down`, 0),
  // The lenient-strikes branch's.
  max(`${side} upper arm lifted from hanging`, `Keep ${side} elbow low`, 2),
  max(`${side} elbow opening fast`, "Drive up, don't punch out", 0),
  max(`${side} fist swept across`, "Straight up, not across", 0),
  min(`${side} wrist's rise in # ms from under #`, "Start from your waist"),
  max(`${otherSide(side)} wrist's rise in # ms from under #`, `Keep ${otherSide(side)} hand down`, 0),
];
const chain = (side: Side): Written[] => [
  ...thrust(side),
  ...strike(side),
  max(`${otherSide(side)} arm reach now`, `Pull ${otherSide(side)} fist back`, 2),
  max(`ms since ${otherSide(side)} arm was out`, `${cap(otherSide(side))} punch goes first`),
];
const thrown = (side: Side): Written[] => [
  min(`${side} wrist below its shoulder`, `Throw ${side} hand down`),
  max(`ms since ${side} hand was over the nose`, `${cap(side)} hand over head first`),
];
const arrow = (bow: Side): Written[] => [
  ...out(bow),
  min(`${otherSide(bow)} hand from its shoulder`, `Let go: drop ${otherSide(bow)} hand`),
  min("ms the draw was held", "Hold the draw a moment"),
];
const kick = (side: Side): Written[] => [
  min("legs in view", "Whole body in view", 3),
  min(`${side} foot above the other`, `Lift ${side} foot high`),
  min(`${side} knee straight`, `Snap ${side} leg straight`),
  max(`ms since ${side} knee was chambered`, "Lift your knee first", 2),
];
const kneeUp = (side: Side): Written[] => [
  min("legs in view", "Whole body in view", 3),
  min(`${side} knee above the other`, `${cap(side)} knee up high`),
  max(`${side} knee folded`, "Foot tucked under knee", 2),
  min(`ms ${side} knee has stayed up`, "Hold it up a moment", 2),
  max(`ms since ${side} foot was on the floor`, "Start with foot on floor", 0),
];
const eitherSide = (build: (side: Side) => Written[]): Written[] => SIDES.flatMap(build);

// The moves only the dojo knows (./extra/moves). Their conditions are named in those files.
const roundhouse = (side: Side): Written[] => [
  min("legs in view", "Whole body in view", 3),
  max(`ms since ${side} knee was up and out to the side`, "Knee up and out first"),
  min(`${side} foot lifted high`, `Lift ${side} foot hip high`),
  min(`${side} leg snapped straight`, `Snap ${side} leg straight`, 2),
  max(`${side} foot round to the front`, "Bring foot round to front", 0),
];
const sideKick = (side: Side): Written[] => [
  min("legs in view", "Whole body in view", 3),
  max(`ms since ${side} knee was lifted and folded`, "Lift your knee first"),
  min(`${side} foot out to the side`, `Push ${side} foot out sideways`),
  min(`${side} foot off the floor`, `Lift ${side} foot higher`, 0),
  min(`${side} leg pushed straight`, `Push ${side} leg straight`, 2),
];
const lowKick = (side: Side): Written[] => [
  min("legs in view", "Whole body in view", 3),
  min(`${side} foot off the floor`, `Lift ${side} foot off floor`, 0),
  max(`${side} foot kept low`, "Keep it at shin height", 2),
  min(`${side} leg kept straight`, `Keep ${side} leg straight`),
  min(`${side} foot out in front`, `Flick ${side} foot forward`),
  max(`ms since ${side} foot was on the floor`, "Make it one quick flick", 0),
  min(`ms since ${side} knee was lifted high`, "Don't lift your knee high", 0),
];
const highBlock = (side: Side): Written[] => [
  min(`${side} wrist up at your forehead`, `${cap(side)} hand up to forehead`),
  min(`${side} elbow up and out`, `${cap(side)} elbow up and out`),
  min(`${side} forearm lying across`, "Forearm across, not upright", 2),
  max(`${side} forearm kept level`, "Keep forearm level", 2),
  max(`${otherSide(side)} hand kept down`, `Keep ${otherSide(side)} hand down`, 0),
  min(`ms ${side} forearm has stayed up`, "Hold it up a beat", 0),
];
const lowBlock = (side: Side): Written[] => [
  max(`ms since ${side} hand was across at the other shoulder`, "Start at other shoulder"),
  max(`${side} hand swept down low`, `Sweep ${side} hand down low`),
  min(`${side} hand out past its hip`, `Finish past your ${side} hip`, 2),
  min(`${side} arm ends straight`, `End with ${side} arm straight`, 2),
];
const palmHeel = (side: Side): Written[] => [
  min(`${side} arm pushed out`, `Push ${side} palm out`),
  min(`${side} hand at face height`, `${cap(side)} palm at face height`),
  max(`${side} hand below head top`, "Not above your head", 0),
  max(`${side} hand in front`, "Straight ahead, not wide", 0),
  min(`${side} upper arm lifted`, "Lift your elbow as you push", 0),
  min(`${side} arm's snap out in # ms`, `Snap ${side} palm out fast`, 2),
  group(`${otherSide(side)} hand not pushing too`, `Keep ${otherSide(side)} hand back`, 0),
  min(`ms since ${side} hand was over the head`, "Not a chop from overhead", 0),
];
const elbowStrike = (side: Side): Written[] => [
  max(`${side} arm folded tight`, `Fold ${side} arm tight`),
  min(`${side} elbow up at shoulder height`, `${cap(side)} elbow shoulder high`),
  min(`${side} elbow swung across in # ms`, `Swing ${side} elbow across`, 2),
  max(`${side} elbow in front of the chest`, "Finish in front of chest", 2),
];
const wristRelease = (side: Side): Written[] => [
  min(`ms ${side} arm stayed out first`, `Hold ${side} arm out first`),
  max(`${side} elbow folded`, `Fold ${side} elbow tight`),
  max(`${side} hand in at its shoulder`, `${cap(side)} hand to your shoulder`, 2),
  min(`${side} elbow pointing forward`, "Point elbow forward", 2),
  max(`ms since ${side} arm was held out in front`, "Then fold in quickly", 0),
];

/**
 * The labels written for each move's conditions in src/moves/measures.ts. Each is tied to its condition by the
 * condition's name (`conditionKey`) and the way it compares, never by its place in the list, so the table can
 * gain, lose or reorder conditions: one with no label here gets `plainLabel`, and a label whose condition has gone
 * is simply not used. A label here says what its condition means in this move, at about today's threshold.
 * A key is the name up to any of its commas, so the unit can be left off; the longest key that fits wins.
 */
export const LABELS: Readonly<Record<string, readonly Written[]>> = {
  // Either hand counts for both; the checklist follows the hand that is closest.
  jab: eitherSide(oneHanded),
  cross: eitherSide(oneHanded),
  spear_thrust: [
    group("arms not both flung out to their sides", "Thrust forward, not wide", 0),
    max("both arms flung out to their sides", "Thrust forward, not wide", 0),
    ...punch("left", "No left chop from overhead"), ...punch("right", "No right chop from overhead"),
    ...strike("left"), ...strike("right"),
  ],
  double_palm: [...thrust("left"), ...thrust("right"), ...strike("left", 3), ...strike("right", 3), max("gap between the wrists", "Hands close together", 2)],
  chain_punch: eitherSide(chain),
  reverse_punch: [
    ...thrust("right"), ...strike("right"),
    max("left wrist above the shoulder line", "Left fist back at hip"), max("left elbow bent", "Left elbow bent back", 0),
  ],
  hook: eitherSide((side) => [
    min(`${side} elbow bend`, "Don't fold arm too tight", 0), max(`${side} elbow bend`, `Keep ${side} elbow bent`),
    max(`widest ${side} elbow in # ms`, "Arm bent the whole way", 0), max(`${side} punched straight in the last # ms`, "Not right after a punch", 0),
    max(`${side} fist off the shoulder line`, "Fist between head and chest", 2),
    min(`${side} upper arm lifted from hanging`, `${cap(side)} elbow up and out`, 3), min(`ms since ${side} hand was over the punching band`, "Not a chop from overhead", 0),
    min(`${side} fist's swing across in # ms, more than # times up`, "Swing flat, not upward", 0),
    min(`${side} fist's swing across in # ms, confidence`, "Swing fist across fast"),
  ]),
  uppercut: rising("right", "fist"),
  rising_palm: rising("left", "palm"),
  hammer_fist: [
    max("left wrist above the shoulder line", "Bring left fist down"),
    max("ms since left wrist was # above the shoulder line", "Left fist over head first"),
  ],
  overhead_strike: [
    min("right wrist below its shoulder", "Chop right hand down"), max("ms since right hand was over the nose", "Right hand over head first"),
  ],
  thunderbolt: eitherSide(thrown),
  knife_hand: [
    min("right wrist out to its side", "Right hand out to the side"), max("right wrist off the shoulder line", "Hand at neck height", 2),
    min("right elbow open", "Right arm opened out", 2),
    max("ms since right hand was across the body at chest height", "Start across your chest"),
  ],
  aegis_push: [
    max("hand furthest off shoulder height", "Hands at shoulder height", 2), min("less straight elbow", "Both arms straight"),
    max("gap between the wrists", "Hands close together", 3), max("ms since both hands were at the chest", "Start at your chest", 2),
    min("nearer wrist's reach forward", "Push toward the camera"),
  ],
  sun_burst: [
    min("less straight elbow", "Both arms straight"), max("hand furthest off shoulder height", "Arms at shoulder height", 2),
    min("nearer wrist out to its side of its shoulder", "Arms flung wide"),
    max("ms since the hands were together", "Start with hands together"),
  ],
  moon_arrow: eitherSide(arrow),
  stake_thrust: [
    max("gap between the wrists", "Hands together"), min("hands below the shoulders", "Hands down low"),
    min("less straight elbow", "Arms straight"), max("ms since the hands were loaded at the chest", "Start at your chest"),
  ],
  trident_sweep: [
    min("wrists inside head-to-hip height now", "Hands between head and hips", 0),
    min("wrists inside head-to-hip height # ms ago", "Start hands at chest height", 0),
    min("hands' distance from the chest line", "Finish on the other side"),
    min("slower wrist's travel in # ms", "Both hands sweep far, fast"),
  ],
  swift_dash: [min("shoulders moved sideways in # ms", "Step sideways, fast")],
  front_kick: eitherSide(kick),
  knee: eitherSide(kneeUp),
  block: [min("guard confidence", "Both fists up by your face")],
  duck: [min("crouch confidence", "Drop your shoulders lower")],
  dodge_left: [min("side step confidence", "Move your body left")],
  dodge_right: [min("side step confidence", "Move your body right")],
  jump: [min("hop confidence", "Hop up off the floor")],
  roundhouse_kick: eitherSide(roundhouse),
  side_kick: eitherSide(sideKick),
  low_kick: eitherSide(lowKick),
  high_block: eitherSide(highBlock),
  low_block: eitherSide(lowBlock),
  palm_heel: eitherSide(palmHeel),
  elbow_strike: eitherSide(elbowStrike),
  wrist_release: eitherSide(wristRelease),
};

/**
 * The label for one condition of a move: the one written for it, or failing that one made from the condition
 * itself, shown only while it fails. `written` tells the two apart.
 */
export function labelOf(
  moveId: string, measure: Measure, among: readonly Measure[] = [measure],
): { readonly label: string; readonly rank: number; readonly written: boolean } {
  const found = entryFor(moveId, measure);
  // `among` is the move's other conditions. A label that fits two of them was written for neither: both go without.
  const shared = among.some((other) => other !== measure && entryFor(moveId, other) === found);
  return found && !shared ? { label: found.label, rank: found.rank, written: true } : { label: plainLabel(measure), rank: 0, written: false };
}

/** The entry written for a condition, among `entries`: the same way of comparing, and the longest key that fits its name. */
export function entryOf<Entry extends Pick<Written, "key" | "kind">>(entries: readonly Entry[], measure: Measure): Entry | undefined {
  const key = conditionKey(measure.name);
  const kind = kindOf(measure);
  return entries
    .filter((entry) => entry.kind === kind && (key === entry.key || key.startsWith(`${entry.key},`)))
    .reduce<Entry | undefined>((best, entry) => (!best || entry.key.length > best.key.length ? entry : best), undefined);
}

function entryFor(moveId: string, measure: Measure): Written | undefined {
  return entryOf(LABELS[moveId] ?? [], measure);
}

const MAX_SHOWN = 4;
/**
 * For a move either side can make: the side its checklist names while no side is ahead (no pose yet, as with the
 * keyboard). It is the side the move's instruction and figure show; a move not listed here shows the left.
 */
const SHOWN_FIRST: Readonly<Record<string, Side>> = {
  cross: "right", chain_punch: "right", thunderbolt: "right", front_kick: "right", knee: "right",
};
interface Read extends LiveCheck { readonly rank: number }

function readOption(moveId: string, measures: readonly Measure[], history: PoseHistory | null): Read[] {
  return measures.map((measure) => {
    const { label, rank } = labelOf(moveId, measure, measures);
    if (!history || history.frames.length === 0) return { label, rank, met: false, progress: 0 };
    const { passed, margin } = readMeasure(measure, history);
    const near = Number.isNaN(margin) ? 0 : Math.min(0.95, Math.max(0, 1 + margin / 100));
    return { label, rank, met: passed, progress: passed ? 1 : near };
  });
}

/**
 * What the move's detector sees on the newest frame of `history`. `baseline`, when given, is used in place of the
 * history's own. A move either side can make shows the side that is nearest. Never throws: no frames is all unmet.
 * `table` is the conditions to read: src/moves/measures.ts, unless a test hands in another.
 */
export function liveChecks(
  move: MoveDef, history: PoseHistory | null, baseline?: Baseline | null, max = MAX_SHOWN, table: typeof MEASURES = MEASURES,
): LiveChecks {
  const held = history && baseline !== undefined ? { ...history, baseline } : history;
  const total = (reads: readonly Read[]): number => reads.reduce((sum, read) => sum + (read.met ? 1 : 0) + read.progress, 0);
  const options = (table[move.id] ?? []).map((measures) => readOption(move.id, measures, held));
  // The table has one list per side, in the order of SIDES. A side has to be ahead to take the place of the one shown first.
  const first = options[SIDES.indexOf(SHOWN_FIRST[move.id] ?? "left")] ?? options[0] ?? [];
  const reads = options.reduce<readonly Read[]>((best, option) => (total(option) > total(best) ? option : best), first);
  if (reads.length === 0) return { checks: [], overall: 0, matched: false };
  const ranked = reads.filter((read) => read.rank > 0).sort((a, b) => a.rank - b.rank);
  // With no ranked label at all (every condition of the move is new to this file) the conditions are shown as they come.
  const shown = (ranked.length > 0 ? ranked : reads).slice(0, max);
  for (const failing of reads.filter((read) => read.rank === 0 && !read.met && !shown.includes(read))) {
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
