// Practice mode, the pure parts (issue #172): judge one repetition of a move from its frames, give one plain
// tip for the weakest measured part, and sum up ten repetitions. Frames in, words out: no screen, no clock.
// Each part is measured with the detector's own helpers and thresholds, so the tip names what the detector saw.
// The tips come first; the measuring is below them. Every number that is not a detector's is a first guess,
// not yet tried on a real body. docs/practice.md has the same tables in plain words.
import type { Baseline, MoveDef, PoseFrame, PoseHistory } from "../core/types";
import { guard as guardUp, STEADY_MS } from "../moves/defs/block";
import { sideStep } from "../moves/defs/dodgeLeft";
import { CHAMBER_BEND, CHAMBER_LIFT, CHAMBER_MS, KICK_LIFT, KICK_STRAIGHT } from "../moves/defs/frontKick";
import { HOLD_MS, KNEE_BEND, KNEE_LIFT } from "../moves/defs/knee";
import {
  BENT, SHOULDER_HEIGHT, SNAP_MS, STRAIGHT, armOut, otherSide, torsoLength, wristGap, wristOut, wristRise,
} from "../moves/handSignals";
import type { Side } from "../moves/handSignals";
import { KICK_IDS, SIDES, footLift, kneeAngle, kneeLift, legsVisible } from "../moves/legSignals";
import {
  JOINT, clamp01, elbowAngle, joint, latest, pushFrame, recent, shoulderCenter, shoulderWidth, shoulderWidth3d,
} from "../pose/signals";

/** Repetitions in one practice. */
export const REPS = 10;

/** What the screen shows for a part: a short name (at most 20 characters) and one line (at most 90). */
export interface PracticeTip {
  readonly part: string;
  readonly tip: string;
}

const tip = (part: string, line: string): PracticeTip => ({ part, tip: line });

/** Every tip practice can give. The part names are plain words: the summary says "Work on <part>: <tip>". */
export const PRACTICE_TIPS = {
  // Not the player's doing: said instead of a tip about the move.
  camera: tip("camera", "I cannot see you. Stand where your head and shoulders are in the picture."),
  stance: tip("standing start", "Stand still facing the camera for a second first, so I can measure the move."),
  feet: tip("feet in view", "I cannot see your feet. Step back until your whole body is in the picture."),
  still: tip("no move seen", "I did not see a move. Take your time, then do it once, clearly."),
  // Any move with no table of its own, or one whose every measured part was strong but still did not count.
  strike: tip("whole move", "Do it as one sharp move from your guard, then come straight back to guard."),
  defend: tip("whole move", "Make the move bigger and do it once, clearly, while the attack is coming."),
  // Straight punches and pushes: jab, cross, reverse punch, spear thrust, double palm, chain punch.
  reach: tip("reach", "Reach all the way out, then bring the hand straight back to your face."),
  height: tip("height", "Finish with your fist level with your shoulder, not above or below it."),
  aim: tip("aim", "Send it straight ahead, not out to the side: straight gets there first."),
  snap: tip("speed", "Snap it out fast from a bent arm, then straight back. A slow reach is easy to read."),
  together: tip("hands together", "Keep both palms side by side, so the push lands as one."),
  pull: tip("pulling hand", "Pull your left fist back to your hip as the right goes out, and stay balanced."),
  follow: tip("second punch", "Send the second fist right behind the first, and bring the first one back."),
  // Hook.
  hookBend: tip("elbow bend", "Keep your elbow bent like a hook the whole way; do not let the arm straighten."),
  hookLevel: tip("height", "Swing at shoulder height, with your fist level with your elbow."),
  hookSwing: tip("swing", "Swing it across in one quick move, then bring the hand back to your face."),
  // Uppercut and rising palm.
  drive: tip("drive", "Start with the hand at your waist and drive it up in one quick move."),
  finish: tip("finish", "Finish with your hand at chin height, close in front of you."),
  riseBend: tip("elbow bend", "Keep your elbow bent and close to you: the hand goes up, not out."),
  // Hammer fist, overhead strike, thunderbolt.
  raise: tip("raise", "Lift your hand right over your head, then bring it down in one quick move."),
  drop: tip("finish", "Follow it all the way down, below your shoulder. Let your weight do the work."),
  // Knife hand.
  chamber: tip("start", "Start with your hand across at the other shoulder, then sweep it out fast."),
  sweepOut: tip("sweep", "Sweep further out, past your own side, to knock a reaching arm away."),
  sweepLevel: tip("height", "Keep the sweep level with your shoulders, at neck height."),
  sweepOpen: tip("arm", "Open your arm out nearly straight as the sweep finishes."),
  // Block.
  guard: tip("guard", "Bring both fists right up to your cheeks. Hands at your chest leave your head open."),
  hold: tip("hold", "Keep your fists up for a beat so the guard reads clearly. Once is enough."),
  // Duck.
  depth: tip("depth", "Drop lower: bend your knees until your head is under where it was."),
  knees: tip("knees", "Bend your knees, not your waist, and keep your eyes up on what is coming."),
  // Dodges.
  distance: tip("distance", "Step further: move your whole body off the line, not only your head."),
  stay: tip("staying off", "Stay off the line for a moment. Do not sway straight back into it."),
  toLeft: tip("direction", "Other way: step to your left, off the line of the rush."),
  toRight: tip("direction", "Other way: step to your right, out of the attack's path."),
  // Front kick.
  kickChamber: tip("knee lift", "Lift your knee first, then snap your foot straight out in one quick move."),
  kickHeight: tip("height", "Kick higher: get your foot up to hip height to keep them at leg length."),
  kickStraight: tip("leg", "Push your foot all the way out until your leg is straight, then pull it back."),
  // Knee strike.
  kneeHeight: tip("height", "Drive your knee higher, up toward your hands."),
  kneeFold: tip("tuck", "Keep your foot tucked under your knee. Do not let it swing out."),
  kneeHold: tip("hold", "Hold your knee up for a beat before you set your foot down."),
} as const satisfies Record<string, PracticeTip>;

