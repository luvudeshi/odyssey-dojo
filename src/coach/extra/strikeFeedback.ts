// One line of coaching for a move that has just counted in a fight: a grade word, bonus points and, when
// something was off, the single most important thing to fix ("Hands too low"). Read from the body: each move
// has its own short list of checks, measured on the frame where the move was at its fullest. Pure and cheap:
// called once per counted move. docs/move-feedback.md has the table of moves, measures and tips.
// Nothing here is spoken or played: the words are for a pop-up on the screen.
import type { Baseline, PoseFrame, PoseHistory } from "../../core/types";
import { guard } from "../../moves/defs/block";
import { shiftOver } from "../../moves/defs/dodgeLeft";
import { handsDrop } from "../../moves/defs/stakeThrust";
import { otherSide, upperArmLift, wristGap, wristOut, wristRise } from "../../moves/handSignals";
import type { Side } from "../../moves/handSignals";
import { footLift, kneeAngle, kneeLift, legsVisible } from "../../moves/legSignals";
import {
  JOINT, SEEN, clamp01, elbowAngle, headHeight, headOffset, joint, shoulderCenter, shoulderWidth, shoulderWidth3d,
} from "../../pose/signals";
import { POINTS } from "../grade";

export type FeedbackGrade = "EXCELLENT" | "GREAT" | "GOOD" | "NEEDS IMPROVEMENT";

export interface StrikeFeedback {
  readonly grade: FeedbackGrade;
  /** A bonus for the grade. Shown with the grade; the fight's own score is not changed by this module. */
  readonly points: number;
  /** One short thing to fix, at most TIP_MAX characters, or null when nothing was off (or nothing could be measured). */
  readonly tip: string | null;
}

/**
 * The top and bottom are the Training Dojo's own (POINTS in ../grade.ts: 150 for excellent, 25 for needs
 * improvement), GREAT is the Dojo's "good" (100), and GOOD is what the fight gives for a defend that counted (50).
 */
export const FEEDBACK_POINTS: Readonly<Record<FeedbackGrade, number>> = {
  EXCELLENT: POINTS.excellent, GREAT: POINTS.good, GOOD: 50, "NEEDS IMPROVEMENT": POINTS.needs_work,
};

/** A tip has to fit a small flash. */
export const TIP_MAX = 24;
/** The move is looked for in this much of the history, so it does not matter whether it is read as it counts or a moment later. */
const WINDOW_MS = 600;
/** A miss (0 to 1, after its weight) smaller than this is not worth a tip... */
const TIP_AT = 0.25;
/** ...from here the grade drops to GOOD, and from here to NEEDS IMPROVEMENT. */
const GOOD_AT = 0.5;
const POOR_AT = 0.8;
/** With clean form, a strike at least this well thrown (the Dojo's EXCELLENT_AT) is excellent. */
const EXCELLENT_QUALITY = 0.7;
/** With no body to read, the fight's own lines for PERFECT, GREAT and GOOD (rating in src/pose/quality.ts). */
const QUALITY_LINES: readonly (readonly [number, FeedbackGrade])[] = [[0.92, "EXCELLENT"], [0.8, "GREAT"], [0.55, "GOOD"]];

/** What a check gets to look at. */
interface View {
  /** The frame where the move was at its fullest. */
  readonly top: PoseFrame;
  /** The arm or leg that made the move; for two-handed moves and defends, "left". */
  readonly side: Side;
  readonly frames: readonly PoseFrame[];
  readonly baseline: Baseline | null;
  readonly quality: number | undefined;
}

interface Check {
  /** What is said. With more than one wording, `pick` chooses; left out, the first. */
  readonly tips: readonly [string, ...string[]];
  pick?(view: View): string;
  /** What is measured, for the table in the docs and the tests. */
  readonly measures: string;
  /** How much a full miss of this check counts, 0 to 1. Left out: 1. */
  readonly weight?: number;
  /** 0 when fine, 1 when as far off as it gets. 0 as well when its joints are not seen. */
  miss(view: View): number;
}

