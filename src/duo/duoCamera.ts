// Two players on one camera: the one place the webcam tracker and the fight meet.
// The tracker asks `wanted()` how many bodies to look for and hands every body it found to `take`, which gives
// back player one's frame (what the tracker returns as before) and keeps player two's for the fight's link.
// Off by default: with it off the tracker looks for one body and nothing here runs.
import type { PoseFrame } from "../core/types";
import { LEAVE_MS, createSeating } from "./assign";
import type { Body } from "./split";

export interface DuoCamera {
  /** Turned on by the "Two players, one camera" choice, and off again when that way of playing is left. */
  setOn(on: boolean): void;
  on(): boolean;
  /** How many bodies the pose model should look for: 2 while on, 1 otherwise. */
  wanted(): 1 | 2;
  /** Every body in one picture (mirrored, as PoseFrame) and its time. Returns player one's frame, or null. */
  take(bodies: readonly Body[], t: number): PoseFrame | null;
  /**
   * The frame to draw over the camera's picture for a frame `take` gave out: the same frame, except after player
   * two took the hero's place, when it is the body where it really stands and not where the hero stood.
   */
  seen(frame: PoseFrame): PoseFrame;
  /** Player two's newest frame, or null when there is none or it is older than a moment. */
  second(now: number): PoseFrame | null;
  /** 2 while a second player has joined and is still there. */
  players(now: number): 1 | 2;
}

export function createDuoCamera(): DuoCamera {
  const seating = createSeating();
  let on = false;
  let second: PoseFrame | null = null;
  let firstSeen: PoseFrame | null = null;
  return {
    setOn(next) {
      if (next === on) return;
      on = next;
      second = null;
      firstSeen = null;
      seating.reset();
    },
    on: () => on,
    wanted: () => (on ? 2 : 1),
    take(bodies, t) {
      const seats = seating.next(bodies, t);
      if (seats.second) second = seats.second;
      firstSeen = seats.firstSeen;
      return seats.first;
    },
    seen: (frame) => (on && firstSeen && firstSeen.t === frame.t ? firstSeen : frame),
    second: (now) => (on && second && now - second.t < LEAVE_MS ? second : null),
    players: (now) => (on ? seating.players(now) : 1),
  };
}

/** The page's one camera has one of these, as it has one tracker. */
export const duoCamera = createDuoCamera();
