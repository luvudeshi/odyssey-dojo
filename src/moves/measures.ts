// What each move's detector measures, as a table: one entry per move id, its conditions in the order the
// detector checks them, each with a name, how to read its value from the frames, and its threshold.
// tools/recorder/report.ts prints these for a recorded trace, so tuning is reading a table (docs/detector-tuning.md).
// This table does not decide anything: the detectors in ./defs do. It imports their own helpers and thresholds
// where they are exported; a number written out here is written out in the detector too, and is named beside it.
// A new move needs an entry here: tests/moves/report.test.ts fails without one.
import type { Baseline, PoseFrame, PoseHistory } from "../core/types";
import {
  JOINT, bothNewest, elbowAngle, joint, latest, recent, shoulderCenter, shoulderWidth,
} from "../pose/signals";
import { CHEST_MS, FULL_REACH, MAX_GAP, PUSH_ELBOW, atChest, reach } from "./defs/aegisPush";
import { DEFEND_ON } from "../input/poseInput";
import { STEADY_MS, guard } from "./defs/block";
import { sideStep } from "./defs/dodgeLeft";
import { move as duck } from "./defs/duck";
import { CHAMBER_MS, KICK_LIFT, KICK_STRAIGHT, chambered } from "./defs/frontKick";
import { move as jump } from "./defs/jump";
import { HOLD_MS, KNEE_BEND, KNEE_LIFT, RISE_MS, grounded, raised } from "./defs/knee";
import { DRAW_MS, RELEASE, drawn, handToShoulder } from "./defs/moonArrow";
import { DRIVEN_DROP, DRIVEN_ELBOW, GRIP, WINDUP_MS, handsDrop, loaded } from "./defs/stakeThrust";
import { FLUNG_ELBOW, TOGETHER_MS, WIDE } from "./defs/sunBurst";
import { RAISED_MS } from "./defs/thunderbolt";
import { SIDE, TRAVEL, hipsY } from "./defs/tridentSweep";
import {
  BENT, OPENING_DEGREES, OPENING_MS, SHOULDER_HEIGHT, SNAP_MS, STRAIGHT, armOut, bodyWidth, otherSide, torsoLength,
  wristGap, wristOut, wristRise,
} from "./handSignals";
import type { Side } from "./handSignals";
import { SIDES, footLift, kneeAngle, kneeLift, legsVisible } from "./legSignals";

/** One number the detector compares with a threshold. */
export interface Single {
  /** What is measured and in which unit. */
  readonly name: string;
  /** "min": the value must be at least the threshold. "max": at most. */
  readonly need: "min" | "max";
  readonly threshold: number;
  /** True when a value exactly on the threshold does not pass (the detector compares with < or >). */
  readonly strict?: boolean;
  /** What counts as a margin of 100%. Left out, it is the threshold itself; a threshold of 0 needs one. */
  readonly scale?: number;
  /** The value at the newest frame of `history`. NaN when it cannot be measured; Infinity for "never". */
  read(history: PoseHistory): number;
}

/** A condition: one number, or "not all of these at once", which passes when any one of `anyOf` does. */
export type Measure = Single | { readonly name: string; readonly anyOf: readonly Single[] };

/** A measure read at one moment. `margin` is in percent: positive passed with room, negative missed. */
export interface Reading {
  readonly name: string;
  readonly need: "min" | "max";
  readonly value: number;
  readonly threshold: number;
  readonly strict: boolean;
  readonly margin: number;
  /** Whether the detector's own comparison holds. A margin of 0% passes unless the measure is strict. */
  readonly passed: boolean;
}