interface Rule {
  /** Which arm or leg may make the move. */
  readonly sides: readonly Side[];
  /** Higher where the move is fuller: picks the frame, and the side for an either-side move. */
  fullness(frame: PoseFrame, side: Side, baseline: Baseline | null): number;
  /** Most important first: a tie goes to the earlier check. */
  readonly checks: readonly Check[];
}

const BOTH: readonly Side[] = ["left", "right"];
const wristOf = (side: Side): number => (side === "left" ? JOINT.leftWrist : JOINT.rightWrist);
const elbowOf = (side: Side): number => (side === "left" ? JOINT.leftElbow : JOINT.rightElbow);
const shoulderOf = (side: Side): number => (side === "left" ? JOINT.leftShoulder : JOINT.rightShoulder);

function seen(frame: PoseFrame, ...indices: number[]): boolean {
  return indices.every((index) => joint(frame.image, index).visibility >= SEEN);
}
const armSeen = (frame: PoseFrame, side: Side): boolean => seen(frame, elbowOf(side), wristOf(side));

/** 0 at `fine`, 1 at `worst`, straight in between. Works whichever of the two is larger. */
function off(value: number, fine: number, worst: number): number {
  return Number.isFinite(value) ? clamp01((fine - value) / (fine - worst)) : 0;
}

/** A punching arm is up at about shoulder height; a hanging arm is straight too, and must not be taken for one. */
const armUp = (frame: PoseFrame, side: Side): number => (wristRise(frame, side) > -0.9 ? 0 : -1000);
const straightArm = (frame: PoseFrame, side: Side): number => elbowAngle(frame, side) + armUp(frame, side);
const bothArms = (frame: PoseFrame): number => Math.min(straightArm(frame, "left"), straightArm(frame, "right"));
/** How far the striking shoulder is in front of the other, in 3D shoulder widths: 0 square to the camera. */
function turn(frame: PoseFrame, side: Side): number {
  const width = shoulderWidth3d(frame);
  if (width === 0) return NaN;
  return (joint(frame.world, shoulderOf(otherSide(side))).z - joint(frame.world, shoulderOf(side)).z) / width;
}
const lowerHand = (frame: PoseFrame): number => Math.min(wristRise(frame, "left"), wristRise(frame, "right"));
const dropOf = (frame: PoseFrame, baseline: Baseline | null): number =>
  baseline && baseline.shoulderWidth > 0 ? (shoulderCenter(frame).y - baseline.shoulderY) / baseline.shoulderWidth : NaN;

// The checks. Thresholds are in the units of the helpers they read: shoulder widths of the picture, or degrees.
/**
 * A punching elbow reads as straight from STRAIGHT_FROM degrees and as a full miss at BENT_AT. A fist thrown at the
 * camera reads 20 to 30 degrees short of straight (handSignals.ts), and the strike detector counts an arm as out
 * from about 104 degrees, so the tip ("Extend your arm fully") only comes under about 128 degrees.
 */
