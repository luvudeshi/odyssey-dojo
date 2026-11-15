import { strikeQuality } from "../../pose/quality";
import type { MoveDef, PoseHistory } from "../../core/types";
import { clamp01, elbowAngle, latest, recent } from "../../pose/signals";
import { THROW_MS, cameFromOverhead, punchedJustNow, travel, upperArmLift, wristRise } from "../handSignals";
import type { Side } from "../handSignals";
import { SIDES } from "../legSignals";

/** The elbow keeps a bend between these, in degrees, through the swing. Straighter is a slap. */
export const HOOK_BENT = 40;
export const HOOK_STRAIGHT = 150;
/** The fist stays between the top of the head and the chest: at most this far above or below the shoulder line, in shoulder widths. */
export const HOOK_HEIGHT = 1.3;
/** The elbow is up and out, the upper arm lifted at least this far from hanging. A tucked elbow is a guard. */
export const HOOK_LIFT = 45;
/** Confidence 0 at SWEEP_FROM shoulder widths of swing toward the centre line in THROW_MS, 1 at SWEEP_FROM + SWEEP_SPAN. */
export const SWEEP_FROM = 0.25;
export const SWEEP_SPAN = 0.35;
/** The swing is flat: across at least this many times as far as up. A fist driven up and in to the chin is a punch. */
export const HOOK_FLAT = 2;

/**
 * A bent arm whipped across the body: how far the fist swept toward the centre line over the last THROW_MS, with
 * the elbow up and bent all the way. Its one feature against the jab and the cross is the path: across more than
 * up (both straight punches check `sweptAcross`). A slow sweep of half a second still counts; a one-second one does
 * not. Either hand: a player told to hook often throws the strong hand, and there is no second hook to confuse it with.
 */
export function hookOn(history: PoseHistory, side: Side): number {
  const frame = latest(history);
  if (!frame) return 0;
  const bend = elbowAngle(frame, side);
  if (bend < HOOK_BENT || bend > HOOK_STRAIGHT || Math.abs(wristRise(frame, side)) > HOOK_HEIGHT) return 0;
  // A hand chopped down from over the head also crosses the body at head height on its way.
  if (upperArmLift(frame, side) < HOOK_LIFT || cameFromOverhead(history, side)) return 0;
  // A straight arm folding back to the chest also moves the fist across, but it was straight a moment ago.
  if (recent(history, THROW_MS).some((old) => elbowAngle(old, side) > HOOK_STRAIGHT)) return 0;
  const { across, up } = travel(history, side, THROW_MS);
  // A punch thrown at the camera often lands inward of the shoulder: the fist carrying on in after it is not a hook.
  return up * HOOK_FLAT > across || punchedJustNow(history, side) ? 0 : clamp01((across - SWEEP_FROM) / SWEEP_SPAN);
}

export function hook(history: PoseHistory): number {
  return Math.max(...SIDES.map((side) => hookOn(history, side)));
}

export const move: MoveDef = {
  id: "hook",
  name: "Hook",
  kind: "strike",
  prompt: "HOOK",
  hint: "Swing a bent arm across your body, either hand",
  key: "l",
  diagram: { leftElbow: [26, 32], leftWrist: [42, 28], rightElbow: [62, 42], rightWrist: [57, 26] },
  teaches: "Swings curl round from the side, out of view, so keep your hands up to guard your face",
  detect: hook,
  quality(history) {
    const side = SIDES.find((each) => hookOn(history, each) >= 0.7) ?? "left";
    return strikeQuality(history, { sides: [side], straight: false, tolerance: 1 });
  },
};