export function readMeasure(measure: Measure, history: PoseHistory): Reading {
  if ("anyOf" in measure) {
    const parts = measure.anyOf.map((part) => readMeasure(part, history));
    const best = parts.reduce((a, b) => (b.margin > a.margin || (b.passed && !a.passed) ? b : a));
    return { ...best, name: `${measure.name}: ${best.name}` };
  }
  const value = measure.read(history);
  const past = measure.need === "min" ? value - measure.threshold : measure.threshold - value;
  const margin = Number.isNaN(past) ? -Infinity : (past / (measure.scale ?? Math.abs(measure.threshold))) * 100;
  const strict = measure.strict ?? false;
  return { name: measure.name, need: measure.need, value, threshold: measure.threshold, strict, margin, passed: strict ? past > 0 : past >= 0 };
}

type Read = Single["read"];
type FrameRead = (frame: PoseFrame, baseline: Baseline | null) => number;

const atLeast = (name: string, threshold: number, read: Read, scale?: number): Single =>
  ({ name, need: "min", threshold, read, ...(scale !== undefined && { scale }) });
const atMost = (name: string, threshold: number, read: Read, scale?: number): Single =>
  ({ name, need: "max", threshold, read, ...(scale !== undefined && { scale }) });
/** The strict ones: `over` is more than the threshold, `under` is less than it. */
const over = (name: string, threshold: number, read: Read, scale?: number): Single =>
  ({ ...atLeast(name, threshold, read, scale), strict: true });
const under = (name: string, threshold: number, read: Read, scale?: number): Single =>
  ({ ...atMost(name, threshold, read, scale), strict: true });

/** A value read from the newest frame alone. */
const now = (read: FrameRead): Read => (history) => {
  const frame = latest(history);
  return frame ? read(frame, history.baseline) : NaN;
};

/** Milliseconds since `seen` was last true, for the "within N ms" checks. Infinity when it is in none of the frames kept. */
const since = (seen: (frame: PoseFrame, baseline: Baseline | null) => boolean): Read => (history) => {
  const frame = latest(history);
  const last = history.frames.filter((old) => seen(old, history.baseline)).at(-1);
  return frame && last ? frame.t - last.t : Infinity;
};

/** The frame `ms` ago, as the detectors take it: the oldest of the last `ms` milliseconds. */
const ago = (ms: number, read: (frame: PoseFrame, earlier: PoseFrame, history: PoseHistory) => number): Read =>
  (history) => {
    const frame = latest(history);
    const earlier = recent(history, ms)[0];
    return frame && earlier ? read(frame, earlier, history) : NaN;
  };

/** The line a detector's confidence has to reach to count (ON in src/input/poseInput.ts). */
const ON = 0.7;
// Written out in handSignals.ts, in armOut, armThrust and flungWide.
const ARM_STRAIGHT = 145;
const THRUST_BENT = 115;
const THRUST_MS = 450;
const FLUNG = 1.2;

const wristOf = (side: Side): number => (side === "left" ? JOINT.leftWrist : JOINT.rightWrist);
const shoulderOf = (side: Side): number => (side === "left" ? JOINT.leftShoulder : JOINT.rightShoulder);
const elbow = (side: Side): FrameRead => (frame) => elbowAngle(frame, side);
const both = (read: (side: Side) => FrameRead, pick: (...values: number[]) => number): FrameRead =>
  (frame, baseline) => pick(read("left")(frame, baseline), read("right")(frame, baseline));
/** How far the fist is above or below its shoulder in 3D, in torso lengths: what `fistLevel` compares. */
const offLevel = (side: Side): FrameRead => (frame, baseline) =>
  Math.abs(joint(frame.world, wristOf(side)).y - joint(frame.world, shoulderOf(side)).y) / torsoLength(frame, baseline);
/** How far the wrist is below `under` in the picture, in shoulder widths. Negative is above it. */
const below = (side: Side, under: number): FrameRead => (frame) =>
  (joint(frame.image, wristOf(side)).y - joint(frame.image, under).y) / shoulderWidth(frame);
const overNose = (side: Side) => (frame: PoseFrame): boolean => below(side, JOINT.nose)(frame, null) < 0;

