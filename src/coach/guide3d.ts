// The move guide's 3D half, pure (no three.js): the flat figure from ./guide plus how far each end is pushed at the
// camera, as joint positions in metres. x to the right of the picture, y up from the floor, z toward the camera.
// The flat pose already carries a foreshortened limb (a straight punch is a fist an inch from its shoulder), so a
// bone's depth is what its flat length is short of its real length: the arm then reaches at the viewer at full length.
import { SIDES } from "../moves/legSignals";
import type { GuideEnd, GuideJoint, GuidePose, Toward } from "./guide";

export type Vec3 = readonly [number, number, number];
export type Figure3D = Readonly<Record<GuideJoint, Vec3>>;

/** Real bone lengths in metres: the flat standing leg is 0.95 tall, and a guard arm about this long. */
export const BONE = { upper: 0.42, fore: 0.4, thigh: 0.475, shin: 0.475 } as const;
/** A pushed-out end always comes at least this far, even where the flat limb is already as long as the bone. */
const MIN_REACH = 0.2;
/** A planted leg shorter than this is a bent knee. */
const STANDING_LEG = 0.93;

type Pt = readonly [number, number];
const flat = (a: Pt, b: Pt): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
/** How far a bone of real length `bone` reaches out of the picture when its flat length is `shown`. */
const depth = (bone: number, shown: number, least = 0): number => Math.max(least, Math.sqrt(Math.max(0, bone * bone - shown * shown)));

/** A bone drawn under half its length with nothing pushed at the camera (a block's forearm) still points out of the picture, less the longer it is drawn. */
const squashed = (bone: number, shown: number): number => (shown < bone / 2 ? depth(bone, shown) * (1 - shown / (bone / 2)) : 0);

/** A limb is lit when its end is the moving one; a leg is one limb whether the move is named for its knee or its foot. */
export const isLit = (moving: readonly GuideEnd[], end: GuideEnd): boolean =>
  moving.some((each) => each === end || (each.slice(0, -4) === end.slice(0, -4) && !each.endsWith("Wrist") && !end.endsWith("Wrist")));

/**
 * The figure in 3D. `mirrored` (the component's default) keeps the player's left at the left of the picture, like a
 * mirror; without it the figure faces the player like a teacher, left at the right.
 */
export function figure3d(pose: GuidePose, toward: Toward, mirrored = true): Figure3D {
  const z: Record<GuideJoint, number> = {
    head: 0, leftShoulder: 0, rightShoulder: 0, leftElbow: 0, rightElbow: 0, leftWrist: 0, rightWrist: 0,
    leftHip: 0, rightHip: 0, leftKnee: 0, rightKnee: 0, leftFoot: 0, rightFoot: 0,
  };
  for (const side of SIDES) {
    const [shoulder, elbow, wrist] = [pose[`${side}Shoulder`], pose[`${side}Elbow`], pose[`${side}Wrist`]];
    const reach = toward[`${side}Wrist`];
    const [upper, fore] = [flat(shoulder, elbow), flat(elbow, wrist)];
    z[`${side}Elbow`] = Math.max(reach * depth(BONE.upper, upper), squashed(BONE.upper, upper));
    z[`${side}Wrist`] = z[`${side}Elbow`] + Math.max(reach * depth(BONE.fore, fore, MIN_REACH), squashed(BONE.fore, fore));

    const [hip, knee, foot] = [pose[`${side}Hip`], pose[`${side}Knee`], pose[`${side}Foot`]];
    const [kneeReach, footReach] = [toward[`${side}Knee`], toward[`${side}Foot`]];
    const thigh = depth(BONE.thigh, flat(hip, knee));
    const length = flat(hip, foot);
    const straight = Math.abs((knee[0] - hip[0]) * (foot[1] - hip[1]) - (knee[1] - hip[1]) * (foot[0] - hip[0])) < 1e-6;
    // Standing on a bent leg (a duck) the knee goes forward: the flat leg is shorter than the bones.
    const bend = straight && length < STANDING_LEG ? depth(BONE.thigh, length / 2) * (1 - Math.max(kneeReach, footReach)) : 0;
    z[`${side}Knee`] = Math.max(bend, kneeReach * depth(BONE.thigh, flat(hip, knee), MIN_REACH), footReach * thigh);
    z[`${side}Foot`] = footReach * (thigh + depth(BONE.shin, flat(knee, foot), MIN_REACH));
  }
  const flip = mirrored ? 1 : -1;
  const joint = (name: GuideJoint): Vec3 => [flip * pose[name][0], pose[name][1], z[name]];
  return {
    head: joint("head"), leftShoulder: joint("leftShoulder"), rightShoulder: joint("rightShoulder"),
    leftElbow: joint("leftElbow"), rightElbow: joint("rightElbow"), leftWrist: joint("leftWrist"), rightWrist: joint("rightWrist"),
    leftHip: joint("leftHip"), rightHip: joint("rightHip"), leftKnee: joint("leftKnee"), rightKnee: joint("rightKnee"),
    leftFoot: joint("leftFoot"), rightFoot: joint("rightFoot"),
  };
}
