// A made-up player who copies the move ghost (src/render/GhostFigure.tsx), for tests/ghostVsDetectors.test.ts.
//
// Two readings of "copy the ghost":
// - LITERAL (`literalCopy`): the body ends up exactly where the ghost's joints are drawn. The ghost is flat: its arms
//   lie in the plane of the screen (z 0), so a punch is an arm held straight out to the side. Only a raised leg has
//   depth, because ghostJoints turns a diagram leg's sideways reach into forward reach. The ghost's arms are longer
//   than a person's, so the same copy can also be made on real limbs (`Limbs`).
// - INTENDED (`intendedCopy`): the move done right, the same keyframes tests/moves/detectors.test.ts uses.
//
// Which arm: GhostFigure turns the figure's back to the lens (its kick goes away from the viewer, toward the monster),
// so the ghost's left arm is on screen left and stands for the player's own left arm: reading "same". A player who
// takes the stick figure for somebody facing them would use the other arm: reading "swapped".
//
// Conventions are the fixture's (tests/poseFixture.ts, tests/helpers/poses.ts): shoulders at image x .42 / .58, y .35
// and world (-+.2, -.5, 0); world is metres from the hips with y down and z negative toward the camera; one metre
// covers 0.4 of the picture across and 0.6 down.
import type { MoveDef, MoveDiagram, PoseFrame, PoseHistory } from "../../src/core/types";
import { createPoseInput } from "../../src/input/poseInput";
import { MOVES } from "../../src/moves/registry";
import { EMPTY_HISTORY, JOINT, pushFrame } from "../../src/pose/signals";
import { ghostJoints } from "../../src/render/ghost/ghostPose";
import type { Vec3 } from "../../src/render/ghost/ghostPose";
import { GOD_GOOD } from "../godMoveSequences";
import { frameAt } from "../poseFixture";
import type { Arm, Key, Leg } from "./poses";
import {
  ACROSS, CHOP, COCKED, DOWN, GUARD, HIP, HOOK_IN, HOOK_OUT, LATERAL, LEG_CHAMBER, LEG_DOWN, LEG_KICK, LEG_KNEE,
  OVERHEAD, PALM, PUNCH, STAKE_CHEST, STAKE_DOWN, pose, sequence, withLegs,
} from "./poses";

const J = JOINT;
type P2 = readonly [number, number];

export const FRAME_MS = 33;
/** Still frames at the start of every recording: the game takes its baseline from them. */
export const CALIBRATION_FRAMES = 20;
/** Shares of the picture one metre covers, across and down (tests/poseFixture.ts). */
const PICTURE_X = 0.4;
const PICTURE_Y = 0.6;
/** The fixture draws legs at their own scale: hips at image y .65 and x .45 / .55, the floor 0.88 m lower at .95. */
const LEG_PICTURE_X = 0.5;
const LEG_PICTURE_Y = 0.3 / 0.88;
/** The fixture person's own limbs, in metres (tests/poseFixture.ts, and LEG_DOWN in tests/helpers/poses.ts). */
const UPPER_ARM = 0.3;
const FOREARM = 0.25;
const THIGH = 0.45;
const SHIN = 0.43;
const NOSE: P2 = [0.5, 0.2];
const SHOULDER_IMAGE = { left: [0.42, 0.35], right: [0.58, 0.35] } as const;
const SHOULDER_WORLD = { left: [-0.2, -0.5, 0], right: [0.2, -0.5, 0] } as const;
const HIP_IMAGE = { left: [0.45, 0.65], right: [0.55, 0.65] } as const;
const HIP_WORLD = { left: [-0.1, 0, 0], right: [0.1, 0, 0] } as const;