const STRAIGHT_FROM = 135;
const BENT_AT = 105;
const extend: Check = {
  tips: ["Extend your arm fully"], measures: "elbow angle of the punching arm at its straightest",
  miss: ({ top, side }) => (armSeen(top, side) ? off(elbowAngle(top, side), STRAIGHT_FROM, BENT_AT) : 0),
};
const extendBoth: Check = {
  tips: ["Extend both arms fully"], measures: "the less straight elbow at the end of the push",
  miss: ({ top }) => (armSeen(top, "left") && armSeen(top, "right")
    ? off(Math.min(elbowAngle(top, "left"), elbowAngle(top, "right")), STRAIGHT_FROM, BENT_AT)
    : 0),
};
const guardHand: Check = {
  tips: ["Guard hand by your chin"], measures: "height of the other wrist against the shoulder line as the strike lands", weight: 0.7,
  miss: ({ top, side }) => (seen(top, wristOf(otherSide(side))) ? off(wristRise(top, otherSide(side)), -0.75, -1.5) : 0),
};
const handsUp: Check = {
  tips: ["Keep your hands up"], measures: "height of the lower wrist against the shoulder line", weight: 0.45,
  miss: ({ top }) => (seen(top, JOINT.leftWrist, JOINT.rightWrist) ? off(lowerHand(top), -0.9, -1.7) : 0),
};
const hips: Check = {
  tips: ["Turn your hips into it"], measures: "how far the striking shoulder has turned in front of the other (the shoulders follow the hips)", weight: 0.45,
  miss: ({ top, side }) => (armSeen(top, side) ? off(turn(top, side), 0.2, -0.05) : 0),
};
const snap = (tip: string): Check => ({
  tips: [tip], measures: "the strike's quality score (mostly speed), when the shape was right", weight: 0.6,
  miss: ({ quality }) => (quality === undefined ? 0 : off(quality, 0.55, 0.25)),
});
/** The fist ends `rise` shoulder widths above the shoulder line, give or take. */
const height = (high: string, low: string, rise: number, weight = 0.6): Check => ({
  tips: high === low ? [high] : [low, high],
  pick: ({ top, side }) => (wristRise(top, side) < rise ? low : high),
  measures: `height of the striking wrist against the shoulder line (aim ${String(rise)} shoulder widths above it)`, weight,
  miss: ({ top, side }) => (seen(top, wristOf(side)) ? off(Math.abs(wristRise(top, side) - rise), 0.7, 1.4) : 0),
});
const bentElbow: Check = {
  tips: ["Keep your elbow bent"], measures: "elbow angle of the striking arm (a bent arm, not a straight one)", weight: 0.8,
  miss: ({ top, side }) => (armSeen(top, side) ? off(elbowAngle(top, side), 125, 160) : 0),
};
/** How high the hand got before it came down, over everything in the history. */
const windUp = (tip: string): Check => ({
  tips: [tip], measures: "the highest the striking wrist got above the shoulder line before coming down",
  miss: ({ frames, side }) => off(Math.max(...frames.filter((frame) => seen(frame, wristOf(side))).map((frame) => wristRise(frame, side))), 1.3, 0.7),
});
const followThrough: Check = {
  tips: ["Bring it right down"], measures: "how far below the shoulder line the wrist ends", weight: 0.7,
  miss: ({ top, side }) => (seen(top, wristOf(side)) ? off(wristRise(top, side), -0.3, 0.2) : 0),
};

const straight = (sides: readonly Side[], ...more: Check[]): Rule =>
  ({ sides, fullness: straightArm, checks: [extend, ...more] });
