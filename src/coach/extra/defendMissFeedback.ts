// What went wrong with a defend, read from the frames of its warning: the attack hit, or the defend came late.
// strikeFeedback grades a defend from its shape once it has counted; this adds what only the timing tells:
// never moved, moved the wrong way, made another defend, moved too little, or made the defend after the attack
// landed. docs/move-feedback.md ("Defends that failed, and late ones") has the table.
// Nothing here is spoken or played: the words are for a pop-up on the screen.
import type { PoseFrame, PoseHistory } from "../../core/types";
import { ASK_GRACE_MS, DEFEND_ON, RELEASE_MS } from "../../input/poseInput";
import { MOVES } from "../../moves/registry";
import { legsInFrame } from "../../moves/waistUp";
import { JOINT, SEEN, joint, shoulderWidth } from "../../pose/signals";
import { FEEDBACK_POINTS, TIP_MAX, strikeFeedback, tipsFor } from "./strikeFeedback";
import type { FeedbackGrade, StrikeFeedback } from "./strikeFeedback";

/** No move at all in the warning. */
export const REACT_TIP = "React sooner";
/** The defend asked for, made after the attack had landed. */
export const BEAT_TIP = "A beat sooner";
/** The defend asked for, made in the warning but let go before the attack landed. */
export const HOLD_TIP = "Hold it till it lands";
/** A defend that counted but was first made after this share of the warning came late. */
export const LATE_AT = 0.75;
/** No seen point of the upper body got this far (in shoulder widths) from where it was as the warning began: never moved. */
export const STILL = 0.12;

/** The word for each defend in "Duck, don't block". A defend missing here falls back to the first word of its prompt. */
export const DEFEND_WORDS: Readonly<Record<string, string>> = {
  block: "block", duck: "duck", dodge_left: "dodge", dodge_right: "dodge", jump: "jump",
};
const WAYS: Readonly<Record<string, string>> = { dodge_left: "left", dodge_right: "right" };
/** For a defend made too little when its own checks found nothing to say: the tip for "more of it". */
const MORE: Readonly<Record<string, string>> = {
  block: "Hands too low", duck: "Bend your knees deeper", dodge_left: "Step further left", dodge_right: "Step further right", jump: "Jump higher",
};
/** A tip with these words is about the legs, and is not for a player whose legs are out of the picture. */
const LEG_WORDS = /knee|step|leg|foot|feet/i;
/** The fight's pose history holds a second; the detectors are read over the same. */
const HISTORY_MS = 1000;
/** A defend that counted is judged on its frames up to this long after it was first made. */
const FORM_MS = 300;
/** The loose reading of the asked move needs at least this many frames, as in the fight. */
const ASKED_MIN_FRAMES = 3;
const STEP_DOWN: Readonly<Record<FeedbackGrade, FeedbackGrade>> = {
  EXCELLENT: "GREAT", GREAT: "GOOD", GOOD: "NEEDS IMPROVEMENT", "NEEDS IMPROVEMENT": "NEEDS IMPROVEMENT",
};

const graded = (grade: FeedbackGrade, tip: string | null): StrikeFeedback => ({ grade, points: FEEDBACK_POINTS[grade], tip });
const fits = (tip: string | null): string | null => (tip !== null && tip.length > 0 && tip.length <= TIP_MAX ? tip : null);

function wordFor(defendId: string): string | null {
  return DEFEND_WORDS[defendId] ?? MOVES.get(defendId)?.prompt.split(/\s+/)[0]?.toLowerCase() ?? null;
}

/** What to say when `made` was done and the attack asked for `asked`, or null when there is nothing to say. */
export function wrongDefendTip(asked: string, made: string): string | null {
  const want = wordFor(asked);
  const did = wordFor(made);
  if (asked === made || !want || !did) return null;
  if (want === did) return fits(WAYS[asked] ? `Other way: ${want} ${WAYS[asked]}` : null);
  return fits(`${want.charAt(0).toUpperCase()}${want.slice(1)}, don't ${did}`);
}

/** A body tip for a player seen from the waist up: null when it is about the legs and has no waist-up wording. */
export function waistUpTip(tip: string): string | null {
  if (!LEG_WORDS.test(tip)) return tip;
  if (tip.startsWith("Step further")) return tip.replace("Step further", "Lean further");
  if (tip === "Bend your knees deeper") return "Duck lower";
  return null;
}