/** One joint: where it is in the picture and on the 3D body. */
interface Point { readonly image: P2; readonly world: Vec3 }
/** Everything that moves. `legs` only when the camera sees them (the kicks). */
interface Body {
  readonly nose: P2;
  readonly shoulders: { readonly left: Point; readonly right: Point };
  readonly hips: { readonly left: P2; readonly right: P2 };
  readonly arms: { readonly leftElbow: Point; readonly leftWrist: Point; readonly rightElbow: Point; readonly rightWrist: Point };
  readonly legs?: { readonly leftKnee: Point; readonly leftAnkle: Point; readonly rightKnee: Point; readonly rightAnkle: Point };
}

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const mix2 = (a: P2, b: P2, k: number): P2 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
const mix3 = (a: Vec3, b: Vec3, k: number): Vec3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const mixPoint = (a: Point, b: Point, k: number): Point => ({ image: mix2(a.image, b.image, k), world: mix3(a.world, b.world, k) });

/** Joints move in straight lines between two bodies, the way tests/helpers/poses.ts blends its keyframes. */
function mixBody(a: Body, b: Body, k: number): Body {
  const legs = a.legs && b.legs
    ? {
        legs: {
          leftKnee: mixPoint(a.legs.leftKnee, b.legs.leftKnee, k), leftAnkle: mixPoint(a.legs.leftAnkle, b.legs.leftAnkle, k),
          rightKnee: mixPoint(a.legs.rightKnee, b.legs.rightKnee, k), rightAnkle: mixPoint(a.legs.rightAnkle, b.legs.rightAnkle, k),
        },
      }
    : {};
  return {
    nose: mix2(a.nose, b.nose, k),
    shoulders: { left: mixPoint(a.shoulders.left, b.shoulders.left, k), right: mixPoint(a.shoulders.right, b.shoulders.right, k) },
    hips: { left: mix2(a.hips.left, b.hips.left, k), right: mix2(a.hips.right, b.hips.right, k) },
    arms: {
      leftElbow: mixPoint(a.arms.leftElbow, b.arms.leftElbow, k), leftWrist: mixPoint(a.arms.leftWrist, b.arms.leftWrist, k),
      rightElbow: mixPoint(a.arms.rightElbow, b.arms.rightElbow, k), rightWrist: mixPoint(a.arms.rightWrist, b.arms.rightWrist, k),
    },
    ...legs,
  };
}

function frameOfBody(t: number, body: Body): PoseFrame {
  const { arms, legs, shoulders } = body;
  return frameAt(
    t,
    {
      [J.nose]: body.nose,
      [J.leftShoulder]: shoulders.left.image, [J.rightShoulder]: shoulders.right.image,
      [J.leftHip]: body.hips.left, [J.rightHip]: body.hips.right,
      [J.leftElbow]: arms.leftElbow.image, [J.rightElbow]: arms.rightElbow.image,
      [J.leftWrist]: arms.leftWrist.image, [J.rightWrist]: arms.rightWrist.image,
      ...(legs && {
        [J.leftKnee]: legs.leftKnee.image, [J.rightKnee]: legs.rightKnee.image,
        [J.leftAnkle]: legs.leftAnkle.image, [J.rightAnkle]: legs.rightAnkle.image,
      }),
    },
    {
      [J.leftShoulder]: shoulders.left.world, [J.rightShoulder]: shoulders.right.world,
      [J.leftElbow]: arms.leftElbow.world, [J.rightElbow]: arms.rightElbow.world,
      [J.leftWrist]: arms.leftWrist.world, [J.rightWrist]: arms.rightWrist.world,
      ...(legs && {
        [J.leftHip]: HIP_WORLD.left, [J.rightHip]: HIP_WORLD.right,
        [J.leftKnee]: legs.leftKnee.world, [J.rightKnee]: legs.rightKnee.world,
        [J.leftAnkle]: legs.leftAnkle.world, [J.rightAnkle]: legs.rightAnkle.world,
      }),
    },
  );
}

