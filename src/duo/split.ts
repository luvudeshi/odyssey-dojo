// Two players on one camera: one body in the picture becomes what a single-player move reader expects.
// Each player gets a history and a neutral stance of their own, so one player's punch never reads as the other's,
// and a body can be moved in the picture to where another body stood (when player two takes over as the hero).
import { createPoseInput } from "../input/poseInput";
import type { CombatInput, Landmark, MoveDef, PoseFrame, PoseHistory } from "../core/types";
import { EMPTY_HISTORY, JOINT, baselineOf, joint, pushFrame } from "../pose/signals";

/** One body as the tracker found it in one picture, already mirrored like PoseFrame. */
export interface Body {
  readonly image: readonly Landmark[];
  readonly world: readonly Landmark[];
}

/** Where a body stands in the picture: the middle of the shoulders, and how wide they are. */
export interface Home {
  readonly x: number;
  readonly y: number;
  readonly w: number;
}

export function homeOf(image: readonly Landmark[]): Home {
  const left = joint(image, JOINT.leftShoulder);
  const right = joint(image, JOINT.rightShoulder);
  return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2, w: Math.hypot(left.x - right.x, left.y - right.y) };
}

/**
 * The same frame with its picture points moved and sized so that a body standing at `from` is drawn at `to`.
 * The 3D points hang off the body's own hips and stay as they are.
 */
export function rebase(frame: PoseFrame, from: Home, to: Home): PoseFrame {
  const scale = from.w > 0 ? to.w / from.w : 1;
  return {
    t: frame.t,
    world: frame.world,
    image: frame.image.map((p) => ({ ...p, x: to.x + (p.x - from.x) * scale, y: to.y + (p.y - from.y) * scale })),
  };
}

/** A gap this long between a player's frames means they left: whoever comes next starts from nothing. */
export const FORGET_MS = 1500;
/** The neutral stance is taken from this many of the newest frames. */
const SETTLE_FRAMES = 20;

const NOTHING: CombatInput = { held: new Set(), struck: [] };

export interface BodyReader {
  /**
   * Give it the player's newest frame (the same frame again, or null, is fine). Returns what the player is doing:
   * strikes only on the call that first sees them, defends for as long as they are held.
   */
  read(frame: PoseFrame | null): CombatInput;
  /** The player is standing ready now: take their neutral stance from the last frames, not from when they walked in. */
  settle(): void;
  history(): PoseHistory;
}

/** One player's own move reader: their frames, their neutral stance, their strikes and defends. */
export function createBodyReader(moves: ReadonlyMap<string, MoveDef>): BodyReader {
  let history: PoseHistory = EMPTY_HISTORY;
  let read = createPoseInput(moves);
  let lastT = -Infinity;
  let held: ReadonlySet<string> = NOTHING.held;
  return {
    read(frame) {
      if (!frame) {
        held = NOTHING.held;
        return NOTHING;
      }
      if (frame.t <= lastT) return { held, struck: [] };
      if (frame.t - lastT > FORGET_MS) {
        history = EMPTY_HISTORY;
        read = createPoseInput(moves);
      }
      lastT = frame.t;
      history = pushFrame(history, frame);
      const input = read(history);
      held = input.held;
      return input;
    },
    settle() {
      const frames = history.frames.slice(-SETTLE_FRAMES);
      if (frames.length > 0) history = { frames: history.frames, baseline: baselineOf(frames) };
    },
    history: () => history,
  };
}
