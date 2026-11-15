// What the training dojo says about each move it can train, written by hand (docs/dojo.md, "What the coach says"):
// one line for a try that was Excellent, one on how to make the whole move for a try that was not seen with nothing
// measured standing out, and, for the moves judged condition by condition, one tip for each condition that can fail.
// The moves with a table of measured parts (FAMILIES in ./practice) get their tips for a weak part from there.
// The checklist lines are LABELS in ./guide. Words only: nothing here changes what counts or how it is graded.
import type { Baseline, PoseFrame, PoseHistory } from "../core/types";
import type { Side } from "../moves/handSignals";
import { otherSide } from "../moves/handSignals";
import { SIDES } from "../moves/legSignals";
import { readMeasure } from "../moves/measures";
import type { Measure } from "../moves/measures";
import { pushFrame } from "../pose/signals";
import { entryOf } from "./guide";
import type { PracticeTip } from "./practice";

/** One condition of a move's detector that a try can fail, and what to say when it did. */
export interface Fault extends PracticeTip {
  /** Which condition: the start of its name, as LABELS in ./guide keys its rows. */
  readonly key: string;
  readonly kind: "min" | "max" | "anyOf";
}

export interface MoveCoaching {
  /** Shown with Excellent: what was done well. At most 60 characters. */
  readonly well: string;
  /** How to make the whole move, for a try that was not seen and has nothing more exact to say. */
  readonly whole: PracticeTip;
  /** For a move with no table of parts in ./practice: a tip for each of its conditions, the first thing to fix first. */
  readonly faults?: readonly Fault[];
}

const tip = (part: string, line: string): PracticeTip => ({ part, tip: line });
const min = (key: string, part: string, line: string): Fault => ({ key, kind: "min", part, tip: line });
const max = (key: string, part: string, line: string): Fault => ({ key, kind: "max", part, tip: line });
const group = (key: string, part: string, line: string): Fault => ({ key, kind: "anyOf", part, tip: line });
const eitherSide = (build: (side: Side) => Fault[]): Fault[] => SIDES.flatMap(build);
const FEET = min("legs in view", "feet in view", "I cannot see your feet. Step back until your whole body is in the picture.");