const leftArm = (arm: Arm): { elbow: Point; wrist: Point } => ({
  elbow: { image: arm.elbow, world: arm.elbow3 }, wrist: { image: arm.wrist, world: arm.wrist3 },
});
const rightArm = (arm: Arm): { elbow: Point; wrist: Point } => ({
  elbow: { image: [1 - arm.elbow[0], arm.elbow[1]], world: [-arm.elbow3[0], arm.elbow3[1], arm.elbow3[2]] },
  wrist: { image: [1 - arm.wrist[0], arm.wrist[1]], world: [-arm.wrist3[0], arm.wrist3[1], arm.wrist3[2]] },
});
const standingLeg = (side: "left" | "right", leg: Leg = LEG_DOWN): { knee: Point; ankle: Point } => {
  const flip = side === "right";
  return {
    knee: { image: [flip ? 1 - leg.knee[0] : leg.knee[0], leg.knee[1]], world: [flip ? -leg.knee3[0] : leg.knee3[0], leg.knee3[1], leg.knee3[2]] },
    ankle: { image: [flip ? 1 - leg.ankle[0] : leg.ankle[0], leg.ankle[1]], world: [flip ? -leg.ankle3[0] : leg.ankle3[0], leg.ankle3[1], leg.ankle3[2]] },
  };
};

/** The fixture's person with both arms in `arm` (written for the left side) and, when asked, the legs in view. */
function fixtureBody(arm: Arm, withTheLegs: boolean): Body {
  const left = leftArm(arm);
  const right = rightArm(arm);
  const l = standingLeg("left");
  const r = standingLeg("right");
  return {
    nose: NOSE,
    shoulders: {
      left: { image: SHOULDER_IMAGE.left, world: SHOULDER_WORLD.left },
      right: { image: SHOULDER_IMAGE.right, world: SHOULDER_WORLD.right },
    },
    hips: HIP_IMAGE,
    arms: { leftElbow: left.elbow, leftWrist: left.wrist, rightElbow: right.elbow, rightWrist: right.wrist },
    ...(withTheLegs && { legs: { leftKnee: l.knee, leftAnkle: l.ankle, rightKnee: r.knee, rightAnkle: r.ankle } }),
  };
}

const unit = (v: Vec3, length: number): Vec3 => {
  const size = Math.hypot(...v) || 1;
  return [(v[0] / size) * length, (v[1] / size) * length, (v[2] / size) * length];
};

/**
 * A real arm (0.3 m and 0.25 m) copying a drawn one, both measured from the shoulder. The hand goes where the ghost's
 * hand is, with the elbow bent to the side the ghost's elbow is on. The ghost draws arms long (a straight one is
 * 0.7 m): a hand drawn out of reach cannot be matched, so each bone then points the way the ghost's does instead.
 */
function realArm(drawnElbow: Vec3, drawnWrist: Vec3): [Vec3, Vec3] {
  const far = Math.hypot(...drawnWrist);
  if (far > UPPER_ARM + FOREARM || far < UPPER_ARM - FOREARM) {
    const elbow = unit(drawnElbow, UPPER_ARM);
    const fore = unit([drawnWrist[0] - drawnElbow[0], drawnWrist[1] - drawnElbow[1], drawnWrist[2] - drawnElbow[2]], FOREARM);
    return [elbow, [elbow[0] + fore[0], elbow[1] + fore[1], elbow[2] + fore[2]]];
  }
  const dir = unit(drawnWrist, 1);
  const along = (UPPER_ARM ** 2 - FOREARM ** 2 + far * far) / (2 * far);
  const out = Math.sqrt(Math.max(0, UPPER_ARM ** 2 - along * along));
  const dot = drawnElbow[0] * dir[0] + drawnElbow[1] * dir[1] + drawnElbow[2] * dir[2];
  const side = unit([drawnElbow[0] - dot * dir[0], drawnElbow[1] - dot * dir[1], drawnElbow[2] - dot * dir[2]], out);
  return [[dir[0] * along + side[0], dir[1] * along + side[1], dir[2] * along + side[2]], drawnWrist];
}

/** The diagram as a player would act it who takes the figure for somebody facing them: the other arm, the other way. */
export function swapped(d: MoveDiagram): MoveDiagram {
  const across = (p: readonly [number, number]): readonly [number, number] => [100 - p[0], p[1]];
  return {
    leftElbow: across(d.rightElbow), leftWrist: across(d.rightWrist),
    rightElbow: across(d.leftElbow), rightWrist: across(d.leftWrist),
    ...(d.shiftX !== undefined && { shiftX: -d.shiftX }),
    ...(d.shiftY !== undefined && { shiftY: d.shiftY }),
    // A leg point's x is how far forward it reaches, not which way across: it stays as drawn on the other leg.
    ...(d.rightKnee && { leftKnee: d.rightKnee }), ...(d.rightFoot && { leftFoot: d.rightFoot }),
    ...(d.leftKnee && { rightKnee: d.leftKnee }), ...(d.leftFoot && { rightFoot: d.leftFoot }),
  };
}

