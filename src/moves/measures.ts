// What each move's detector measures, as a table: one entry per move id, its conditions in the order the
// detector checks them, each with a name, how to read its value from the frames, and its threshold.
// tools/recorder/report.ts prints these for a recorded trace, so tuning is reading a table (docs/detector-tuning.md).
// This table does not decide anything: the detectors in ./defs do. It imports their own helpers and thresholds
// where they are exported; a number written out here is written out in the detector too, and is named beside it.
// A new move needs an entry here: tests/moves/report.test.ts fails without one.
import type { Baseline, PoseFrame, PoseHistory } from "../core/types";
import {
  JOINT, clamp01, elbowAngle, joint, latest, recent, shoulderCenter, shoulderWidth,
} from "../pose/signals";
import { FULL_REACH, MAX_GAP, atChest, reach } from "./defs/aegisPush";
import { STEADY_MS, guard } from "./defs/block";
import { sideStep } from "./defs/dodgeLeft";
import { CHAMBER_MS, KICK_LIFT, KICK_STRAIGHT, chambered } from "./defs/frontKick";
import { move as jump } from "./defs/jump";
import { HOLD_MS, KNEE_BEND, KNEE_LIFT, RISE_MS, grounded, raised } from "./defs/knee";
import { drawn, handToShoulder } from "./defs/moonArrow";
import { WINDUP_MS, handsDrop, loaded } from "./defs/stakeThrust";
import { WIDE } from "./defs/sunBurst";
import { HOOK_BENT, HOOK_HEIGHT, HOOK_LIFT, HOOK_STRAIGHT, SWEEP_FROM, SWEEP_SPAN } from "./defs/hook";
import {
  BENT, ELBOW_LOW, LOW_START, RISE_BY, RISE_HIGH, RISE_LOW, RISE_MS as HAND_RISE_MS, RISING_PALM_BEND, SHOULDER_HEIGHT,
  SIDEWAYS, SNAP_MS, STRAIGHT, THROW_DEGREES, THROW_MS, UPPERCUT_BEND, armOpening, armOut, bodyWidth, flungWide, heldReach,
  otherSide, otherThrowing, overBand, risingHand, sidewaysTravel, sweptAcross, throwDegrees, torsoLength, travel,
  upperArmLift, wristGap, wristOut, wristRise,
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
/** A yes-or-no check the detector rules out, read as 1 for yes and 0 for no. */
const not = (name: string, check: (history: PoseHistory) => boolean): Single =>
  atMost(`${name} (1 yes, 0 no)`, 0, (history) => (check(history) ? 1 : 0), 1);
/** `strike` at full confidence: out on two frames, thrown fast, not from over the head, not swept sideways. */
const strike = (side: Side): Single[] => [
  atLeast(`${side} arm out on this frame and the one before, 0 to 1`, ON, (history) => heldReach(history, side)),
  atLeast(`${side} elbow opened or upper arm rose in ${String(THROW_MS)} ms, degrees`, THROW_DEGREES, (history) => throwDegrees(history, side)),
  over(`ms since ${side} hand was over the punching band`, 500, since((frame, baseline) => overBand(frame, side, baseline))),
  under(`${side} fist's sideways travel in ${String(THROW_MS)} ms, when not mostly up, shoulder widths`, SIDEWAYS,
    (history) => sidewaysTravel(history, side)),
];
/** Jab and cross: one fist punched, the other arm not on its way out, and not the rising strike on that side. */
const oneHanded = (side: Side, bentBelow: number): Measure[] => [
  not(`${otherSide(side)} arm on its way out too`, (history) => otherThrowing(history, side)),
  not(`${side} hand rising with the elbow low (an uppercut or rising palm)`, (history) => risingHand(history, side, bentBelow)),
  ...strike(side),
];
/** The biggest rise of `side`'s wrist over the last RISE_MS from a frame where `from` held, in shoulder widths. */
const risen = (side: Side, from: (rise: number) => boolean): Read => (history) => {
  const rise = now((frame) => wristRise(frame, side))(history);
  const rises = recent(history, HAND_RISE_MS).filter((old) => from(wristRise(old, side))).map((old) => rise - wristRise(old, side));
  return Math.max(-Infinity, ...rises);
};
/** `risingHand`: uppercut and rising palm. The 1.2 is written out in handSignals.ts too. */
const rising = (side: Side, bentBelow: number): Measure[] => [
  atLeast(`${side} wrist above the shoulder line, shoulder widths`, RISE_LOW, now((frame) => wristRise(frame, side)), 1),
  atMost(`${side} wrist above the shoulder line, shoulder widths`, RISE_HIGH, now((frame) => wristRise(frame, side))),
  atMost(`${side} wrist out to its side, shoulder widths`, 1.2, now((frame) => wristOut(frame, side))),
  atMost(`${side} elbow bent, degrees`, bentBelow, now(elbow(side))),
  atMost(`${side} upper arm lifted from hanging, degrees`, ELBOW_LOW, now((frame) => upperArmLift(frame, side))),
  not(`${side} elbow opening fast`, (history) => armOpening(history, side)),
  not(`${side} fist swept across`, (history) => sweptAcross(history, side)),
  atLeast(`${side} wrist's rise in ${String(HAND_RISE_MS)} ms from under ${String(LOW_START)}, shoulder widths`, RISE_BY,
    risen(side, (rise) => rise < LOW_START)),
  under(`${otherSide(side)} wrist's rise in ${String(HAND_RISE_MS)} ms (both rising is a guard), shoulder widths`, RISE_BY / 2,
    risen(otherSide(side), () => true)),
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
  atLeast(`${otherSide(bow)} hand from its shoulder, shoulder widths`, 0.75, now((frame) => handToShoulder(frame, otherSide(bow)))),
  atLeast(`ms the draw was held (${bow} arm out, other hand at its shoulder)`, 150, drawnFor(bow)),
];
const chain = (side: Side): Measure[] => [
  ...thrust(side),
  notOut(otherSide(side)),
  atMost(`ms since ${otherSide(side)} arm was out`, 700, since((frame, baseline) => armOut(frame, otherSide(side), baseline))),
];
const dodge = (way: -1 | 1): Measure[] =>
  [atLeast("side step confidence (0.7 is 0.42 shoulder widths off the baseline)", ON, (history) => sideStep(history, way))];

// Trident sweep: its two helpers are private to the detector, so they are repeated here.
const offset = (frame: PoseFrame, wrist: number): number => joint(frame.image, wrist).x - shoulderCenter(frame).x;
/** How far inside the band from head to hips the wrists are, in shoulder widths. Negative is outside it. */
const inBand: FrameRead = (frame) => {
  const hips = (joint(frame.image, JOINT.leftHip).y + joint(frame.image, JOINT.rightHip).y) / 2;
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
  jab: one(
    ...oneHanded("left", RISING_PALM_BEND),
    not("left fist swept across (a hook's path)", (history) => sweptAcross(history, "left")),
  ),
  cross: one(...oneHanded("right", UPPERCUT_BEND)),
  spear_thrust: one(
    not("both arms flung out to their sides (a sun burst)", (history) => {
      const frame = latest(history);
      return !!frame && flungWide(frame, "left") && flungWide(frame, "right");
    }),
    ...punch("left"),
    ...punch("right"),
  ),
  double_palm: one(...thrust("left"), ...thrust("right"), under("gap between the wrists, shoulder widths", 0.8, now(wristGap))),
  chain_punch: eitherSide(chain),
  reverse_punch: one(
    ...thrust("right"),
    under("left wrist above the shoulder line, shoulder widths", -0.9, now((frame) => wristRise(frame, "left"))),
    under("left elbow bent, degrees", 130, now(elbow("left"))),
  ),
  hook: one(
    atLeast("left elbow bend, degrees", HOOK_BENT, now(elbow("left"))),
    atMost("left elbow bend, degrees", HOOK_STRAIGHT, now(elbow("left"))),
    atMost("left fist off the shoulder line, shoulder widths", HOOK_HEIGHT, now((frame) => Math.abs(wristRise(frame, "left")))),
    atLeast("left upper arm lifted from hanging, degrees", HOOK_LIFT, now((frame) => upperArmLift(frame, "left"))),
    atMost(`widest left elbow in ${String(THROW_MS)} ms, degrees`, HOOK_STRAIGHT, (history) =>
      Math.max(...recent(history, THROW_MS).map((old) => elbowAngle(old, "left")))),
    atLeast(`left fist's swing across in ${String(THROW_MS)} ms, more than up, shoulder widths`, 0, (history) => {
      const { across, up } = travel(history, "left", THROW_MS);
      return across - up;
    }, 1),
    atLeast(`left fist's swing across in ${String(THROW_MS)} ms, confidence (0 at ${String(SWEEP_FROM)}, 1 at ${String(SWEEP_FROM + SWEEP_SPAN)} shoulder widths)`,
      ON, (history) => clamp01((travel(history, "left", THROW_MS).across - SWEEP_FROM) / SWEEP_SPAN)),
  ),
  uppercut: one(...rising("right", UPPERCUT_BEND)),
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
    `${side} hand was over the nose`, 500, overNose(side),
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
    atLeast("less straight elbow, degrees", 140, now(both(elbow, Math.min))),
    under("gap between the wrists, shoulder widths", MAX_GAP, now(wristGap)),
    atMost("ms since both hands were at the chest, elbows bent", 450, since(atChest)),
    atLeast("nearer wrist's reach forward, 3D shoulder widths", ON * FULL_REACH,
      now(both((side) => (frame, baseline) => reach(frame, side, baseline), Math.min))),
  ),
  sun_burst: one(
    over("less straight elbow, degrees", ARM_STRAIGHT, now(both(elbow, Math.min))),
    under("hand furthest off shoulder height, torso lengths", SHOULDER_HEIGHT, now(both(offLevel, Math.max))),
    over("nearer wrist out to its side of its shoulder, 3D shoulder widths", WIDE, now(both((side) => (frame, baseline) => {
      const across = joint(frame.world, wristOf(side)).x - joint(frame.world, shoulderOf(side)).x;
      return (side === "left" ? -across : across) / bodyWidth(frame, baseline);
    }, Math.min))),
    atMost("ms since the hands were together (under 0.8 shoulder widths)", 500, since((frame) => wristGap(frame) < 0.8)),
  ),
  moon_arrow: eitherSide(arrow),
  stake_thrust: one(
    under("gap between the wrists, shoulder widths", 0.75, now(wristGap)),
    over("hands below the shoulders, shoulder widths", 0.9, now(handsDrop)),
    over("less straight elbow, degrees", 135, now(both(elbow, Math.min))),
    atMost("ms since the hands were loaded at the chest", WINDUP_MS, since(loaded)),
  ),
  trident_sweep: one(
    atLeast("wrists inside head-to-hip height now, shoulder widths", 0, now(inBand), 1),
    atLeast("wrists inside head-to-hip height 350 ms ago, shoulder widths", 0, ago(350, (_, earlier) => inBand(earlier, null)), 1),
    atLeast("hands' distance from the chest line, start and end on opposite sides, shoulder widths", 0.3, sweep((left, right) => {
      const from = (left[0] + right[0]) / 2;
      const to = (left[1] + right[1]) / 2;
      return from * to < 0 ? Math.min(Math.abs(from), Math.abs(to)) : 0;
    })),
    atLeast("slower wrist's travel in 350 ms, both the same way, shoulder widths", 1, sweep((left, right) => {
      const [a, b] = [left[1] - left[0], right[1] - right[0]];
      return a * b > 0 ? Math.min(Math.abs(a), Math.abs(b)) : 0;
    })),
  ),
  swift_dash: one(atLeast("shoulders moved sideways in 250 ms, baseline shoulder widths", 0.6, ago(250, (frame, earlier, history) =>
    history.baseline ? Math.abs(shoulderCenter(frame).x - shoulderCenter(earlier).x) / history.baseline.shoulderWidth : NaN))),
  front_kick: eitherSide(kick),
  knee: eitherSide(knee),
  block: one(
    ...SIDES.map((side): Measure => ({
      name: `${side} arm not punching`,
      anyOf: [...notOutParts(side),
        over(`ms since elbow was bent under ${String(THRUST_BENT)}`, THRUST_MS, sinceBent(side, THRUST_BENT))],
    })),
    atLeast("guard confidence (1 is both fists within 0.8 shoulder widths of the nose, 0 from 1.3)", ON, (history) => {
      const frame = latest(history);
      return frame ? Math.max(guard([frame]), guard(recent(history, STEADY_MS))) : NaN;
    }),
  ),
  duck: one(atLeast("shoulders below the baseline, baseline shoulder widths", ON * 0.6, (history) => {
    const frame = latest(history);
    const standing = history.baseline;
    return frame && standing ? (shoulderCenter(frame).y - standing.shoulderY) / standing.shoulderWidth : NaN;
  })),
  dodge_left: one(...dodge(-1)),
  dodge_right: one(...dodge(1)),
  jump: one(atLeast("hop confidence (0.7 is shoulders and head up 0.18 shoulder widths)", ON, (history) => jump.detect(history))),
};
