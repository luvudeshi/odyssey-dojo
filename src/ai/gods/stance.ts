// Reads which god a struck pose points to, from a single pose frame. Pure, and safe on frames with missing points.
import type { Landmark, PoseFrame } from "../../core/types";
import { JOINT, distance2d, elbowAngle, joint } from "../../pose/signals";
import type { GodId } from "./gods";

export type StanceId =
  | "skyReach"
  | "armsWide"
  | "archer"
  | "push"
  | "guard"
  | "wideStance"
  | "crouch"
  | "lean"
  | "midStep";

/** The god each stance reveals and the sentence that says why. Reasons name the stance only, never the player's body. */
export const STANCES: Readonly<Record<StanceId, { readonly god: GodId; readonly reason: string }>> = {
  skyReach: {
    god: "zeus",
    reason: "You reached straight for the sky, and only the lord of thunder strikes a pose that claims the whole heaven.",
  },
  armsWide: {
    god: "apollo",
    reason: "You flung your whole stance open to the light, and bright Phoebus, the far-shooter, claims that radiance at once.",
  },
  archer: {
    god: "artemis",
    reason: "You drew an unseen bow and held it steady, and a stance that calm and exact belongs to the huntress alone.",
  },
  push: {
    god: "athena",
    reason: "You drove your stance forward like a shield wall advancing, and that disciplined push is pure Athena.",
  },
  guard: {
    god: "athena",
    reason: "You raised a tight, ready guard before the fight had even begun, and that cool readiness is Athena's own.",
  },
  wideStance: {
    god: "poseidon",
    reason: "You planted a wide, rooted stance like a ship braced for the swell, and the earth-shaker honours ground held that firmly.",
  },
  crouch: {
    god: "poseidon",
    reason: "You sank into a low, coiled stance like a wave gathering before it breaks, and that patient force is Poseidon's.",
  },
  lean: {
    god: "hermes",
    reason: "You struck a pose already tilting toward the next move, and that restless energy is Hermes through and through.",
  },
  midStep: {
    god: "hermes",
    reason: "You were caught mid-stride, half gone before the pose was even held, and only the messenger moves with that quick energy.",
  },
};

const MIN_VISIBILITY = 0.5;
// Image thresholds are in shoulder widths; world thresholds are in metres. First guesses: tune on a real webcam.
const ABOVE_NOSE = 0.5;
const ELBOWS_UP = 0.6;
const WIDE_REACH = 0.9;
const SHOULDER_HEIGHT = 0.6;
const STRAIGHT_REACH = 1.2;
const DRAWN_REACH = 0.7;
const GUARD_REACH = 1;
const FEET_APART = 1.7;
const LIFTED = 0.6;
const SHOULDER_TILT = 0.3;
const WORLD_FORWARD = 0.3;
const WORLD_REACH = 0.45;
const WORLD_LEVEL = 0.3;
const STRING_BACK = 0.05;
// These two are fractions of the torso's height in the picture. Standing easy, the knees sit about 0.9 below the hips.
const KNEES_UP = 0.65;
const TORSO_LEAN = 0.22;

type Side = "left" | "right";
type Point = Landmark | null;

function seen(point: Landmark): Point {
  const real = Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
  return real && point.visibility >= MIN_VISIBILITY ? point : null;
}

/** Like seen, but only inside the picture: past its edge MediaPipe is guessing where a cut-off joint would be. */
function seenInPicture(point: Landmark): Point {
  const inside = point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
  return inside ? seen(point) : null;
}

function pair(
  list: readonly Landmark[],
  left: number,
  right: number,
  read: (point: Landmark) => Point = seen,
): Readonly<Record<Side, Point>> {
  return { left: read(joint(list, left)), right: read(joint(list, right)) };
}

function other(side: Side): Side {
  return side === "left" ? "right" : "left";
}