type Side = "left" | "right";

function hangs(frame: PoseFrame, side: Side): boolean {
  const shoulder = frame.image[side === "left" ? J.leftShoulder : J.rightShoulder];
  const wrist = frame.image[side === "left" ? J.leftWrist : J.rightWrist];
  if (!shoulder || !wrist) return false;
  return Math.abs(Math.abs(wrist.x - shoulder.x) - (SHOULDER_IMAGE.left[0] - DOWN.wrist[0])) < 1e-6
    && Math.abs(wrist.y - shoulder.y - (DOWN.wrist[1] - SHOULDER_IMAGE.left[1])) < 1e-6;
}

/** The arms that hang at the side through the whole recording: the ones the move does not use. */
export function idleSides(recording: Recording): Side[] {
  return (["left", "right"] as const).filter((side) => recording.frames.every((frame) => hangs(frame, side)));
}

/**
 * The frame with the given arms put exactly on the ghost's (in the picture only). The clean performances leave the
 * hand that is not striking hanging, while the ghost draws it up in a guard: this takes that difference out, so
 * what is left is how far the rest of the body is from the ghost.
 */
export function armsAsDrawn(frame: PoseFrame, diagram: MoveDiagram, sides: readonly Side[]): PoseFrame {
  // Every joint at the ghost's own distance in a square picture is what ghostCloseness scores as no error.
  const arms = ghostBody({ ...diagram, shiftX: 0, shiftY: 0 }, "exact", PICTURE_X).arms;
  const image = [...frame.image];
  for (const side of sides) {
    const left = side === "left";
    const shoulder = image[left ? J.leftShoulder : J.rightShoulder];
    if (!shoulder) continue;
    const from = SHOULDER_IMAGE[side];
    const put = (index: number, at: P2): void => {
      image[index] = { x: shoulder.x + at[0] - from[0], y: shoulder.y + at[1] - from[1], z: 0, visibility: 1 };
    };
    put(left ? J.leftElbow : J.rightElbow, (left ? arms.leftElbow : arms.rightElbow).image);
    put(left ? J.leftWrist : J.rightWrist, (left ? arms.leftWrist : arms.rightWrist).image);
  }
  return { ...frame, image };
}

const hasLegs = (d: MoveDiagram): boolean => Boolean(d.leftKnee ?? d.leftFoot ?? d.rightKnee ?? d.rightFoot);

/**
 * The body standing in the ghost's pose. Ghost joints are metres with x to the player's right, y up and its forward
 * (a kick) at -z; the webcam's 3D body has y down and the camera at -z, so x and z carry over and y flips.
 * Arms hang off the fixture's shoulders and a raised leg off its hips. A lean or crouch moves the picture by the
 * ghost's shoulder shift, and the 3D shoulders by their shift against the hips.
 * `down` is how much of the picture one metre covers downward: 0.6 on the fixture, 0.4 for a square picture.
 */