/** Shown when a repetition counted and no measured part was weak. `RepResult.tip` is null then. */
export const PRAISE = "Good. Same again, and bring your hands back to your face.";

/** How one repetition went. */
export interface RepResult {
  /** The detector reached the line the fight uses (0.7, src/input/poseInput.ts). */
  readonly counted: boolean;
  /** 0..1. A strike: its own quality at the frame it counted. A defense, or a strike with none: the surest the detector got. 0 when it did not count. */
  readonly quality: number;
  /** The surest the detector got, 0..1, so a near miss can be told from nothing. */
  readonly peak: number;
  /** One line for the weakest measured part, at most 90 characters. Null when it counted and nothing was weak. */
  readonly tip: string | null;
  /** The plain name of that part ("reach", "guard"), or null with a null tip. */
  readonly part: string | null;
}

/** The same line the fight uses to count a move. */
const ON = 0.7;
/** A part scoring under this gets the tip. Parts score 0.5 exactly at the detector's own threshold. */
const STRONG = 0.75;
/** A joint has to be this far, in shoulder widths, from where it started for the player to have moved at all. */
const STILL = 0.25;
const SEEN = 0.5;
/** Hips that drop less than this share of what the shoulders drop mean the bend was at the waist. A first guess. */
const KNEES_SHARE = 0.5;

/**
 * One measured part of a move at one moment: 0 far off, 0.5 at the detector's threshold, 1 comfortably past it.
 * A part is either the shape the move ends in (reach, height) or, when `timed`, how the player got there
 * (fast enough, from the right start, held long enough).
 */
interface Part {
  readonly say: PracticeTip;
  readonly timed: boolean;
  score(history: PoseHistory, attempt: readonly PoseFrame[]): number;
}

interface Family {
  /** One list of parts, or one per side for a move either side may make: the side that did best is judged. */
  readonly options: readonly (readonly Part[])[];
  /** Something to say first when the attempt did not count, such as a step the wrong way. */
  gate?(moments: readonly PoseHistory[]): PracticeTip | null;
}

/** 0.5 when `value` is at the detector's `line`, 1 at `full`, 0 as far the other side. `full` may be under `line`. */
function past(value: number, line: number, full: number): number {
  return clamp01(0.5 + (0.5 * (value - line)) / (full - line));
}

function part(say: PracticeTip, score: Part["score"]): Part {
  return { say, timed: false, score };
}

function timed(say: PracticeTip, score: Part["score"]): Part {
  return { say, timed: true, score };
}

/** A part read from the newest frame alone. */
function now(say: PracticeTip, read: (frame: PoseFrame, baseline: Baseline | null) => number): Part {
  return part(say, (history) => {
    const frame = latest(history);
    return frame ? read(frame, history.baseline) : 0;
  });
}