function seen(frame: PoseFrame, ...indices: number[]): boolean {
  return indices.every((index) => joint(frame.image, index).visibility >= SEEN);
}

/** The least the detectors need: both shoulders, apart. */
function usable(frame: PoseFrame): boolean {
  return seen(frame, JOINT.leftShoulder, JOINT.rightShoulder) && shoulderWidth(frame) > 0;
}

/** For each frame from the start of the warning on, every defend's reading, as the fight reads them. */
function readings(
  history: PoseHistory, askedId: string, startMs: number,
): readonly { readonly t: number; readonly levels: ReadonlyMap<string, number> }[] {
  const defends = [...MOVES.values()].filter((move) => move.kind === "defend");
  const out: { t: number; levels: Map<string, number> }[] = [];
  const all = history.frames;
  all.forEach((frame, index) => {
    if (frame.t < startMs || !usable(frame)) return;
    const frames = all.slice(0, index + 1).filter((old) => frame.t - old.t <= HISTORY_MS);
    const now: PoseHistory = { frames, baseline: history.baseline };
    const levels = new Map<string, number>();
    for (const move of defends) {
      let level = move.detect(now);
      if (move.id === askedId && move.detectAsked) {
        const since = frames.filter((old) => old.t - startMs >= ASK_GRACE_MS);
        if (since.length >= ASKED_MIN_FRAMES) level = Math.max(level, move.detectAsked({ ...now, frames: since }));
      }
      levels.set(move.id, Number.isFinite(level) ? level : 0);
    }
    out.push({ t: frame.t, levels });
  });
  return out;
}

/** The furthest any seen point of the upper body got from where it was on the first frame, in shoulder widths. */
function moved(frames: readonly PoseFrame[]): number {
  const first = frames[0];
  if (!first) return 0;
  const width = shoulderWidth(first);
  let furthest = 0;
  for (const frame of frames) {
    for (const index of [JOINT.nose, JOINT.leftShoulder, JOINT.rightShoulder, JOINT.leftWrist, JOINT.rightWrist]) {
      if (!seen(first, index) || !seen(frame, index)) continue;
      const from = joint(first.image, index);
      const to = joint(frame.image, index);
      const far = Math.hypot(to.x - from.x, to.y - from.y) / width;
      if (Number.isFinite(far)) furthest = Math.max(furthest, far);
    }
  }
  return furthest;
}

/** Most of the frames show both knees and a foot. */
function legsSeen(frames: readonly PoseFrame[]): boolean {
  return frames.filter(legsInFrame).length * 2 > frames.length;
}

const valid = (startMs: number, endMs: number): boolean => Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs;

/**
 * Feedback for a defend that failed: the attack asking for `defendId` (its `counter`) hit the player.
 *
 * `history` holds the frames from the start of the warning (`windowStartMs`, when the `telegraph` event came)
 * to the hit (`windowEndMs`, when `playerHit` came) and, better, a moment after it, with the fight's baseline.
 * Both times are on the frames' own clock (`PoseFrame.t`). The fight's pose history keeps one second, and a
 * warning can be longer: keep the frames from the telegraph on and pass `{ frames, baseline }`.
 *
 * Always NEEDS IMPROVEMENT. The tip, first that applies:
 * the defend was made in the warning and let go too soon, "Hold it till it lands" (or "A beat sooner" if it was
 * still on near the end); another defend was made, "Duck, don't block" / "Other way: dodge right"; the defend was
 * made after the hit, "A beat sooner"; the body never moved, "React sooner"; else it moved too little, and the
 * tip is strikeFeedback's for that defend ("Hands too low", "Step further right"...).
 *
 * No leg tip for a player whose legs are out of the picture. With no body to read (keyboard, shoulders not seen,
 * a window that makes no sense) there is no tip. Never throws.
 */