export function ghostBody(diagram: MoveDiagram, limbs: Limbs = "exact", down = PICTURE_Y): Body {
  const g = ghostJoints(diagram);
  /** The offset of `at` from `from`, ghost axes to webcam axes. */
  const bone = (from: Vec3, at: Vec3): Vec3 => [at[0] - from[0], -(at[1] - from[1]), at[2] - from[2]];
  const rest = ghostJoints({ ...diagram, shiftX: 0, shiftY: 0 });
  const shoulderShift: P2 = [g.leftShoulder[0] - rest.leftShoulder[0], g.leftShoulder[1] - rest.leftShoulder[1]];
  const hipShift: P2 = [g.leftHip[0] - rest.leftHip[0], g.leftHip[1] - rest.leftHip[1]];
  const moved = (p: P2, shift: P2): P2 => [p[0] + shift[0] * PICTURE_X, p[1] - shift[1] * down];
  const shoulder = (side: "left" | "right"): Point => {
    const w = SHOULDER_WORLD[side];
    return {
      image: moved(SHOULDER_IMAGE[side], shoulderShift),
      world: [w[0] + shoulderShift[0] - hipShift[0], w[1] - (shoulderShift[1] - hipShift[1]), w[2]],
    };
  };
  const shoulders = { left: shoulder("left"), right: shoulder("right") };
  const arm = (side: "left" | "right"): { elbow: Point; wrist: Point } => {
    const left = side === "left";
    const s = shoulders[side];
    const from = left ? g.leftShoulder : g.rightShoulder;
    const drawnElbow = bone(from, left ? g.leftElbow : g.rightElbow);
    const drawnWrist = bone(from, left ? g.leftWrist : g.rightWrist);
    const [elbow, wrist] = limbs === "real" ? realArm(drawnElbow, drawnWrist) : [drawnElbow, drawnWrist];
    const point = (off: Vec3): Point => ({
      image: [s.image[0] + off[0] * PICTURE_X, s.image[1] + off[1] * down],
      world: [s.world[0] + off[0], s.world[1] + off[1], s.world[2] + off[2]],
    });
    return { elbow: point(elbow), wrist: point(wrist) };
  };
  // A leg the diagram does not draw stands as the fixture's does, so it keeps its length all the way through.
  const leg = (side: "left" | "right"): { knee: Point; ankle: Point } => {
    const left = side === "left";
    if (!(left ? diagram.leftKnee ?? diagram.leftFoot : diagram.rightKnee ?? diagram.rightFoot)) return standingLeg(side);
    const hip = HIP_WORLD[side];
    const hipAt = HIP_IMAGE[side];
    const thigh = bone(left ? g.leftHip : g.rightHip, left ? g.leftKnee : g.rightKnee);
    const shin = bone(left ? g.leftKnee : g.rightKnee, left ? g.leftFoot : g.rightFoot);
    // A real leg points each bone the way the ghost's does and keeps its own length.
    const knee = limbs === "real" ? unit(thigh, THIGH) : thigh;
    const lower = limbs === "real" ? unit(shin, SHIN) : shin;
    const ankle: Vec3 = [knee[0] + lower[0], knee[1] + lower[1], knee[2] + lower[2]];
    const point = (off: Vec3): Point => ({
      image: [hipAt[0] + off[0] * LEG_PICTURE_X, hipAt[1] + off[1] * LEG_PICTURE_Y],
      world: [hip[0] + off[0], hip[1] + off[1], hip[2] + off[2]],
    });
    return { knee: point(knee), ankle: point(ankle) };
  };
  const la = arm("left");
  const ra = arm("right");
  const l = leg("left");
  const r = leg("right");
  return {
    nose: moved(NOSE, shoulderShift),
    shoulders,
    hips: { left: moved(HIP_IMAGE.left, hipShift), right: moved(HIP_IMAGE.right, hipShift) },
    arms: { leftElbow: la.elbow, leftWrist: la.wrist, rightElbow: ra.elbow, rightWrist: ra.wrist },
    ...(hasLegs(diagram) && { legs: { leftKnee: l.knee, leftAnkle: l.ankle, rightKnee: r.knee, rightAnkle: r.ankle } }),
  };
}

/** One frame of somebody standing in the ghost's pose. */
export function ghostFrame(diagram: MoveDiagram, limbs: Limbs = "exact", down = PICTURE_Y): PoseFrame {
  return frameOfBody(0, ghostBody(diagram, limbs, down));
}

export type Reading = "same" | "swapped";
/**
 * How the copied limbs are measured. "exact": every joint sits exactly where the ghost draws it, which makes a
 * straight arm about 0.7 m and a hanging one 0.8 m (the ghost draws arms long). "real": the same pose on the
 * fixture's own limbs (see `realArm`; a drawn leg points the way the ghost's does at its own length).
 */