const least = (sides: readonly Side[], read: (side: Side) => number): number => Math.min(...sides.map(read));
const wristOf = (side: Side): number => (side === "left" ? JOINT.leftWrist : JOINT.rightWrist);
const shoulderOf = (side: Side): number => (side === "left" ? JOINT.leftShoulder : JOINT.rightShoulder);

/** How far the fist is from shoulder height, as a share of what `armOut` allows (handSignals.ts). */
function offLevel(frame: PoseFrame, side: Side, baseline: Baseline | null): number {
  const limit = SHOULDER_HEIGHT * torsoLength(frame, baseline);
  if (limit === 0) return 2;
  return Math.abs(joint(frame.world, wristOf(side)).y - joint(frame.world, shoulderOf(side)).y) / limit;
}

/** Milliseconds since the elbow was last bent tighter than `punch` asks for, or null if it has not been. */
function sinceBent(history: PoseHistory, side: Side): number | null {
  const frame = latest(history);
  const bent = history.frames.filter((old) => elbowAngle(old, side) < BENT).at(-1);
  return frame && bent ? frame.t - bent.t : null;
}

/** A straight punch or push with these hands: far enough, at shoulder height, and fast out of a bent arm. */
function thrust(sides: readonly Side[], extra: readonly Part[] = []): Part[] {
  return [
    now(PRACTICE_TIPS.reach, (frame) => least(sides, (side) => past(elbowAngle(frame, side), STRAIGHT, 175))),
    now(PRACTICE_TIPS.height, (frame, baseline) => least(sides, (side) => past(offLevel(frame, side, baseline), 1, 0.4))),
    ...extra,
    timed(PRACTICE_TIPS.snap, (history) =>
      least(sides, (side) => {
        const ms = sinceBent(history, side);
        return ms === null ? 0 : past(ms, SNAP_MS, SNAP_MS / 2);
      }),
    ),
  ];
}

/** `flungWide` in handSignals.ts: a fist more than 1.2 shoulder widths out to its side was not punched forward. */
const aim = (side: Side): Part => now(PRACTICE_TIPS.aim, (frame) => past(wristOut(frame, side), 1.2, 0.8));

/** The chain punch finishing on `side`: the other hand punched within 700 ms and has come back. */
function chain(side: Side): Part[] {
  const other = otherSide(side);
  const followed = timed(PRACTICE_TIPS.follow, (history) => {
    const frame = latest(history);
    if (!frame || armOut(frame, other, history.baseline)) return 0;
    return recent(history, 700).some((old) => armOut(old, other, history.baseline)) ? 1 : 0;
  });
  return thrust([side], [followed]);
}

/** Uppercut and rising palm (`risingHand` in handSignals.ts): from the waist, up to the chin, elbow bent. */
function rising(side: Side, bentBelow: number): Part[] {
  return [
    timed(PRACTICE_TIPS.drive, (history) =>
      past(Math.min(...recent(history, 400).map((old) => wristRise(old, side))), -1, -1.5),
    ),
    now(PRACTICE_TIPS.finish, (frame) => {
      const rise = wristRise(frame, side);
      return Math.min(past(rise, -0.15, 0.3), past(rise, 1.3, 0.85), past(wristOut(frame, side), 1, 0.6));
    }),
    now(PRACTICE_TIPS.riseBend, (frame) => past(elbowAngle(frame, side), bentBelow, bentBelow - 40)),
  ];
}

/** Shoulder widths the wrist is above the nose. */
function overNose(frame: PoseFrame, side: Side): number {
  const width = shoulderWidth(frame);
  return width === 0 ? -1 : (joint(frame.image, JOINT.nose).y - joint(frame.image, wristOf(side)).y) / width;
}

/** Shoulder widths the wrist is below its own shoulder. */
function underShoulder(frame: PoseFrame, side: Side): number {
  const width = shoulderWidth(frame);
  return width === 0 ? -1 : (joint(frame.image, wristOf(side)).y - joint(frame.image, shoulderOf(side)).y) / width;
}

/** A downward strike: the hand was `over` its line inside the last `ms`, and is now `under` the shoulder line. */
function chop(ms: number, over: (frame: PoseFrame) => number, under: (frame: PoseFrame) => number): Part[] {
  return [
    timed(PRACTICE_TIPS.raise, (history) => past(Math.max(...recent(history, ms).map(over)), 0, 0.4)),
    now(PRACTICE_TIPS.drop, (frame) => past(under(frame), 0, 0.4)),
  ];
}