const twoHanded = (...more: Check[]): Rule => ({ sides: ["left"], fullness: bothArms, checks: [extendBoth, ...more] });
const together = (tip: string, gap: number): Check => ({
  tips: [tip], measures: "gap between the two wrists", weight: 0.7,
  miss: ({ top }) => (seen(top, JOINT.leftWrist, JOINT.rightWrist) ? off(wristGap(top), gap, gap + 0.6) : 0),
});
const chestHeight: Check = {
  tips: ["Push at chest height"], measures: "height of the two wrists against the shoulder line", weight: 0.6,
  miss: ({ top }) => (seen(top, JOINT.leftWrist, JOINT.rightWrist) ? off(Math.abs((wristRise(top, "left") + wristRise(top, "right")) / 2 + 0.2), 0.7, 1.4) : 0),
};
const rising = (side: Side, higher: string): Rule => ({
  sides: [side],
  fullness: wristRise,
  checks: [
    { tips: [higher], measures: "how high the wrist rises above the shoulder line", miss: ({ top }) => (seen(top, wristOf(side)) ? off(wristRise(top, side), 0.35, 0) : 0) },
    bentElbow, guardHand, snap("Drive it up faster"),
  ],
});
const chop = (side: Side, higher: string): Rule => ({
  sides: [side],
  // The end of the chop: the newest frame. (The lowest hand would pick the arm hanging before the wind-up.)
  fullness: (frame) => frame.t,
  checks: [windUp(higher), followThrough, guardHand, snap("Swing it down faster")],
});
const dodge = (way: -1 | 1): Rule => {
  const word = way === -1 ? "left" : "right";
  return {
    sides: ["left"],
    fullness: (frame, _, baseline) => way * (baseline ? shiftOver([frame], baseline) : headOffset(frame)),
    checks: [
      {
        tips: ["Step, don't just lean"], measures: "how far the head leans off the shoulders against how far the shoulders moved",
        miss: ({ top, baseline }) => {
          const lean = way * headOffset(top);
          const moved = baseline && baseline.shoulderWidth > 0 ? (way * (shoulderCenter(top).x - baseline.centerX)) / baseline.shoulderWidth : lean;
          return seen(top, JOINT.nose) && moved < 0.25 ? off(lean, 0.25, 0.5) : 0;
        },
      },
      {
        tips: [`Step further ${word}`], measures: "how far the shoulders and head moved off the line since calibration",
        miss: ({ top, baseline }) => (baseline ? off(way * shiftOver([top], baseline), 0.6, 0.25) : 0),
      },
      handsUp,
    ],
  };
};
const leg = (lift: (frame: PoseFrame, side: Side) => number, checks: readonly Check[]): Rule => ({
  sides: BOTH, fullness: (frame, side) => (legsVisible(frame) ? lift(frame, side) : -1000), checks,
});
const legCheck = (tip: string, measures: string, read: (frame: PoseFrame, side: Side) => number, fine: number, worst: number): Check => ({
  tips: [tip], measures, miss: ({ top, side }) => (legsVisible(top) ? off(read(top, side), fine, worst) : 0),
});
/** How far the fist has swung in past its own shoulder; an arm that is not lifted is the guard, not the hook. */
const hooked = (frame: PoseFrame, side: Side): number => -wristOut(frame, side) + armUp(frame, side) + (upperArmLift(frame, side) >= 30 ? 0 : -1000);
/** One hand lower than the other by this much is that hand's fault, not both. */
const UNEVEN = 0.35;