export type Limbs = "exact" | "real";
/** Where the hands wait before the copy: hanging at the sides, or up at the chest with the elbows bent. */
export type Start = "down" | "guard";

export interface CopyOptions {
  /** How long the player takes to get from the start into the ghost's pose, in milliseconds. */
  readonly ms: number;
  readonly reading?: Reading;
  readonly start?: Start;
  readonly limbs?: Limbs;
}

export interface Recording {
  readonly frames: readonly PoseFrame[];
  /** Time the copy starts. Whatever fired before it (hands coming up to the chest) is not the copy's doing. */
  readonly from: number;
  /** Time the player lets go of the pose and drops back to the start, or null when the recording ends in the pose. */
  readonly release: number | null;
}

const HOLD_MS = 500;
const RELEASE_MS = 250;
/** How long the hands wait at the chest before the copy, so nothing from raising them is still in the one-second history. */
const WAIT_MS = 1100;

/**
 * LITERAL: 20 still frames arms down (the baseline), hands to the chest and a wait when `start` is "guard", then
 * straight into the ghost's pose in `ms`, held for half a second, then dropped back to the start in a quarter second.
 */
export function literalCopy(def: MoveDef, options: CopyOptions): Recording {
  const diagram = options.reading === "swapped" ? swapped(def.diagram) : def.diagram;
  const legs = hasLegs(diagram);
  const standing = fixtureBody(DOWN, legs);
  // COCKED is fists at the chest: tests/moves/detectors.test.ts shows it does not read as a block.
  const start = options.start === "guard" ? fixtureBody(COCKED, legs) : standing;
  const target = ghostBody(diagram, options.limbs ?? "exact");
  const bodies: Body[] = Array.from({ length: CALIBRATION_FRAMES }, () => standing);
  const move = (a: Body, b: Body, ms: number): void => {
    const count = Math.max(1, Math.round(ms / FRAME_MS));
    for (let i = 1; i <= count; i++) bodies.push(mixBody(a, b, i / count));
  };
  if (start !== standing) {
    move(standing, start, 300);
    move(start, start, WAIT_MS);
  }
  const from = (bodies.length - 1) * FRAME_MS;
  move(start, target, options.ms);
  move(target, target, HOLD_MS);
  const release = (bodies.length - 1) * FRAME_MS;
  move(target, start, RELEASE_MS);
  move(start, start, 200);
  return { frames: bodies.map((body, index) => frameOfBody(index * FRAME_MS, body)), from, release };
}

const both = (arm: Arm) => pose(arm, arm);
const left = (arm: Arm) => pose(arm, DOWN);
const right = (arm: Arm) => pose(DOWN, arm);
const keys = (...pairs: [number, ReturnType<typeof pose>][]): Key[] => pairs.map(([t, p]) => ({ t, pose: p }));
const leg = (shape: Leg = LEG_DOWN) => withLegs(pose(DOWN), LEG_DOWN, shape);

