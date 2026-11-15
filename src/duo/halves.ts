// Two players on one camera: finding two bodies when the pose model, looking at the whole picture, gives one.
// Asked for two bodies in one picture, the model returns one when the two stand close together or small in the
// picture (docs/duo.md, "What the model sees"). A model that looks at one half of the picture and is asked for one
// body finds the person in that half in those cases too. Reading the halves has its own blind spot: someone on the
// middle line is cut in two. So the whole picture stays the first reader, and the halves take over only while they
// find more bodies than it does. Pure: the tracker (src/pose/tracker.ts) gives it the two ways of reading a picture.
import type { Landmark } from "../core/types";
import { homeOf } from "./split";
import type { Body } from "./split";

/** How much of the picture's width one half reader sees: half of it, and a strip past the middle line. */
export const HALF_SHARE = 0.55;
/**
 * Two readings whose shoulders' middles are nearer than this many shoulder widths (the wider one's) are one person
 * seen by both halves in the strip they share. Two people cannot stand that close side by side.
 */
export const SAME_BODY = 1;
/** With fewer than two bodies in the whole picture, one half is tried on every this-many-th picture. */
export const PROBE_EVERY = 6;
/** The halves hand back to the whole picture after this many pictures in a row in which they found no more than it. */
export const GIVE_UP = 3;

/**
 * While the halves are the reader and find two bodies, the whole picture is still read on every this-many-th picture.
 * A half cannot see past its own edge: someone who has moved onto the middle line, or reaches across it, loses that
 * arm for as long as the halves stay the reader.
 */
export const LOOK_BACK_EVERY = 30;
/** The whole picture takes over again after showing two different people on this many pictures in a row. */
export const LOOK_BACK_TIMES = 3;

/** The screen's left half (player one's side, 0) or its right half (1). The picture on screen is the camera's, mirrored. */
export type Side = 0 | 1;

/** Where a half starts in the camera's own picture (not mirrored), as a share of its width. */
export function halfStart(side: Side, share = HALF_SHARE): number {
  return side === 0 ? 1 - share : 0;
}

/**
 * The points the model gave for one half of the camera's picture, as points of the whole picture, mirrored like
 * PoseFrame.image. `start` and `share` say which part of the width the half was. Depth is in units of the picture's
 * width, so it shrinks with it. Heights do not change: a half is as tall as the picture.
 */
export function fromHalf(points: readonly { x: number; y: number; z: number; visibility?: number }[], start: number, share: number): Landmark[] {
  return points.map((p) => ({ x: 1 - (start + p.x * share), y: p.y, z: p.z * share, visibility: p.visibility ?? 0 }));
}

/** True when the two readings are one person, found once by each half. */
export function sameBody(a: Body, b: Body): boolean {
  const one = homeOf(a.image);
  const other = homeOf(b.image);
  return Math.hypot(one.x - other.x, one.y - other.y) < SAME_BODY * Math.max(one.w, other.w);
}

/**
 * What the two halves found, as a list: the screen's left body first. One person found by both is listed once,
 * as read by the half that holds the middle of their shoulders.
 */
export function pairOf(left: Body | null, right: Body | null): Body[] {
  if (!left) return right ? [right] : [];
  if (!right) return [left];
  if (!sameBody(left, right)) return [left, right];
  return [homeOf(left.image).x + homeOf(right.image).x < 1 ? left : right];
}

export interface PairFinder {
  /**
   * The bodies in one picture. `whole` reads the whole picture and `half` one half of it; each is called at most once
   * per side, and only when needed. `half` is null while the half readers cannot be used: the whole picture is read.
   */
  next(whole: () => Body[], half: ((side: Side) => Body | null) | null): Body[];
  /** Which reader gave the last picture's bodies. */
  reader(): "whole" | "halves";
  reset(): void;
}

export function createPairFinder(): PairFinder {
  let reader: "whole" | "halves" = "whole";
  /** Pictures since a half was last tried, while the whole picture shows fewer than two bodies. */
  let waited = 0;
  let side: Side = 0;
  /** What each half showed when it was last tried. */
  const tried: [Body | null, Body | null] = [null, null];
  /** The two tries together showed more bodies than the whole picture: read both halves on the next picture to be sure. */
  let check = false;
  /** Pictures in a row in which the halves found fewer than two bodies. */
  let short = 0;
  /** Pictures since the whole picture was last looked at while the halves, as the reader, found two bodies. */
  let since = 0;
  /** Looks in a row at which the whole picture showed two different people. */
  let both = 0;
  /** The whole picture showed two bodies on the picture before this one. */
  let had = false;

  const forget = (): void => {
    waited = 0;
    tried[0] = null;
    tried[1] = null;
    check = false;
    short = 0;
    since = 0;
    both = 0;
    had = false;
  };

  return {
    next(whole, half) {
      if (!half) {
        reader = "whole";
        forget();
        return whole();
      }
      if (reader === "halves") {
        const halves = pairOf(half(0), half(1));
        if (halves.length >= 2) {
          short = 0;
          since += 1;
          // Now and then, and then on every picture while it keeps showing two people, look at the whole picture.
          if (since >= LOOK_BACK_EVERY || both > 0) {
            since = 0;
            const all = whole();
            const [one, other] = all;
            both = one && other && !sameBody(one, other) ? both + 1 : 0;
            if (both >= LOOK_BACK_TIMES) {
              reader = "whole";
              forget();
              return all;
            }
          }
          return halves;
        }
        // A body short. Look at the whole picture as well: on each of the first few such pictures, then now and then.
        short += 1;
        if (short > GIVE_UP && short % PROBE_EVERY !== 0) return halves;
        const all = whole();
        if (all.length > halves.length || (all.length === halves.length && short >= GIVE_UP)) {
          reader = "whole";
          forget();
          return all;
        }
        return halves;
      }
      const all = whole();
      if (all.length >= 2) {
        forget();
        had = true;
        return all;
      }
      // A body was lost from one picture to the next (two people stepped together): ask both halves at once.
      if (check || had) {
        had = false;
        check = false;
        tried[0] = half(0);
        tried[1] = half(1);
        const halves = pairOf(tried[0], tried[1]);
        if (halves.length > all.length) {
          reader = "halves";
          forget();
          return halves;
        }
        return all;
      }
      waited += 1;
      if (waited >= PROBE_EVERY) {
        waited = 0;
        tried[side] = half(side);
        side = side === 0 ? 1 : 0;
        check = pairOf(tried[0], tried[1]).length > all.length;
      }
      return all;
    },
    reader: () => reader,
    reset() {
      reader = "whole";
      side = 0;
      forget();
    },
  };
}
