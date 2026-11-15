import { strikeQuality } from "../../pose/quality";
import type { MoveDef, PoseHistory } from "../../core/types";
import { clamp01, elbowAngle, latest, recent } from "../../pose/signals";
import { THROW_MS, travel, upperArmLift, wristRise } from "../handSignals";

/** The elbow keeps a bend between these, in degrees, through the swing. Straighter is a slap. */
export const HOOK_BENT = 40;
export const HOOK_STRAIGHT = 150;
/** The fist stays about head to shoulder height: at most this far above or below the shoulder line, in shoulder widths. */
export const HOOK_HEIGHT = 0.9;
/** The elbow is up and out, the upper arm lifted at least this far from hanging. A tucked elbow is a guard. */
export const HOOK_LIFT = 45;
/** Confidence 0 at SWEEP_FROM shoulder widths of swing toward the centre line in THROW_MS, 1 at SWEEP_FROM + SWEEP_SPAN. */
export const SWEEP_FROM = 0.25;
export const SWEEP_SPAN = 0.35;

/**
 * The bent left arm whipped across the body: how far the fist swept toward the centre line over the last
 * THROW_MS, with the elbow up and bent all the way. Its one feature against the jab is the path: across more
 * than up (the jab checks `sweptAcross`). A slow sweep of half a second still counts; a one-second one does not.
 */
export function hook(history: PoseHistory): number {
  const frame = latest(history);
  if (!frame) return 0;
  const bend = elbowAngle(frame, "left");
  if (bend < HOOK_BENT || bend > HOOK_STRAIGHT || Math.abs(wristRise(frame, "left")) > HOOK_HEIGHT) return 0;
  if (upperArmLift(frame, "left") < HOOK_LIFT) return 0;
  // A straight arm folding back to the chest also moves the fist across, but it was straight a moment ago.
  if (recent(history, THROW_MS).some((old) => elbowAngle(old, "left") > HOOK_STRAIGHT)) return 0;
  const { across, up } = travel(history, "left", THROW_MS);
  return up > across ? 0 : clamp01((across - SWEEP_FROM) / SWEEP_SPAN);
}

export const move: MoveDef = {
  id: "hook",
  name: "Hook",
  kind: "strike",
  prompt: "LEFT HOOK",
  hint: "Swing your bent left arm across your body",
  key: "l",
  diagram: { leftElbow: [26, 32], leftWrist: [42, 28], rightElbow: [62, 42], rightWrist: [57, 26] },
  teaches: "Swings come from the side, out of view, so always bring your hand back to your face",
  detect: hook,
  quality(history) {
    return strikeQuality(history, { sides: ["left"], straight: false, tolerance: 1 });
  },
};