/** Every move the dojo can train, by id. tests/dojoCoaching.test.ts fails when one is missing. */
export const COACHING: Readonly<Record<string, MoveCoaching>> = {
  jab: {
    well: "Straight, fast, and back to your guard.",
    whole: tip("whole jab", "Snap your left fist straight out from your chin to shoulder height, then straight back."),
  },
  cross: {
    well: "Straight down the middle with a full reach.",
    whole: tip("whole cross", "Drive your right fist straight out from your chin to shoulder height, then back."),
  },
  hook: {
    well: "Elbow bent, and a fast swing across.",
    whole: tip("whole hook", "Lift your elbow to shoulder height, keep it bent, and swing the fist across."),
  },
  uppercut: {
    well: "Up from the waist with your elbow bent.",
    whole: tip("whole uppercut", "Drop your right fist to your waist, then drive it up to chin height, elbow bent."),
  },
  front_kick: {
    well: "Knee up first, then a straight leg.",
    whole: tip("whole kick", "Lift your knee to hip height, snap your foot straight out, then pull it back."),
  },
  knee: {
    well: "Knee high, with your foot tucked under it.",
    whole: tip("whole knee strike", "Drive one knee up to hip height, foot tucked under it, and hold it a beat."),
  },
  block: {
    well: "Both fists high, and you held them there.",
    whole: tip("whole block", "Bring both fists up beside your cheeks, elbows in, and hold them there a beat."),
  },
  duck: {
    well: "Low enough, with your knees doing the work.",
    whole: tip("whole duck", "Bend your knees and drop straight down until your head would clear a swing."),
  },
  dodge_left: {
    well: "Your whole body moved off the line.",
    whole: tip("whole dodge", "Take one clear step to your left with your whole body, and stay there a moment."),
  },
  dodge_right: {
    well: "Your whole body moved off the line.",
    whole: tip("whole dodge", "Take one clear step to your right with your whole body, and stay there a moment."),
  },
  spear_thrust: {
    well: "Both hands out together, straight and fast.",
    whole: tip("whole thrust", "Drive both hands straight forward together to shoulder height, then back."),
  },
  overhead_strike: {
    well: "Right over your head, then all the way down.",
    whole: tip("whole strike", "Lift your right hand over your head, then chop it down below your shoulder."),
  },
  reverse_punch: {
    well: "Right fist out as the left pulled back.",
    whole: tip("whole punch", "Punch your right fist straight out as you pull your left fist back to your hip."),
  },
  knife_hand: {
    well: "From the far shoulder, out wide at neck height.",
    whole: tip("whole sweep", "Bring your right hand to your left shoulder, then sweep it out at neck height."),
  },
  hammer_fist: {
    well: "Raised high, then straight down.",
    whole: tip("whole strike", "Lift your left fist above your head, then bring it straight down past your shoulder."),
  },
  double_palm: {
    well: "Both palms out side by side.",
    whole: tip("whole push", "Push both open palms straight forward, side by side, at shoulder height."),
  },
  chain_punch: {
    well: "Two straight punches, one right behind the other.",
    whole: tip("whole chain", "Punch straight with your left, then your right straight after as the left comes back."),
  },
  rising_palm: {
    well: "Up from the waist to the chin, elbow bent.",
    whole: tip("whole strike", "Drop your left hand to your waist, then drive the palm up to chin height."),
  },
  roundhouse_kick: {
    well: "Knee out first, then the foot swung round.",
    whole: tip("whole kick", "Lift your knee out to the side, swing your foot round to the front, then snap it back."),
    faults: eitherSide((side) => [
      FEET,
      max(`ms since ${side} knee was up and out to the side`, "knee out first", "No wind-up. Lift your knee up and out to the side first, then swing the foot round."),
      min(`${side} foot lifted high`, "height", "Kick too low. Lift your knee to hip height so the foot swings round at hip height."),
      min(`${side} leg snapped straight`, "leg", "Leg still bent. Snap your foot out until the leg is straight, then pull it back."),
      max(`${side} foot round to the front`, "swing", "Foot stayed out wide. Swing it round until it is in front of your body."),
    ]),
  },
  side_kick: {
    well: "Knee up, then a straight push to the side.",
    whole: tip("whole kick", "Lift your knee, then push your foot straight out to the side until the leg is straight."),
    faults: eitherSide((side) => [
      FEET,
      max(`ms since ${side} knee was lifted and folded`, "knee lift", "No knee lift. Bring your knee up first, then push your foot out to the side."),
      min(`${side} foot out to the side`, "reach", "Kick too short. Push your foot further out to the side, away from your hip."),
      min(`${side} foot off the floor`, "height", "Foot too low. Keep it up at knee height as you push it out."),
      min(`${side} leg pushed straight`, "leg", "Leg still bent. Push out until your leg is straight, then pull it back."),
    ]),
  },
  low_kick: {
    well: "Low, quick, and your leg stayed straight.",
    whole: tip("whole kick", "Keep your leg straight and flick your foot forward at shin height, then straight back."),
    faults: eitherSide((side) => [
      FEET,
      min(`ms since ${side} knee was lifted high`, "low", "Knee came up too high. Keep this one low: no knee lift, a flick from the floor."),
      min(`${side} foot off the floor`, "lift", "Foot stayed down. Lift it off the floor and flick it forward at shin height."),
      max(`${side} foot kept low`, "low", "Kick too high. Keep your foot at shin height: this one is aimed at the leg."),
      min(`${side} leg kept straight`, "leg", "Knee bent. Keep your leg straight and swing it forward from the hip."),
      min(`${side} foot out in front`, "reach", "Kick too short. Flick your foot further forward, out in front of your hip."),
      max(`ms since ${side} foot was on the floor`, "speed", "Too slow. Make it one quick flick from the floor and straight back."),
    ]),
  },
  high_block: {
    well: "Forearm level above your head, and held.",
    whole: tip("whole block", "Lift one forearm level above your forehead, elbow out to the side, and hold it a beat."),
    faults: eitherSide((side) => [
      min(`${side} wrist up at your forehead`, "height", "Arm too low. Lift your forearm until your hand is above your forehead."),
      min(`${side} elbow up and out`, "elbow", "Elbow too low. Lift your elbow up and out to the side, as high as your shoulder."),
      min(`${side} forearm lying across`, "forearm", "Forearm upright. Lay it across above your head like a roof, elbow out to the side."),
      max(`${side} forearm kept level`, "forearm", "Forearm tilted. Keep it level from elbow to hand so a blow slides off it."),
      max(`${otherSide(side)} hand kept down`, "other hand", "Both hands came up. Block with one forearm and keep the other hand down."),
      min(`ms ${side} forearm has stayed up`, "hold", "Down too soon. Hold the block above your head for a beat."),
    ]),
  },
  low_block: {
    well: "From the far shoulder, down and out past your hip.",
    whole: tip("whole block", "Bring one hand up to your other shoulder, then sweep it down and out past your hip."),
    faults: eitherSide((side) => [
      max(`ms since ${side} hand was across at the other shoulder`, "start", "No wind-up. Start with your hand up at your other shoulder, then sweep it down."),
      max(`${side} hand swept down low`, "depth", "Sweep too high. Bring your hand all the way down to hip height."),
      min(`${side} hand out past its hip`, "sweep", "Sweep too short. Finish with your hand out past your own hip, clear of your body."),
      min(`${side} arm ends straight`, "arm", "Arm still bent. Straighten your arm as the sweep finishes."),
    ]),
  },
  palm_heel: {
    well: "Straight out to face height, and fast.",
    whole: tip("whole strike", "Push the heel of one open hand straight out to face height, then bring it back."),
    faults: eitherSide((side) => [
      min(`ms since ${side} hand was over the head`, "path", "That was a chop from above. Push the palm straight out from your chest."),
      min(`${side} arm pushed out`, "reach", "Arm not straight. Push your palm all the way out, then bring it back."),
      min(`${side} hand at face height`, "height", "Palm too low. Aim higher: finish with your hand at face height."),
      max(`${side} hand below head top`, "height", "Palm too high. Finish at face height, not above your head."),
      max(`${side} hand in front`, "aim", "Palm went wide. Push it straight ahead, in front of your own shoulder."),
      min(`${side} upper arm lifted`, "elbow", "Elbow stayed low. Lift your elbow as you push so the palm goes forward, not up."),
      min(`${side} arm's snap out in # ms`, "speed", "Too slow. Snap your palm out fast from a bent arm, then straight back."),
      group(`${otherSide(side)} hand not pushing too`, "other hand", "Both hands went out. Push with one palm and keep the other hand by your chin."),
    ]),
  },
  elbow_strike: {
    well: "Arm folded tight, elbow swung across at shoulder height.",
    whole: tip("whole strike", "Fold your arm tight, lift the elbow to shoulder height and swing it across your chest."),
    faults: eitherSide((side) => [
      max(`${side} arm folded tight`, "fold", "Arm too open. Fold it tight, hand by your chest, so the elbow leads."),
      min(`${side} elbow up at shoulder height`, "height", "Elbow too low. Lift it to shoulder height before you swing."),
      min(`${side} elbow swung across in # ms`, "swing", "Swing too short. Turn your shoulders and whip the elbow across fast."),
      max(`${side} elbow in front of the chest`, "finish", "Stopped short. Carry your elbow across until it is in front of your chest."),
    ]),
  },
  wrist_release: {
    well: "Arm out, then a fast fold with the elbow forward.",
    whole: tip("whole release", "Hold your arm out, then fold the elbow forward so your hand comes to your shoulder."),
    faults: eitherSide((side) => [
      min(`ms ${side} arm stayed out first`, "start", "No start. Hold your arm out in front for a moment first, as if it were grabbed."),
      max(`${side} elbow folded`, "fold", "Arm not folded. Bend your elbow all the way so your forearm comes right back."),
      max(`${side} hand in at its shoulder`, "finish", "Hand stopped short. Bring it all the way in to your own shoulder."),
      min(`${side} elbow pointing forward`, "elbow", "Elbow went out to the side. Drive it forward, in front of your shoulder."),
      max(`ms since ${side} arm was held out in front`, "speed", "Too slow. Fold in with one quick move straight from the held-out arm."),
    ]),
  },
};