/** `sideStep` on one frame alone. */
const stepNow = (frame: PoseFrame, baseline: Baseline | null, way: -1 | 1): number =>
  sideStep({ frames: [frame], baseline }, way);

/** The least of a reading over the detector's steadying time, or 0 when the frames do not span most of it yet. */
function held(history: PoseHistory, ms: number, read: (frame: PoseFrame) => number): number {
  const frames = recent(history, ms);
  const first = frames[0];
  const last = frames.at(-1);
  if (!first || !last || last.t - first.t < ms * 0.75) return 0;
  return Math.min(...frames.map(read));
}

function dodge(way: -1 | 1): Family {
  const wrong = way === -1 ? PRACTICE_TIPS.toLeft : PRACTICE_TIPS.toRight;
  return {
    options: [[
      part(PRACTICE_TIPS.distance, (history) => past(sideStep(history, way), ON, 1)),
      timed(PRACTICE_TIPS.stay, (history) =>
        past(held(history, STEADY_MS, (frame) => stepNow(frame, history.baseline, way)), ON, 1),
      ),
    ]],
    gate: (moments) => (moments.some((history) => sideStep(history, way === 1 ? -1 : 1) >= ON) ? wrong : null),
  };
}

const hipY = (frame: PoseFrame): number | null => {
  const left = joint(frame.image, JOINT.leftHip);
  const right = joint(frame.image, JOINT.rightHip);
  return Math.min(left.visibility, right.visibility) < SEEN ? null : (left.y + right.y) / 2;
};

const DUCK: readonly Part[] = [
  // The duck detector: shoulders 0.6 baseline shoulder widths under where they stood is a full duck.
  part(PRACTICE_TIPS.depth, (history) => {
    const frame = latest(history);
    const stood = history.baseline;
    if (!frame || !stood || stood.shoulderWidth <= 0) return 0;
    return past((shoulderCenter(frame).y - stood.shoulderY) / stood.shoulderWidth / 0.6, ON, 1);
  }),
  // Not in the detector: knees bent lower the hips with the shoulders; a bow from the waist leaves them up.
  part(PRACTICE_TIPS.knees, (history, attempt) => {
    const frame = latest(history);
    const stood = history.baseline;
    const hips = frame ? hipY(frame) : null;
    const standing = Math.min(...attempt.map((old) => hipY(old) ?? Infinity));
    if (!frame || !stood || hips === null || !Number.isFinite(standing)) return 1;
    const dropped = shoulderCenter(frame).y - stood.shoulderY;
    // Too small a drop to tell knees from waist: depth is the part to fix.
    if (dropped < STILL * stood.shoulderWidth) return 1;
    return past((hips - standing) / dropped, KNEES_SHARE, 0.8);
  }),
];

/** The front kick on one leg (defs/frontKick.ts): knee up and folded, then the foot high and the leg straight. */
function kick(side: Side): Part[] {
  const seen = (read: (frame: PoseFrame) => number) => (frame: PoseFrame) => (legsVisible(frame) ? read(frame) : 0);
  const chambered = seen((frame) =>
    Math.min(past(kneeLift(frame, side), CHAMBER_LIFT, 0.8), past(kneeAngle(frame, side), CHAMBER_BEND, 80)),
  );
  return [
    timed(PRACTICE_TIPS.kickChamber, (history) => Math.max(...recent(history, CHAMBER_MS).map(chambered))),
    now(PRACTICE_TIPS.kickHeight, seen((frame) => past(footLift(frame, side), KICK_LIFT, 1.3))),
    now(PRACTICE_TIPS.kickStraight, seen((frame) => past(kneeAngle(frame, side), KICK_STRAIGHT, 170))),
  ];
}

/** The knee strike on one leg (defs/knee.ts): knee high, lower leg folded, and kept there for a moment. */
function kneeUp(side: Side): Part[] {
  const raised = (frame: PoseFrame): boolean =>
    legsVisible(frame) && kneeLift(frame, side) >= KNEE_LIFT && kneeAngle(frame, side) < KNEE_BEND;
  return [
    now(PRACTICE_TIPS.kneeHeight, (frame) => (legsVisible(frame) ? past(kneeLift(frame, side), KNEE_LIFT, 0.9) : 0)),
    now(PRACTICE_TIPS.kneeFold, (frame) => (legsVisible(frame) ? past(kneeAngle(frame, side), KNEE_BEND, 85) : 0)),
    timed(PRACTICE_TIPS.kneeHold, (history) => {
      const frame = latest(history);
      if (!frame) return 0;
      let since = frame.t;
      for (const old of [...history.frames].reverse()) {
        if (!raised(old)) break;
        since = old.t;
      }
      return past(frame.t - since, HOLD_MS, 2 * HOLD_MS);
    }),
  ];
}

