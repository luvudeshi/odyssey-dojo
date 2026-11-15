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
/**
 * A player with no neutral stance yet gets one from their first frames, as soon as there are this many. The shared
 * history (src/pose/signals.ts) waits for 20 frames inside one second, which a camera under 20 pictures a second
 * never gives, or gives at some chance moment in the middle of a move. A stance taken in the middle of a dodge makes
 * standing still read as the opposite dodge for the rest of the fight.
 */
export const STANCE_FRAMES = 8;

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
  /** The frames since this player was last new to the reader: their stance comes from the first STANCE_FRAMES of them. */
  let fresh: PoseFrame[] = [];
  /** `settle` was asked for before there were frames to take the stance from: take it from the next ones. */
  let owed = false;
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
        fresh = [];
      }
      lastT = frame.t;
      // The stance is never left to the shared history's own rule: see STANCE_FRAMES.
      const next = pushFrame({ frames: history.frames, baseline: null }, frame);
      history = { frames: next.frames, baseline: history.baseline };
      if (fresh.length < STANCE_FRAMES) {
        fresh.push(frame);
        if (fresh.length === STANCE_FRAMES && (owed || !history.baseline)) {
          history = { frames: history.frames, baseline: baselineOf(fresh) };
          owed = false;
        }
      }
      const input = read(history);
      held = input.held;
      return input;
    },
    settle() {
      const frames = history.frames.slice(-SETTLE_FRAMES);
      if (frames.length >= STANCE_FRAMES) history = { frames: history.frames, baseline: baselineOf(frames) };
      else {
        // Too little to go on yet (the fight has only just begun to read this player): the next frames will do.
        owed = true;
        fresh = [];
      }
    },
    history: () => history,
  };
}
