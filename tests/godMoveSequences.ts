// Each god move done right, as keyframes for tests/moves/detectors.test.ts, which wants one for every move.
// Arms are written for the left side, as in tests/helpers/poses.ts; the right arm is the mirror image.
import type { Arm, Key } from "./helpers/poses";
import { CHOP, DOWN, OVERHEAD, pose } from "./helpers/poses";

/** Shoulder width of the standing person, in image units. */
const WIDTH = 0.16;
const FRAME_MS = 33;

/** Open palm at the chest, elbow bent: the start of a push. Lower than a guard, so it is not a block. */
export const AT_CHEST: Arm = { elbow: [0.38, 0.5], wrist: [0.44, 0.42], elbow3: [-0.3, -0.25, 0], wrist3: [-0.15, -0.4, -0.12] };
/** Arm straight out in front with the palm just inside its shoulder. */
export const PUSHED: Arm = { elbow: [0.43, 0.4], wrist: [0.45, 0.4], elbow3: [-0.2, -0.45, -0.3], wrist3: [-0.18, -0.45, -0.58] };
/** Hand out past its own side at belly height: one end of a sweep. */
export const SWEEP_OUT: Arm = { elbow: [0.32, 0.46], wrist: [0.24, 0.45], elbow3: [-0.35, -0.3, -0.1], wrist3: [-0.5, -0.25, -0.3] };
/** Hand across the body on the other side at belly height: the other end of a sweep. */
export const SWEEP_ACROSS: Arm = { elbow: [0.52, 0.48], wrist: [0.64, 0.45], elbow3: [-0.1, -0.25, -0.2], wrist3: [0.2, -0.25, -0.35] };
/** Arm straight out to its own side at shoulder height: a bow arm, or one arm flung wide. */
export const WIDE: Arm = { elbow: [0.31, 0.35], wrist: [0.2, 0.35], elbow3: [-0.48, -0.5, 0], wrist3: [-0.75, -0.5, 0] };
/** String hand drawn back to its own shoulder, elbow out and sharply bent. */
export const DRAWN: Arm = { elbow: [0.3, 0.37], wrist: [0.4, 0.36], elbow3: [-0.47, -0.48, 0], wrist3: [-0.24, -0.48, -0.05] };
/** String hand dropped away from the shoulder: the arrow is loosed. */
export const LOOSED: Arm = { elbow: [0.34, 0.45], wrist: [0.28, 0.5], elbow3: [-0.4, -0.3, 0.05], wrist3: [-0.5, -0.1, 0] };
/** Hand at the middle of the chest, meeting the other hand. */
export const TOGETHER: Arm = { elbow: [0.38, 0.48], wrist: [0.48, 0.42], elbow3: [-0.28, -0.25, -0.05], wrist3: [-0.04, -0.35, -0.15] };

// Shoulder height through a hop, in shoulder widths per frame: a small dip, up 0.3, then back down.
const HOP = [0.04, 0.06, -0.05, -0.15, -0.25, -0.3, -0.25, -0.15, -0.03, 0.05, 0.02, 0];

const aside = pose(DOWN, DOWN, 0.75 * WIDTH, 0);

export const GOD_GOOD: Record<string, Key[]> = {
  thunderbolt: [
    { t: 0, pose: pose(DOWN) },
    { t: 300, pose: pose(DOWN, OVERHEAD) },
    { t: 500, pose: pose(DOWN, CHOP) },
  ],
  trident_sweep: [
    { t: 0, pose: pose(DOWN) },
    { t: 300, pose: pose(SWEEP_OUT, SWEEP_ACROSS) },
    { t: 400, pose: pose(SWEEP_OUT, SWEEP_ACROSS) },
    { t: 600, pose: pose(SWEEP_ACROSS, SWEEP_OUT) },
  ],
  aegis_push: [
    { t: 0, pose: pose(DOWN) },
    { t: 250, pose: pose(AT_CHEST) },
    { t: 400, pose: pose(PUSHED) },
  ],
  // One fast step: three quarters of a shoulder width to the right in 200 ms.
  swift_dash: [
    { t: 0, pose: pose(DOWN) },
    { t: 200, pose: aside },
    { t: 400, pose: aside },
  ],
  moon_arrow: [
    { t: 0, pose: pose(DOWN) },
    { t: 300, pose: pose(WIDE, DRAWN) },
    { t: 500, pose: pose(WIDE, DRAWN) },
    { t: 600, pose: pose(WIDE, LOOSED) },
  ],
  sun_burst: [
    { t: 0, pose: pose(DOWN) },
    { t: 250, pose: pose(TOGETHER) },
    { t: 400, pose: pose(TOGETHER) },
    { t: 550, pose: pose(WIDE) },
  ],
  jump: HOP.map((rise, index) => ({ t: index * FRAME_MS, pose: pose(DOWN, DOWN, 0, rise * WIDTH) })),
};