const one = (parts: readonly Part[]): Family => ({ options: [parts] });

/** The measured parts of each move that has its own table. Every other move is judged by `whole`. */
const FAMILIES: Readonly<Record<string, Family>> = {
  jab: one(thrust(["left"], [aim("left")])),
  cross: one(thrust(["right"], [aim("right")])),
  spear_thrust: one(thrust(["left", "right"])),
  double_palm: one(thrust(["left", "right"], [now(PRACTICE_TIPS.together, (frame) => past(wristGap(frame), 0.8, 0.65))])),
  reverse_punch: one(
    thrust(["right"], [
      // The pulling hand: low at the hip with the elbow bent behind it.
      now(PRACTICE_TIPS.pull, (frame) =>
        Math.min(past(wristRise(frame, "left"), -0.9, -1.3), past(elbowAngle(frame, "left"), 130, 100)),
      ),
    ]),
  ),
  chain_punch: { options: [chain("left"), chain("right")] },
  hook: one([
    now(PRACTICE_TIPS.hookBend, (frame) => {
      const bend = elbowAngle(frame, "left");
      return Math.min(past(bend, 60, 75), past(bend, 130, 115));
    }),
    now(PRACTICE_TIPS.hookLevel, (frame) => past(Math.abs(underShoulder(frame, "left")), 0.6, 0.3)),
    // The detector's own reading: how far the fist crossed the picture in 150 ms, in shoulder widths.
    timed(PRACTICE_TIPS.hookSwing, (history) => {
      const frame = latest(history);
      const earlier = recent(history, 150)[0];
      const width = frame ? shoulderWidth(frame) : 0;
      if (!frame || !earlier || width === 0) return 0;
      return past((joint(frame.image, JOINT.leftWrist).x - joint(earlier.image, JOINT.leftWrist).x) / width, ON, 1);
    }),
  ]),
  uppercut: one(rising("right", 135)),
  rising_palm: one(rising("left", 150)),
  hammer_fist: one(chop(500, (frame) => wristRise(frame, "left") - 1, (frame) => -wristRise(frame, "left"))),
  overhead_strike: one(chop(200, (frame) => overNose(frame, "right"), (frame) => underShoulder(frame, "right"))),
  thunderbolt: {
    options: SIDES.map((side) => chop(500, (frame) => overNose(frame, side), (frame) => underShoulder(frame, side))),
  },
  knife_hand: one([
    timed(PRACTICE_TIPS.chamber, (history) => {
      const across = recent(history, 550).filter((old) => wristRise(old, "right") > -0.6);
      return across.length === 0 ? 0 : past(Math.min(...across.map((old) => wristOut(old, "right"))), 0.1, -0.3);
    }),
    now(PRACTICE_TIPS.sweepOut, (frame) => past(wristOut(frame, "right"), 1.2, 1.6)),
    now(PRACTICE_TIPS.sweepLevel, (frame) => past(Math.abs(wristRise(frame, "right")), 0.7, 0.35)),
    now(PRACTICE_TIPS.sweepOpen, (frame) => past(elbowAngle(frame, "right"), 125, 160)),
  ]),
  block: one([
    now(PRACTICE_TIPS.guard, (frame) => past(guardUp([frame]), ON, 1)),
    timed(PRACTICE_TIPS.hold, (history) => past(held(history, STEADY_MS, (frame) => guardUp([frame])), ON, 1)),
  ]),
  duck: one(DUCK),
  dodge_left: dodge(-1),
  dodge_right: dodge(1),
  front_kick: { options: SIDES.map(kick) },
  knee: { options: SIDES.map(kneeUp) },
};

/** Moves measured against the standing start: without a baseline their detectors read nothing. */
const NEEDS_STANCE: readonly string[] = ["duck", "dodge_left", "dodge_right", "jump", "swift_dash"];

/** Ids of the moves with their own table of parts; the rest get the one tip for their kind. */
export const TABLED_MOVES: readonly string[] = Object.keys(FAMILIES);

const safe = (value: number): number => (Number.isFinite(value) ? clamp01(value) : 0);