/** `armOut`: straight, with the fist at shoulder height. */
const out = (side: Side): Single[] => [
  over(`${side} elbow straight, degrees`, ARM_STRAIGHT, now(elbow(side))),
  under(`${side} fist off shoulder height, torso lengths`, SHOULDER_HEIGHT, now(offLevel(side))),
];
const notOutParts = (side: Side): Single[] => [
  atMost("elbow, degrees", ARM_STRAIGHT, now(elbow(side))),
  atLeast("fist off shoulder height, torso lengths", SHOULDER_HEIGHT, now(offLevel(side))),
];
const notOut = (side: Side): Measure => ({ name: `${side} arm not out`, anyOf: notOutParts(side) });
const sinceBent = (side: Side, under: number): Read => since((frame) => elbowAngle(frame, side) < under);
/** `armThrust`: out now, and bent within the last 450 ms. */
const thrust = (side: Side): Single[] => [
  ...out(side),
  atMost(`ms since ${side} elbow was bent under ${String(THRUST_BENT)}`, THRUST_MS, sinceBent(side, THRUST_BENT)),
];
/** `punch` at full confidence: snapped straight at shoulder height, and not a chop. */
const punch = (side: Side): Single[] => [
  over(`${side} elbow straight, degrees`, STRAIGHT, now(elbow(side))),
  under(`${side} fist off shoulder height, torso lengths`, SHOULDER_HEIGHT, now(offLevel(side))),
  atMost(`ms since ${side} elbow was bent under ${String(BENT)}`, SNAP_MS, sinceBent(side, BENT)),
  over(`ms since ${side} hand was over the nose`, 500, since(overNose(side))),
];
/** Jab and cross: one fist punched at the camera while the other arm stays back. */
const oneHanded = (side: Side): Measure[] => [
  notOut(otherSide(side)),
  atMost(`${otherSide(side)} elbow opening in ${String(OPENING_MS)} ms, degrees`, OPENING_DEGREES, (history) =>
    now(elbow(otherSide(side)))(history) - Math.min(...recent(history, OPENING_MS).map((old) => elbowAngle(old, otherSide(side))))),
  atMost(`${side} fist out to its side, shoulder widths`, FLUNG, now((frame) => wristOut(frame, side))),
  ...punch(side),
];
/** `risingHand`: uppercut and rising palm. The numbers are written out in handSignals.ts. */
const rising = (side: Side, bentBelow: number): Measure[] => [
  atLeast(`${side} wrist above the shoulder line, shoulder widths`, -0.15, now((frame) => wristRise(frame, side)), 1),
  atMost(`${side} wrist above the shoulder line, shoulder widths`, 1.3, now((frame) => wristRise(frame, side))),
  atMost(`${side} wrist out to its side, shoulder widths`, 1, now((frame) => wristOut(frame, side))),
  atMost(`${side} elbow bent, degrees`, bentBelow, now(elbow(side))),
  atMost(`${side} elbow opening in ${String(OPENING_MS)} ms, degrees`, OPENING_DEGREES, (history) =>
    now(elbow(side))(history) - Math.min(...recent(history, OPENING_MS).map((old) => elbowAngle(old, side)))),
  atMost(`ms since ${side} wrist was at the waist (1 below the shoulders)`, 400, since((frame) => wristRise(frame, side) < -1)),
  // Both hands coming up together are a guard or a push. CHEST (-0.6) and WAIST (-1) are written out in handSignals.ts.
  {
    name: `${otherSide(side)} hand not coming up too`,
    anyOf: [
      atMost(`${otherSide(side)} wrist above the shoulder line, shoulder widths`, -0.6, now((frame) => wristRise(frame, otherSide(side)))),
      over(`ms since ${otherSide(side)} wrist was at the waist`, 400, since((frame) => wristRise(frame, otherSide(side)) < -1)),
    ],
  },
];
/** Overhead strike, hammer fist and thunderbolt: the hand was up, and is now down. */
const chop = (down: Single, wasUp: string, ms: number, up: (frame: PoseFrame) => boolean): Measure[] =>
  [down, atMost(`ms since ${wasUp}`, ms, since(up))];