/** The checks for every move a fight asks for, by move id. */
export const FEEDBACK_RULES: Readonly<Record<string, Rule>> = {
  jab: straight(["left"], guardHand, height("Aim lower, at the chin", "Aim higher, at the chin", 0), snap("Snap it out faster")),
  cross: straight(["right"], guardHand, hips, height("Aim lower, at the chin", "Aim higher, at the chin", 0), snap("Snap it out faster")),
  reverse_punch: straight(["right"], hips, height("Punch at chest height", "Punch at chest height", -0.2), snap("Snap it out faster")),
  chain_punch: straight(BOTH,
    { tips: ["Punch down the middle"], measures: "how far the punching fist ends from the centre line", weight: 0.6, miss: ({ top, side }) => (seen(top, wristOf(side)) ? off(wristOut(top, side), 0.9, 1.5) : 0) },
    guardHand, snap("Punch faster, one-two")),
  spear_thrust: twoHanded(together("Hands closer together", 1.1), chestHeight, snap("Thrust faster")),
  double_palm: twoHanded(together("Palms side by side", 0.9), chestHeight, snap("Push faster")),
  hook: {
    sides: BOTH,
    fullness: hooked,
    checks: [
      { tips: ["Lift your elbow higher"], measures: "the upper arm's lift from hanging (level is 90 degrees)", weight: 0.8, miss: ({ top, side }) => (seen(top, elbowOf(side)) ? off(upperArmLift(top, side), 65, 40) : 0) },
      bentElbow, guardHand, hips, snap("Swing it faster"),
    ],
  },
  uppercut: rising("right", "Drive the fist higher"),
  rising_palm: rising("left", "Drive the palm higher"),
  hammer_fist: chop("left", "Raise your fist higher"),
  overhead_strike: chop("right", "Raise your hand higher"),
  knife_hand: {
    sides: ["right"],
    fullness: (frame, side) => wristOut(frame, side) + armUp(frame, side),
    checks: [
      { tips: ["Open your arm out more"], measures: "elbow angle at the end of the chop", miss: ({ top, side }) => (armSeen(top, side) ? off(elbowAngle(top, side), 140, 100) : 0) },
      height("Chop lower: neck height", "Chop higher: neck height", 0), guardHand, snap("Chop faster"),
    ],
  },
  stake_thrust: {
    sides: ["left"],
    // Hanging arms are low too, but apart: only a grip counts.
    fullness: (frame) => handsDrop(frame) + (wristGap(frame) < 0.9 ? 0 : -1000),
    checks: [
      { tips: ["Drive it down further"], measures: "how far below the shoulders the hands are driven", miss: ({ top }) => (seen(top, JOINT.leftWrist, JOINT.rightWrist) ? off(handsDrop(top), 1.1, 0.8) : 0) },
      { tips: ["Straighten your arms"], measures: "the less straight elbow at the finish", miss: ({ top }) => (armSeen(top, "left") && armSeen(top, "right") ? off(Math.min(elbowAngle(top, "left"), elbowAngle(top, "right")), 150, 125) : 0) },
      together("Hands closer together", 0.6),
    ],
  },
  front_kick: leg(footLift, [
    legCheck("Kick higher", "how far the kicking foot is above the standing foot", footLift, 1.1, 0.5),
    legCheck("Straighten your leg", "knee angle of the kicking leg at full reach", kneeAngle, 155, 120),
    handsUp, snap("Snap the kick out faster"),
  ]),
  knee: leg(kneeLift, [
    legCheck("Knee higher", "how far the knee is above the other knee", kneeLift, 0.8, 0.5),
    legCheck("Tuck your foot under", "knee angle of the lifted leg (folded is small)", kneeAngle, 100, 125),
    handsUp, snap("Drive the knee up faster"),
  ]),
  block: {
    sides: ["left"],
    // With one hand down the guard reads 0 throughout: then the frame with the hands highest.
    fullness: (frame) => guard([frame]) + 0.01 * (wristRise(frame, "left") + wristRise(frame, "right")),
    checks: [
      {
        tips: ["Hands too low", "Raise your left hand", "Raise your right hand"],
        pick: ({ top }) => {
          const gap = wristRise(top, "left") - wristRise(top, "right");
          return Math.abs(gap) < UNEVEN ? "Hands too low" : gap < 0 ? "Raise your left hand" : "Raise your right hand";
        },
        measures: "height of the lower wrist against the shoulder line (and which hand it is)",
        miss: ({ top }) => (seen(top, JOINT.leftWrist, JOINT.rightWrist) ? off(lowerHand(top), -0.15, -0.45) : 0),
      },
      {
        tips: ["Fists closer to face"], measures: "distance of the further fist from the nose", weight: 0.8,
        miss: ({ top }) => {
          const width = shoulderWidth(top);
          const nose = joint(top.image, JOINT.nose);
          const far = Math.max(...BOTH.map((side) => Math.hypot(joint(top.image, wristOf(side)).x - nose.x, joint(top.image, wristOf(side)).y - nose.y)));
          return seen(top, JOINT.nose, JOINT.leftWrist, JOINT.rightWrist) ? off(far / width, 0.9, 1.4) : 0;
        },
      },
      {
        tips: ["Elbows in, forearms up"], measures: "how far each elbow sits below its wrist (an upright forearm)", weight: 0.7,
        miss: ({ top }) => (armSeen(top, "left") && armSeen(top, "right")
          ? off(Math.min(...BOTH.map((side) => (joint(top.image, elbowOf(side)).y - joint(top.image, wristOf(side)).y) / shoulderWidth(top))), 0.65, 0.35)
          : 0),
      },
    ],
  },
  duck: {
    sides: ["left"],
    fullness: (frame, _, baseline) => (baseline ? dropOf(frame, baseline) : -headHeight(frame)),
    checks: [
      {
        tips: ["Bend knees, not waist"], measures: "the head folding down onto the shoulders while the shoulders barely drop",
        miss: ({ top, baseline }) => (seen(top, JOINT.nose) && baseline && dropOf(top, baseline) < 0.3 ? off(headHeight(top), 0.35, 0) : 0),
      },
      { tips: ["Bend your knees deeper"], measures: "how far the shoulders drop below where they were at calibration", miss: ({ top, baseline }) => off(dropOf(top, baseline), 0.6, 0.3) },
      handsUp,
    ],
  },
  dodge_left: dodge(-1),
  dodge_right: dodge(1),
  jump: {
    sides: ["left"],
    fullness: (frame) => -shoulderCenter(frame).y,
    checks: [
      { tips: ["Jump higher"], measures: "how far the shoulders rise above where they were at calibration", miss: ({ top, baseline }) => off(-dropOf(top, baseline), 0.35, 0.18) },
      handsUp,
    ],
  },
};