/** At or over this a part meets the detector's own threshold. */
const MET = 0.5;

/**
 * The weakest part of the attempt. The shape is read at the best of the `stops` (where the body stopped or turned
 * back): the one where the shape parts add up highest, so one part done badly stands out against the others
 * done well. How the player got there is read at its best over every one of the `moments` the shape met the
 * detector's thresholds, and is not judged at all when the shape never did: then the shape is what to fix.
 * For a move either side may make, the side that did best is the one judged.
 */
function weakest(
  family: Family, stops: readonly PoseHistory[], moments: readonly PoseHistory[], attempt: readonly PoseFrame[],
): { say: PracticeTip; score: number } | null {
  let best: { say: PracticeTip; score: number; total: number } | null = null;
  for (const parts of family.options) {
    const shape = parts.filter((each) => !each.timed);
    const read = (history: PoseHistory): number[] => shape.map((each) => safe(each.score(history, attempt)));
    const scores = new Map<Part, number>();
    let floor = -1;
    let sum = -1;
    for (const history of stops) {
      const here = read(history);
      const low = Math.min(1, ...here);
      const all = here.reduce((total, value) => total + value, 0);
      if (all > sum || (all === sum && low > floor)) {
        floor = low;
        sum = all;
        shape.forEach((each, index) => scores.set(each, here[index] ?? 0));
      }
    }
    for (const history of moments) {
      if (Math.min(1, ...read(history)) < MET) continue;
      for (const each of parts.filter((other) => other.timed)) {
        scores.set(each, Math.max(scores.get(each) ?? 0, safe(each.score(history, attempt))));
      }
    }
    // In table order, so on a tie the part listed first is the one named.
    const judged = parts.filter((each) => scores.has(each));
    const score = Math.min(...judged.map((each) => scores.get(each) ?? 0));
    const say = judged.find((each) => scores.get(each) === score)?.say;
    const total = judged.reduce((all, each) => all + (scores.get(each) ?? 0), 0) / Math.max(1, judged.length);
    if (say && (!best || score > best.score || (score === best.score && total > best.total))) best = { say, score, total };
  }
  return best;
}

const MOVING = [
  JOINT.nose, JOINT.leftShoulder, JOINT.rightShoulder, JOINT.leftElbow, JOINT.rightElbow, JOINT.leftWrist,
  JOINT.rightWrist, JOINT.leftKnee, JOINT.rightKnee, JOINT.leftAnkle, JOINT.rightAnkle,
];