export function defendMissFeedback(
  defendId: string,
  history: PoseHistory | null | undefined,
  windowStartMs: number,
  windowEndMs: number,
): StrikeFeedback {
  const blind = graded("NEEDS IMPROVEMENT", null);
  try {
    if (!history || !valid(windowStartMs, windowEndMs)) return blind;
    const frames = history.frames.filter((frame) => frame.t >= windowStartMs && usable(frame));
    const inWindow = frames.filter((frame) => frame.t <= windowEndMs);
    if (inWindow.length === 0) return blind;
    const legs = legsSeen(frames);
    const say = (tip: string | null): StrikeFeedback =>
      graded("NEEDS IMPROVEMENT", fits(tip === null || legs ? tip : waistUpTip(tip)));

    const read = readings(history, defendId, windowStartMs);
    const during = read.filter((at) => at.t <= windowEndMs);
    const askedOn = during.filter((at) => (at.levels.get(defendId) ?? 0) >= DEFEND_ON);
    const lastOn = askedOn.at(-1);
    if (lastOn) return say(windowEndMs - lastOn.t > RELEASE_MS ? HOLD_TIP : BEAT_TIP);

    let other: { id: string; level: number } | null = null;
    for (const at of during) {
      for (const [id, level] of at.levels) {
        if (id !== defendId && level >= DEFEND_ON && (!other || level > other.level)) other = { id, level };
      }
    }
    const wrong = other ? wrongDefendTip(defendId, other.id) : null;
    if (wrong !== null) return say(wrong);

    if (read.some((at) => at.t > windowEndMs && (at.levels.get(defendId) ?? 0) >= DEFEND_ON)) return say(BEAT_TIP);
    if (moved(inWindow) < STILL) return say(REACT_TIP);

    const upToHit: PoseHistory = { frames: history.frames.filter((frame) => frame.t <= windowEndMs), baseline: history.baseline };
    const tip = fits(say(strikeFeedback(defendId, upToHit).tip).tip)
      ?? fits(say(MORE[defendId] ?? null).tip)
      ?? tipsFor(defendId).map((one) => fits(say(one).tip)).find((one) => one !== null)
      ?? REACT_TIP;
    return graded("NEEDS IMPROVEMENT", tip);
  } catch {
    return blind;
  }
}

/**
 * Feedback for a defend that counted (the `defended` event), with its timing. Same `history` and window as
 * `defendMissFeedback`, the window ending when the attack landed.
 *
 * The grade and tip are strikeFeedback's, read on the frames up to a moment after the defend was first made.
 * When strikeFeedback had no tip and the defend was first made in the last quarter of the warning (LATE_AT), the
 * grade is one step lower and the tip is "React sooner". A leg tip is dropped for a player whose legs are out of
 * the picture (or reworded: "Lean further left", "Duck lower"). On the keyboard: strikeFeedback's GOOD and no tip.
 * Never throws.
 */
export function defendTimingFeedback(
  defendId: string,
  history: PoseHistory | null | undefined,
  windowStartMs: number,
  windowEndMs: number,
): StrikeFeedback {
  const blind = strikeFeedback(defendId, null);
  try {
    if (!history || !valid(windowStartMs, windowEndMs)) return blind;
    const frames = history.frames.filter((frame) => frame.t >= windowStartMs && frame.t <= windowEndMs && usable(frame));
    if (frames.length === 0) return blind;
    const first = readings(history, defendId, windowStartMs)
      .find((at) => at.t <= windowEndMs && (at.levels.get(defendId) ?? 0) >= DEFEND_ON);
    const upTo = first ? first.t + FORM_MS : windowEndMs;
    const form = strikeFeedback(defendId, { frames: history.frames.filter((frame) => frame.t <= upTo), baseline: history.baseline });
    if (form.tip !== null) return graded(form.grade, fits(legsSeen(frames) ? form.tip : waistUpTip(form.tip)));
    const late = first !== undefined && (first.t - windowStartMs) / (windowEndMs - windowStartMs) >= LATE_AT;
    return late ? graded(STEP_DOWN[form.grade], REACT_TIP) : form;
  } catch {
    return blind;
  }
}

/** Every tip `defendMissFeedback` can give for a defend. Empty for a move that is not a defend. */
export function missTipsFor(defendId: string): readonly string[] {
  if (MOVES.get(defendId)?.kind !== "defend") return [];
  const body = [...tipsFor(defendId), ...(MORE[defendId] ? [MORE[defendId]] : [])]
    .flatMap((tip) => [tip, waistUpTip(tip)]).filter((tip): tip is string => fits(tip) !== null);
  const wrong = [...MOVES.values()].filter((move) => move.kind === "defend")
    .map((move) => wrongDefendTip(defendId, move.id)).filter((tip): tip is string => tip !== null);
  return [...new Set([HOLD_TIP, ...wrong, BEAT_TIP, REACT_TIP, ...body])];
}