const kick = (side: Side): Measure[] => [
  atLeast("legs in view (1 yes, 0 no)", 1, now((frame) => (legsVisible(frame) ? 1 : 0))),
  atLeast(`${side} foot above the other, shoulder widths`, KICK_LIFT, now((frame) => footLift(frame, side))),
  atLeast(`${side} knee straight, degrees`, KICK_STRAIGHT, now((frame) => kneeAngle(frame, side))),
  atMost(`ms since ${side} knee was chambered`, CHAMBER_MS, since((frame) => chambered(frame, side))),
];
/** How long the knee has been up and folded without a break, in milliseconds. */
const kneeHeld = (side: Side): Read => (history) => {
  const frames = recent(history, RISE_MS);
  let top: PoseFrame | undefined;
  for (let i = frames.length - 1; i >= 0; i--) {
    const frame = frames[i];
    if (!frame || !raised(frame, side)) break;
    top = frame;
  }
  return top ? (frames.at(-1)?.t ?? top.t) - top.t : 0;
};
const knee = (side: Side): Measure[] => [
  atLeast("legs in view (1 yes, 0 no)", 1, now((frame) => (legsVisible(frame) ? 1 : 0))),
  atLeast(`${side} knee above the other, shoulder widths`, KNEE_LIFT, now((frame) => kneeLift(frame, side))),
  under(`${side} knee folded, degrees`, KNEE_BEND, now((frame) => kneeAngle(frame, side))),
  atLeast(`ms ${side} knee has stayed up`, HOLD_MS, kneeHeld(side)),
  atMost(`ms since ${side} foot was on the floor`, RISE_MS, since((frame) => grounded(frame, side))),
];
/** The longest unbroken draw in the last 500 ms, in milliseconds. */
const drawnFor = (bow: Side): Read => (history) => {
  let from: number | null = null;
  let longest = 0;
  for (const old of recent(history, 500)) {
    if (!drawn(old, bow, otherSide(bow), history.baseline)) from = null;
    else longest = Math.max(longest, old.t - (from ??= old.t));
  }
  return longest;
};
const arrow = (bow: Side): Measure[] => [
  ...out(bow),
  atLeast(`${otherSide(bow)} hand from its shoulder, shoulder widths`, RELEASE, now((frame) => handToShoulder(frame, otherSide(bow)))),
  atLeast(`ms the draw was held (${bow} arm out, other hand at its shoulder)`, DRAW_MS, drawnFor(bow)),
];
const chain = (side: Side): Measure[] => [
  ...thrust(side),
  notOut(otherSide(side)),
  atMost(`ms since ${otherSide(side)} arm was out`, 700, since((frame, baseline) => armOut(frame, otherSide(side), baseline))),
];
const dodge = (way: -1 | 1): Measure[] =>
  [atLeast("side step confidence (0.5 is 0.25 shoulder widths off the baseline, half the head's lean added)", DEFEND_ON, (history) => sideStep(history, way))];

// Trident sweep: its two helpers are private to the detector, so they are repeated here.
const offset = (frame: PoseFrame, wrist: number): number => joint(frame.image, wrist).x - shoulderCenter(frame).x;
/** How far inside the band from head to hips the wrists are, in shoulder widths. Negative is outside it. */
const inBand: FrameRead = (frame) => {
  const hips = hipsY(frame);
  const left = joint(frame.image, JOINT.leftWrist).y;
  const right = joint(frame.image, JOINT.rightWrist).y;
  return Math.min(Math.min(left, right) - joint(frame.image, JOINT.nose).y, hips - Math.max(left, right)) / shoulderWidth(frame);
};
const sweep = (read: (left: [number, number], right: [number, number]) => number): Read =>
  ago(350, (frame, earlier, history) => {
    const width = history.baseline?.shoulderWidth ?? shoulderWidth(frame);
    const side = (wrist: number): [number, number] => [offset(earlier, wrist) / width, offset(frame, wrist) / width];
    return read(side(JOINT.leftWrist), side(JOINT.rightWrist));
  });