/** Where a joint sat on average over these frames, or null when the tracker was unsure of it in any of them. */
function settled(frames: readonly PoseFrame[], index: number): { x: number; y: number } | null {
  const points = frames.map((frame) => joint(frame.image, index));
  if (points.length === 0 || points.some((point) => point.visibility < SEEN)) return null;
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

/**
 * For each frame, whether some joint is more than STILL shoulder widths from where the attempt started. Both
 * places are averages over a few frames (the first five; this frame and its neighbours), so the shake of a
 * webcam's landmarks is not read as the player moving.
 */
function movedAway(attempt: readonly PoseFrame[]): boolean[] {
  const first = attempt.slice(0, 5);
  const width = first.reduce((sum, frame) => sum + shoulderWidth(frame), 0) / Math.max(1, first.length);
  const from = MOVING.map((index) => settled(first, index));
  return attempt.map((_, at) => {
    if (width === 0) return false;
    const around = attempt.slice(Math.max(0, at - 1), at + 2);
    return MOVING.some((index, joined) => {
      const start = from[joined];
      const here = settled(around, index);
      return start && here ? Math.hypot(here.x - start.x, here.y - start.y) / width >= STILL : false;
    });
  });
}

/** A step smaller than this, in shoulder widths, between two frames is holding still. */
const HELD = 0.05;

/**
 * How every joint the tracker is sure of moved from one frame to the next, as one long vector in shoulder widths:
 * across and down the picture, which shows a step or a duck, and in the 3D body, which shows a fist going out
 * toward the camera and coming back.
 */
function step(from: PoseFrame, to: PoseFrame, width: number): number[] {
  const width3d = shoulderWidth3d(from);
  return MOVING.flatMap((index) => {
    const a = joint(from.image, index);
    const b = joint(to.image, index);
    if (a.visibility < SEEN || b.visibility < SEEN) return [];
    const a3 = joint(from.world, index);
    const b3 = joint(to.world, index);
    const body = width3d === 0 ? [0, 0, 0] : [(b3.x - a3.x) / width3d, (b3.y - a3.y) / width3d, (b3.z - a3.z) / width3d];
    return [(b.x - a.x) / width, (b.y - a.y) / width, ...body];
  });
}

/**
 * True when the body stops or turns back at frame `index`: the end of a punch, the bottom of a duck, a pose
 * being held, or the last frame. A frame on the way from one pose to the next is not an end, so a half-raised
 * arm is not judged as if it were the punch.
 */
function ends(attempt: readonly PoseFrame[], index: number): boolean {
  const frame = attempt[index];
  const next = attempt[index + 1];
  const before = attempt[index - 1];
  if (!frame || !next) return true;
  const width = shoulderWidth(frame);
  if (width === 0) return false;
  const onward = step(frame, next, width);
  const far = Math.hypot(...onward);
  if (far < HELD || !before) return far < HELD;
  const sofar = step(before, frame, width);
  // A joint lost or found between the two steps leaves the vectors different lengths: no telling, so not an end.
  if (sofar.length !== onward.length) return false;
  const along = sofar.reduce((sum, value, at) => sum + value * (onward[at] ?? 0), 0);
  return along <= 0 || far <= 0.5 * Math.hypot(...sofar);
}

const shouldersSeen = (frame: PoseFrame): boolean =>
  joint(frame.image, JOINT.leftShoulder).visibility >= SEEN &&
  joint(frame.image, JOINT.rightShoulder).visibility >= SEEN &&
  shoulderWidth(frame) > 0;

const said = (counted: boolean, quality: number, peak: number, say: PracticeTip | null): RepResult => ({
  counted, quality, peak, tip: say?.tip ?? null, part: say?.part ?? null,
});

/**
 * Judges one repetition. `frames` are the frames of the attempt, oldest first, fed one at a time through the same
 * history the fight keeps (about a second long). `baseline` is the stance from calibration; left out, it is
 * taken from the first 20 frames, so those should be the player standing still. Never throws.
 */
export function judgeRep(move: MoveDef, frames: readonly PoseFrame[], baseline: Baseline | null = null): RepResult {
  const attempt = frames.filter((frame) => Number.isFinite(frame.t));
  if (attempt.filter(shouldersSeen).length * 2 <= attempt.length) return said(false, 0, 0, PRACTICE_TIPS.camera);

  const moments: PoseHistory[] = [];
  let history: PoseHistory = { frames: [], baseline };
  let peak = 0;
  let thrown: number | null = null;
  let countedAt: PoseHistory | null = null;
  for (const frame of attempt) {
    history = pushFrame(history, frame);
    moments.push(history);
    const confidence = safe(move.detect(history));
    if (!countedAt && confidence >= ON) {
      countedAt = history;
      // A strike is scored at the frame it first counts, the way the fight scores it.
      if (move.quality) thrown = safe(move.quality(history));
    }
    peak = Math.max(peak, confidence);
  }
  const counted = countedAt !== null;
  const quality = counted ? (thrown ?? peak) : 0;
  const family = FAMILIES[move.id];
  // Only the moments the player was away from where they started are judged: an arm hanging at the side is
  // straight too, and standing must not be read as the best the attempt got.
  const away = movedAway(attempt);
  const active = moments.filter((_, index) => away[index]);
  // Where the body stopped or turned back, and the frame the move counted at, whether or not it was a stop.
  const stops = moments.filter((history, index) => history === countedAt || (away[index] && ends(attempt, index)));

  if (!counted) {
    const lastSecond = recent(history, 1000);
    if (NEEDS_STANCE.includes(move.id) && !history.baseline) return said(false, 0, peak, PRACTICE_TIPS.stance);
    if (KICK_IDS.includes(move.id) && !lastSecond.some(legsVisible)) return said(false, 0, peak, PRACTICE_TIPS.feet);
    // One frame out of place is the camera shaking, not the player moving.
    if (active.length < 2) return said(false, 0, peak, PRACTICE_TIPS.still);
    const first = family?.gate?.(moments);
    if (first) return said(false, 0, peak, first);
  }
  // A move with no table: its one part is how sure the detector got.
  if (!family) return said(counted, quality, peak, past(peak, ON, 1) < STRONG ? PRACTICE_TIPS[move.kind] : null);
  const weak = weakest(family, stops.length > 0 ? stops : moments, active.length > 0 ? active : moments, attempt);
  if (weak && weak.score < STRONG) return said(counted, quality, peak, weak.say);
  return said(counted, quality, peak, counted ? null : PRACTICE_TIPS[move.kind]);
}

/** A repetition made on the keyboard: it counts, at the quality the fight gives a key press, and has no tip. */
export const KEYBOARD_REP: RepResult = { counted: true, quality: 0.7, peak: 1, tip: null, part: null };

export type Trend = "improving" | "steady" | "tiring";

export interface PracticeSummary {
  readonly total: number;
  readonly counted: number;
  /** Mean quality over every repetition; one that did not count is 0. */
  readonly meanQuality: number;
  readonly bestQuality: number;
  /** Which repetition was best, counting from 1. Null when none counted. */
  readonly bestRep: number | null;
  /** Mean quality of the second half against the first. "steady" under four repetitions. */
  readonly trend: Trend;
  /** The part that was weakest most often, with its tip. Null when no repetition had one. */
  readonly part: string | null;
  readonly tip: string | null;
  /** Two or three plain sentences for the screen, each at most 120 characters. */
  readonly lines: readonly string[];
}

const NOT_THE_MOVE: readonly string[] = [
  PRACTICE_TIPS.camera.part, PRACTICE_TIPS.stance.part, PRACTICE_TIPS.feet.part, PRACTICE_TIPS.still.part,
];
/** The second half has to beat (or trail) the first by this much mean quality to be called a change. */
const TREND_STEP = 0.1;

const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

function ordinal(n: number): string {
  const tens = n % 100;
  const ending = tens >= 11 && tens <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${String(n)}${ending}`;
}

/** Sums up a practice: how many counted, the best one, whether the player got better or tired, and what to work on. */
export function summarise(reps: readonly RepResult[]): PracticeSummary {
  const total = reps.length;
  const qualities = reps.map((rep) => (rep.counted ? safe(rep.quality) : 0));
  const counted = reps.filter((rep) => rep.counted).length;
  const bestQuality = Math.max(0, ...qualities);
  const bestRep = counted === 0 ? null : qualities.indexOf(bestQuality) + 1;
  const half = Math.floor(total / 2);
  const change = total < 4 ? 0 : mean(qualities.slice(total - half)) - mean(qualities.slice(0, half));
  const trend: Trend = change > TREND_STEP ? "improving" : change < -TREND_STEP ? "tiring" : "steady";

  const seen = new Map<string, { count: number; tip: string }>();
  for (const rep of reps) {
    if (rep.part === null || rep.tip === null) continue;
    seen.set(rep.part, { count: (seen.get(rep.part)?.count ?? 0) + 1, tip: seen.get(rep.part)?.tip ?? rep.tip });
  }
  // The most common; on a tie the one met first.
  const common = [...seen].reduce<[string, { count: number; tip: string }] | null>(
    (top, entry) => (top && top[1].count >= entry[1].count ? top : entry),
    null,
  );

  const lines: string[] = [];
  if (total === 0) lines.push("No repetitions yet.");
  else if (bestRep === null) lines.push(`None of your ${String(total)} counted yet. Slow down and make each one clear.`);
  else lines.push(`${String(counted)} of ${String(total)} counted. Your best was your ${ordinal(bestRep)}.`);
  if (trend === "improving") lines.push("You got better as you went: your second half was stronger than your first.");
  if (trend === "tiring") lines.push("Your first half was stronger. Rest for a moment, then go again.");
  if (!common) lines.push(total === 0 ? "Do the move once to start." : PRAISE);
  // "Work on camera" would read oddly: what is not the player's doing is said as it is.
  else lines.push(NOT_THE_MOVE.includes(common[0]) ? common[1].tip : `Work on ${common[0]}: ${common[1].tip}`);

  return {
    total, counted, meanQuality: mean(qualities), bestQuality, bestRep, trend,
    part: common?.[0] ?? null, tip: common?.[1].tip ?? null, lines,
  };
}

/** One practice of one move: the repetitions so far, and whether all of them are in. */
export interface PracticeState {
  readonly moveId: string;
  readonly reps: readonly RepResult[];
  readonly done: boolean;
}

export function startPractice(moveId: string): PracticeState {
  return { moveId, reps: [], done: false };
}

/** The practice with one more repetition. After REPS it is done and further results change nothing. */
export function nextRep(state: PracticeState, result: RepResult): PracticeState {
  if (state.done) return state;
  const reps = [...state.reps, result];
  return { ...state, reps, done: reps.length >= REPS };
}