/** Every tip a move can be given, in the order its checks are weighed. Empty for a move with no rules. */
export function tipsFor(moveId: string): readonly string[] {
  return [...new Set((FEEDBACK_RULES[moveId]?.checks ?? []).flatMap((check) => check.tips))];
}

/** What each of a move's checks measures and says, for the table in docs/move-feedback.md. */
export function checksFor(moveId: string): readonly { readonly measures: string; readonly tips: readonly string[] }[] {
  return (FEEDBACK_RULES[moveId]?.checks ?? []).map(({ measures, tips }) => ({ measures, tips }));
}

function fromQuality(quality: number | undefined): StrikeFeedback {
  const grade: FeedbackGrade = quality === undefined || !Number.isFinite(quality)
    ? "GOOD"
    : QUALITY_LINES.find(([line]) => quality >= line)?.[1] ?? "NEEDS IMPROVEMENT";
  return { grade, points: FEEDBACK_POINTS[grade], tip: null };
}

function usable(frame: PoseFrame): boolean {
  return seen(frame, JOINT.leftShoulder, JOINT.rightShoulder) && shoulderWidth(frame) > 0;
}

/**
 * Feedback for a move that has just counted. `history` is the fight's pose history (or bare frames) at that
 * moment or up to half a second after. `quality` is the strike's 0 to 1 score from the fight, when it has one.
 * With no body to read (keyboard play, an unknown move, shoulders out of view) the grade comes from `quality`
 * alone and there is no tip. Never throws.
 */
export function strikeFeedback(
  moveId: string,
  history: PoseHistory | readonly PoseFrame[] | null | undefined,
  quality?: number,
): StrikeFeedback {
  try {
    const rule = FEEDBACK_RULES[moveId];
    const all = !history ? [] : "frames" in history ? history.frames : history;
    const baseline = history && "frames" in history ? history.baseline : null;
    const now = all.at(-1)?.t ?? 0;
    const frames = all.filter((frame) => now - frame.t <= WINDOW_MS && usable(frame));
    if (!rule || frames.length === 0) return fromQuality(quality);
    let best: { top: PoseFrame; side: Side; full: number } | null = null;
    for (const side of rule.sides) {
      for (const frame of frames) {
        const full = rule.fullness(frame, side, baseline);
        if (Number.isFinite(full) && (!best || full > best.full)) best = { top: frame, side, full };
      }
    }
    if (!best) return fromQuality(quality);
    const view: View = { top: best.top, side: best.side, frames: all.filter(usable), baseline, quality };
    let worst = 0;
    let tip: string | null = null;
    for (const check of rule.checks) {
      const miss = check.miss(view) * (check.weight ?? 1);
      if (Number.isFinite(miss) && miss > worst) {
        worst = miss;
        tip = check.pick?.(view) ?? check.tips[0];
      }
    }
    if (worst < TIP_AT) {
      const grade: FeedbackGrade = quality === undefined || quality >= EXCELLENT_QUALITY ? "EXCELLENT" : "GREAT";
      return { grade, points: FEEDBACK_POINTS[grade], tip: null };
    }
    const grade: FeedbackGrade = worst >= POOR_AT ? "NEEDS IMPROVEMENT" : worst >= GOOD_AT ? "GOOD" : "GREAT";
    return { grade, points: FEEDBACK_POINTS[grade], tip };
  } catch {
    return fromQuality(quality);
  }
}
