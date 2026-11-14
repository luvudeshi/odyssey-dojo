// Reads which god a struck pose points to, from a single pose frame. Pure, and safe on frames with missing points.
import type { Landmark, PoseFrame } from "../core/types";
import { JOINT, distance2d, elbowAngle, joint } from "../pose/signals";
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
    reason: "You opened your whole stance to the light, the way the sun opens the morning, and the far-shooter claims that brightness at once.",
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
// These two are fractions of the torso's height in the picture.
const KNEES_UP = 0.4;
const TORSO_LEAN = 0.22;

type Side = "left" | "right";
type Point = Landmark | null;

function seen(point: Landmark): Point {
  const real = Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
  return real && point.visibility >= MIN_VISIBILITY ? point : null;
}

function pair(list: readonly Landmark[], left: number, right: number): Readonly<Record<Side, Point>> {
  return { left: seen(joint(list, left)), right: seen(joint(list, right)) };
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
  const wrists = pair(frame.image, JOINT.leftWrist, JOINT.rightWrist);
  const hips = pair(frame.image, JOINT.leftHip, JOINT.rightHip);
  const knees = pair(frame.image, JOINT.leftKnee, JOINT.rightKnee);
  const ankles = pair(frame.image, JOINT.leftAnkle, JOINT.rightAnkle);
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
  /** A straight arm at shoulder height, out to the side (seen in the picture) or toward the camera (seen in depth). */
  const straight = (side: Side): boolean => {
    const shoulder = shoulders[side];
    const wrist = wrists[side];
    if (shoulder && wrist) {
      const flat = Math.abs(wrist.y - shoulder.y) < SHOULDER_HEIGHT * width;
      if (flat && distance2d(wrist, shoulder) > STRAIGHT_REACH * width) return true;
    }
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

  if (wrists.left && wrists.right) {
    const ceiling = nose ? nose.y - ABOVE_NOSE * width : shoulderY - 1.2 * width;
    if (wrists.left.y < ceiling && wrists.right.y < ceiling) return "skyReach";

    const flat =
      Math.abs(wrists.left.y - shoulders.left.y) < SHOULDER_HEIGHT * width &&
      Math.abs(wrists.right.y - shoulders.right.y) < SHOULDER_HEIGHT * width;
    const out =
      shoulders.left.x - wrists.left.x > WIDE_REACH * width &&
      wrists.right.x - shoulders.right.x > WIDE_REACH * width;
    if (flat && out) return "armsWide";
  }

  for (const side of ["left", "right"] as const) {
    if (straight(side) && drawn(other(side))) return "archer";
  }

  if (forward("left") > WORLD_FORWARD && forward("right") > WORLD_FORWARD && level("left") && level("right")) {
    return "push";
  }
  if (nose && wrists.left && wrists.right) {
    const far = Math.max(distance2d(wrists.left, nose), distance2d(wrists.right, nose));
    if (far < GUARD_REACH * width) return "guard";
  }

  // Legs only count when they are in the picture and below the shoulders: a laptop webcam often cuts them off.
  const below = (point: Point): point is Landmark => point !== null && point.y > shoulderY;
  const torso = hips.left && hips.right ? (hips.left.y + hips.right.y) / 2 - shoulderY : 0;
  const hipY = shoulderY + torso;
  if (below(ankles.left) && below(ankles.right)) {
    if (Math.abs(ankles.left.x - ankles.right.x) > FEET_APART * width) return "wideStance";
  }
  if (torso > 0.5 * width && below(knees.left) && below(knees.right)) {
    const kneeDrop = (knees.left.y + knees.right.y) / 2 - hipY;
    if (kneeDrop < KNEES_UP * torso) return "crouch";
  }

  if (hips.left && hips.right && torso > 0.5 * width) {
    const hipX = (hips.left.x + hips.right.x) / 2;
    if (Math.abs(shoulderX - hipX) > TORSO_LEAN * torso) return "lean";
  }
  if (Math.abs(shoulders.left.y - shoulders.right.y) > SHOULDER_TILT * width) return "lean";
  if (below(ankles.left) && below(ankles.right)) {
    if (Math.abs(ankles.left.y - ankles.right.y) > LIFTED * width) return "midStep";
  }
  if (below(knees.left) && below(knees.right)) {
    if (Math.abs(knees.left.y - knees.right.y) > LIFTED * width) return "midStep";
  }
  return null;
}