/** The stance this frame shows, or null when it is an ordinary standing pose or too little of the player is visible. */
export function readStance(frame: PoseFrame | null): StanceId | null {
  if (!frame) return null;
  const shoulders = pair(frame.image, JOINT.leftShoulder, JOINT.rightShoulder);
  if (!shoulders.left || !shoulders.right) return null;
  const width = distance2d(shoulders.left, shoulders.right);
  if (width < 0.02) return null;
  const shoulderY = (shoulders.left.y + shoulders.right.y) / 2;
  const shoulderX = (shoulders.left.x + shoulders.right.x) / 2;

  const nose = seen(joint(frame.image, JOINT.nose));
  // Hands may leave the picture and still count (a reach for the sky often does); the hips and legs may not.
  const elbows = pair(frame.image, JOINT.leftElbow, JOINT.rightElbow);
  const wrists = pair(frame.image, JOINT.leftWrist, JOINT.rightWrist);
  const hips = pair(frame.image, JOINT.leftHip, JOINT.rightHip, seenInPicture);
  const knees = pair(frame.image, JOINT.leftKnee, JOINT.rightKnee, seenInPicture);
  const ankles = pair(frame.image, JOINT.leftAnkle, JOINT.rightAnkle, seenInPicture);
  const worldShoulders = pair(frame.world, JOINT.leftShoulder, JOINT.rightShoulder);
  const worldElbows = pair(frame.world, JOINT.leftElbow, JOINT.rightElbow);
  const worldWrists = pair(frame.world, JOINT.leftWrist, JOINT.rightWrist);

  /** How far the hand is pushed toward the camera, in metres; 0 when depth is unknown. */
  const forward = (side: Side): number => {
    const shoulder = worldShoulders[side];
    const wrist = worldWrists[side];
    return shoulder && wrist ? shoulder.z - wrist.z : 0;
  };
  const level = (side: Side): boolean => {
    const shoulder = worldShoulders[side];
    const wrist = worldWrists[side];
    return shoulder !== null && wrist !== null && Math.abs(wrist.y - shoulder.y) < WORLD_LEVEL;
  };
  /** A straight arm at shoulder height, out to the side: seen in the picture. */
  const across = (side: Side): boolean => {
    const shoulder = shoulders[side];
    const wrist = wrists[side];
    if (!shoulder || !wrist) return false;
    const flat = Math.abs(wrist.y - shoulder.y) < SHOULDER_HEIGHT * width;
    return flat && distance2d(wrist, shoulder) > STRAIGHT_REACH * width;
  };
  /** A straight arm at shoulder height, pointed at the camera: seen in depth. */
  const ahead = (side: Side): boolean => {
    const from = worldShoulders[side];
    const to = worldWrists[side];
    if (!from || !to || !worldElbows[side] || !level(side)) return false;
    const reach = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    return reach > WORLD_REACH && elbowAngle(frame, side) > 140;
  };
  /** A hand pulled back to its own shoulder, like the string hand of an archer. */
  const drawn = (side: Side): boolean => {
    const shoulder = shoulders[side];
    const wrist = wrists[side];
    if (!shoulder || !wrist) return false;
    return distance2d(wrist, shoulder) < DRAWN_REACH * width && forward(side) < WORLD_FORWARD / 2;
  };
  const ceiling = nose ? nose.y - ABOVE_NOSE * width : shoulderY - 1.2 * width;
  /** A hand above the head. A hand that has left the top of the picture goes unseen: then the elbow speaks for it. */
  const raised = (side: Side): boolean => {
    const wrist = wrists[side];
    if (wrist) return wrist.y < ceiling;
    const elbow = elbows[side];
    return elbow !== null && elbow.y < (nose ? nose.y : shoulderY - ELBOWS_UP * width);
  };

  if (raised("left") && raised("right")) return "skyReach";

  if (wrists.left && wrists.right) {
    const flat =
      Math.abs(wrists.left.y - shoulders.left.y) < SHOULDER_HEIGHT * width &&
      Math.abs(wrists.right.y - shoulders.right.y) < SHOULDER_HEIGHT * width;
    const out =
      shoulders.left.x - wrists.left.x > WIDE_REACH * width &&
      wrists.right.x - shoulders.right.x > WIDE_REACH * width;
    if (flat && out) return "armsWide";
  }

  for (const side of ["left", "right"] as const) {
    const string = other(side);
    if (!drawn(string)) continue;
    if (across(side)) return "archer";
    // Pointed at the camera, a bow arm and a jab look alike. Only a hand held back at the shoulder draws a string;
    // one held out in front of it is a fighter keeping a guard up.
    if (ahead(side)) return forward(string) <= STRING_BACK ? "archer" : "guard";
  }

  if (forward("left") > WORLD_FORWARD && forward("right") > WORLD_FORWARD && level("left") && level("right")) {
    return "push";
  }
  if (nose && wrists.left && wrists.right) {
    const far = Math.max(distance2d(wrists.left, nose), distance2d(wrists.right, nose));
    if (far < GUARD_REACH * width) return "guard";
  }

  // Legs only count when both are in the picture and below the shoulders: a laptop webcam often cuts them off.
  const legs = (points: Readonly<Record<Side, Point>>): readonly [Landmark, Landmark] | null => {
    const { left, right } = points;
    return left && right && left.y > shoulderY && right.y > shoulderY ? [left, right] : null;
  };
  const feet = legs(ankles);
  const bent = legs(knees);
  const torso = hips.left && hips.right ? (hips.left.y + hips.right.y) / 2 - shoulderY : 0;
  const hipX = hips.left && hips.right ? (hips.left.x + hips.right.x) / 2 : shoulderX;
  const leaning = torso > 0.5 * width && Math.abs(shoulderX - hipX) > TORSO_LEAN * torso;

  // A wide base under a body that is tipping over is a lunge, not a planted stance: that is left for the lean below.
  if (feet && !leaning && Math.abs(feet[0].x - feet[1].x) > FEET_APART * width) return "wideStance";
  // One leg lifted is a step. It is ruled out before the crouch, so a raised knee never reads as a low stance.
  for (const both of [feet, bent]) {
    if (both && Math.abs(both[0].y - both[1].y) > LIFTED * width) return "midStep";
  }
  // Both knees must come up toward the hips. A seat and a full squat look the same from the front; both count as low.
  if (bent && torso > 0.5 * width) {
    if (Math.max(bent[0].y, bent[1].y) - (shoulderY + torso) < KNEES_UP * torso) return "crouch";
  }
  if (leaning) return "lean";
  if (Math.abs(shoulders.left.y - shoulders.right.y) > SHOULDER_TILT * width) return "lean";
  return null;
}