/** Each move done right: the same sequences as tests/moves/detectors.test.ts, which does not export its table. */
export const GOOD: Record<string, Key[]> = {
  jab: keys([0, pose(DOWN)], [150, left(COCKED)], [300, left(PUNCH)]),
  cross: keys([0, pose(DOWN)], [150, right(COCKED)], [300, right(PUNCH)]),
  hook: keys([0, left(HOOK_OUT)], [100, left(HOOK_OUT)], [250, left(HOOK_IN)]),
  uppercut: keys([0, pose(DOWN)], [250, right(GUARD)]),
  rising_palm: keys([0, pose(DOWN)], [250, left(GUARD)]),
  hammer_fist: keys([0, pose(DOWN)], [300, left(OVERHEAD)], [500, left(CHOP)]),
  overhead_strike: keys([0, pose(DOWN)], [300, right(OVERHEAD)], [500, right(CHOP)]),
  knife_hand: keys([0, pose(DOWN)], [200, right(ACROSS)], [450, right(LATERAL)]),
  reverse_punch: keys([0, pose(DOWN)], [150, pose(HIP, COCKED)], [300, pose(HIP, PUNCH)]),
  spear_thrust: keys([0, pose(DOWN)], [150, both(COCKED)], [300, both(PUNCH)]),
  double_palm: keys([0, pose(DOWN)], [150, both(COCKED)], [300, both(PALM)]),
  chain_punch: keys(
    [0, pose(DOWN)], [100, left(COCKED)], [250, left(PUNCH)], [350, right(COCKED)], [500, right(PUNCH)],
  ),
  stake_thrust: keys([0, pose(DOWN)], [300, both(STAKE_CHEST)], [500, both(STAKE_DOWN)]),
  front_kick: keys([0, leg()], [100, leg()], [300, leg(LEG_CHAMBER)], [450, leg(LEG_KICK)]),
  knee: keys([0, leg()], [100, leg()], [300, leg(LEG_KNEE)], [500, leg(LEG_KNEE)]),
  block: keys([0, pose(DOWN)], [250, both(GUARD)], [450, both(GUARD)]),
  duck: keys([0, pose(DOWN)], [300, pose(DOWN, DOWN, 0, 0.12)], [500, pose(DOWN, DOWN, 0, 0.12)]),
  dodge_left: keys([0, pose(DOWN)], [300, pose(DOWN, DOWN, -0.12, 0)], [500, pose(DOWN, DOWN, -0.12, 0)]),
  dodge_right: keys([0, pose(DOWN)], [300, pose(DOWN, DOWN, 0.12, 0)], [500, pose(DOWN, DOWN, 0.12, 0)]),
  ...GOD_GOOD,
};

/** INTENDED: the move done right, after the same 20 still frames. */
export function intendedCopy(id: string): Recording {
  const good = GOOD[id];
  if (!good) throw new Error(`no clean performance for ${id}`);
  return { frames: sequence(good), from: CALIBRATION_FRAMES * FRAME_MS, release: null };
}

export interface Outcome {
  /** A strike was thrown, or a defend held, at some point between the start of the copy and letting go. */
  readonly counted: boolean;
  /** The same, but only while the player drops back out of the pose. */
  readonly countedOnRelease: boolean;
  /** The move's highest confidence between the start of the copy and letting go (the game needs 0.7). */
  readonly peak: number;
  /** The frame and history at that peak (the first frame to reach it), or null when the recording has no frames. */
  readonly peakFrame: PoseFrame | null;
  readonly peakHistory: PoseHistory | null;
  /** Every other move thrown or held between the start of the copy and letting go, in alphabetical order. */
  readonly others: readonly string[];
  /** Every other move thrown or held while dropping back out of the pose. */
  readonly othersOnRelease: readonly string[];
}

/** Plays a recording through the real pose input one frame at a time, as the fight screen does, and watches one move. */
export function watch(recording: Recording, id: string): Outcome {
  const def = MOVES.get(id);
  if (!def) throw new Error(`no move ${id}`);
  const read = createPoseInput(MOVES);
  let history = EMPTY_HISTORY;
  let counted = false;
  let countedOnRelease = false;
  let peak = -1;
  let peakFrame: PoseFrame | null = null;
  let peakHistory: PoseHistory | null = null;
  const others = new Set<string>();
  const othersOnRelease = new Set<string>();
  for (const frame of recording.frames) {
    history = pushFrame(history, frame);
    const input = read(history);
    if (frame.t <= recording.from) continue;
    const seen = [...input.held, ...input.struck.map((strike) => strike.move)];
    const after = recording.release !== null && frame.t > recording.release;
    for (const move of seen) {
      if (move === id && after) countedOnRelease = true;
      else if (move === id) counted = true;
      else (after ? othersOnRelease : others).add(move);
    }
    if (after) continue;
    const confidence = def.detect(history);
    if (confidence > peak) {
      peak = confidence;
      peakFrame = frame;
      peakHistory = history;
    }
  }
  return {
    counted, countedOnRelease, peak: Math.max(0, peak), peakFrame, peakHistory,
    others: [...others].sort(), othersOnRelease: [...othersOnRelease].sort(),
  };
}