/** The line for an Excellent try at this move, or null for a move with none written. */
export function praiseFor(moveId: string): string | null {
  return COACHING[moveId]?.well ?? null;
}

/** The tip written for one condition of a move, or undefined. */
export function faultFor(moveId: string, measure: Measure): Fault | undefined {
  return entryOf(COACHING[moveId]?.faults ?? [], measure);
}

const NEARLY = 0.95;

/**
 * What a try at a move judged condition by condition got wrong. `options` are the move's conditions (one list per
 * side, as in src/moves/measures.ts). The try is read at its best moment: the frame, and the side, where the most
 * conditions held (one that nearly held counts for part). The tip is for a condition that failed there: the first
 * in the order the move's faults are written. Null when the move has no faults written, or nothing failed.
 */
export function faultOf(
  moveId: string, options: readonly (readonly Measure[])[], frames: readonly PoseFrame[], baseline: Baseline | null = null,
): PracticeTip | null {
  const faults = COACHING[moveId]?.faults;
  if (!faults) return null;
  let best: { readonly score: number; readonly failed: readonly Measure[] } | null = null;
  let history: PoseHistory = { frames: [], baseline };
  for (const frame of frames) {
    if (!Number.isFinite(frame.t)) continue;
    history = pushFrame(history, frame);
    for (const measures of options) {
      const reads = measures.map((measure) => readMeasure(measure, history));
      const score = reads.reduce((sum, read) => {
        const near = Number.isNaN(read.margin) ? 0 : Math.min(NEARLY, Math.max(0, 1 + read.margin / 100));
        return sum + (read.passed ? 2 : near);
      }, 0);
      if (!best || score > best.score) best = { score, failed: measures.filter((_, index) => !reads[index]?.passed) };
    }
  }
  if (!best) return null;
  const failed = best.failed.map((measure) => entryOf(faults, measure));
  const first = faults.find((fault) => failed.includes(fault));
  return first ? { part: first.part, tip: first.tip } : null;
}