const one = (...measures: Measure[]): Measure[][] => [measures];
const eitherSide = (build: (side: Side) => Measure[]): Measure[][] => SIDES.map(build);

/**
 * Every move's conditions. Most moves have one list; a move either side may make has one list per side, and
 * the report shows the side that came closest.
 */
export const MEASURES: Readonly<Record<string, readonly (readonly Measure[])[]>> = {
  jab: one(...oneHanded("left")),
  cross: one(...oneHanded("right")),
  spear_thrust: one(
    {
      name: "arms not both flung out to their sides",
      anyOf: SIDES.map((side) => atMost(`${side} fist out to its side, shoulder widths`, FLUNG, now((frame) => wristOut(frame, side)))),
    },
    ...punch("left"), ...punch("right"),
  ),
  double_palm: one(...thrust("left"), ...thrust("right"), under("gap between the wrists, shoulder widths", 0.8, now(wristGap))),
  chain_punch: eitherSide(chain),
  reverse_punch: one(
    ...thrust("right"),
    under("left wrist above the shoulder line, shoulder widths", -0.9, now((frame) => wristRise(frame, "left"))),
    under("left elbow bent, degrees", 130, now(elbow("left"))),
  ),
  hook: one(
    atLeast("left elbow bend, degrees", 60, now(elbow("left"))),
    atMost("left elbow bend, degrees", 130, now(elbow("left"))),
    atMost("left fist off shoulder height, shoulder widths", 0.6, now((frame) => Math.abs(below("left", JOINT.leftShoulder)(frame, null)))),
    atMost("widest left elbow in 150 ms, degrees", 130, (history) => Math.max(...recent(history, 150).map((old) => elbowAngle(old, "left")))),
    atMost("left elbow closing in 150 ms, degrees", 35, (history) =>
      Math.max(...recent(history, 150).map((old) => elbowAngle(old, "left"))) - now(elbow("left"))(history)),
    atLeast("left fist's swing across in 150 ms, shoulder widths", ON, ago(150, (frame, earlier) =>
      (joint(frame.image, JOINT.leftWrist).x - joint(earlier.image, JOINT.leftWrist).x) / shoulderWidth(frame))),
  ),
  uppercut: one(...rising("right", 135)),
  rising_palm: one(...rising("left", 150)),
  hammer_fist: one(...chop(
    atMost("left wrist above the shoulder line, shoulder widths", 0, now((frame) => wristRise(frame, "left")), 1),
    "left wrist was 1 above the shoulder line", 500, (frame) => wristRise(frame, "left") > 1,
  )),
  overhead_strike: one(...chop(
    over("right wrist below its shoulder, shoulder widths", 0, now(below("right", JOINT.rightShoulder)), 1),
    "right hand was over the nose", 200, overNose("right"),
  )),
  thunderbolt: eitherSide((side) => chop(
    over(`${side} wrist below its shoulder, shoulder widths`, 0, now(below(side, shoulderOf(side))), 1),
    `${side} hand was over the nose`, RAISED_MS, overNose(side),
  )),
  knife_hand: one(
    over("right wrist out to its side, shoulder widths", FLUNG, now((frame) => wristOut(frame, "right"))),
    under("right wrist off the shoulder line, shoulder widths", 0.7, now((frame) => Math.abs(wristRise(frame, "right")))),
    over("right elbow open, degrees", 125, now(elbow("right"))),
    atMost("ms since right hand was across the body at chest height", 550,
      since((frame) => wristOut(frame, "right") < 0.1 && wristRise(frame, "right") > -0.6)),
  ),
  aegis_push: one(
    under("hand furthest off shoulder height, torso lengths", SHOULDER_HEIGHT, now(both(offLevel, Math.max))),
    atLeast("less straight elbow, degrees", PUSH_ELBOW, now(both(elbow, Math.min))),
    under("gap between the wrists, shoulder widths", MAX_GAP, now(wristGap)),
    atMost("ms since both hands were at the chest, elbows bent", CHEST_MS, since(atChest)),
    atLeast("nearer wrist's reach forward, 3D shoulder widths", ON * FULL_REACH,
      now(both((side) => (frame, baseline) => reach(frame, side, baseline), Math.min))),
  ),
  sun_burst: one(
    over("less straight elbow, degrees", FLUNG_ELBOW, now(both(elbow, Math.min))),
    under("hand furthest off shoulder height, torso lengths", SHOULDER_HEIGHT, now(both(offLevel, Math.max))),
    over("nearer wrist out to its side of its shoulder, 3D shoulder widths", WIDE, now(both((side) => (frame, baseline) => {
      const across = joint(frame.world, wristOf(side)).x - joint(frame.world, shoulderOf(side)).x;
      return (side === "left" ? -across : across) / bodyWidth(frame, baseline);
    }, Math.min))),
    atMost("ms since the hands were together (under 0.8 shoulder widths)", TOGETHER_MS, since((frame) => wristGap(frame) < 0.8)),
  ),
  moon_arrow: eitherSide(arrow),
  stake_thrust: one(
    under("gap between the wrists, shoulder widths", GRIP, now(wristGap)),
    over("hands below the shoulders, shoulder widths", DRIVEN_DROP, now(handsDrop)),
    over("less straight elbow, degrees", DRIVEN_ELBOW, now(both(elbow, Math.min))),
    atMost("ms since the hands were loaded at the chest", WINDUP_MS, since(loaded)),
  ),
  trident_sweep: one(
    atLeast("wrists inside head-to-hip height now, shoulder widths", 0, now(inBand), 1),
    atLeast("wrists inside head-to-hip height 350 ms ago, shoulder widths", 0, ago(350, (_, earlier) => inBand(earlier, null)), 1),
    atLeast("hands' distance from the chest line, start and end on opposite sides, shoulder widths", SIDE, sweep((left, right) => {
      const from = (left[0] + right[0]) / 2;
      const to = (left[1] + right[1]) / 2;
      return from * to < 0 ? Math.min(Math.abs(from), Math.abs(to)) : 0;
    })),
    atLeast("slower wrist's travel in 350 ms, both the same way, shoulder widths", TRAVEL, sweep((left, right) => {
      const [a, b] = [left[1] - left[0], right[1] - right[0]];
      return a * b > 0 ? Math.min(Math.abs(a), Math.abs(b)) : 0;
    })),
  ),
  swift_dash: one(atLeast("shoulders moved sideways in 250 ms, baseline shoulder widths", 0.6, ago(250, (frame, earlier, history) =>
    history.baseline ? Math.abs(shoulderCenter(frame).x - shoulderCenter(earlier).x) / history.baseline.shoulderWidth : NaN))),
  front_kick: eitherSide(kick),
  knee: eitherSide(knee),
  block: one(
    atLeast("guard confidence (1 is both fists within 1 shoulder width of the nose, 0.2 below the shoulder line or higher, forearms standing)", DEFEND_ON, (history) =>
      latest(history) ? Math.max(bothNewest(history, guard), guard(recent(history, STEADY_MS))) : NaN),
  ),
  duck: one(atLeast("crouch confidence (0.5 is shoulders 0.3 baseline shoulder widths down, or the nose 0.2 above the shoulder line)", DEFEND_ON, (history) => duck.detect(history))),
  dodge_left: one(...dodge(-1)),
  dodge_right: one(...dodge(1)),
  jump: one(atLeast("hop confidence (0.5 is shoulders and head up 0.18 shoulder widths)", DEFEND_ON, (history) => jump.detect(history))),
};
