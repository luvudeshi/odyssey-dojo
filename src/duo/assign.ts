// Two players on one camera: who sits in which seat, and whether one or two people are playing.
// Which body is which is decided by src/pose/players.ts (PR #99): screen left of a fresh pair is player one, and
// after that each body goes to the player it moved least from. This adds what a fight needs on top of it:
// bodies that cannot be played are dropped, the second player counts only once they have stood steady, they stop
// counting once they have been gone a while, and if the hero walks out the player who stayed becomes the hero.
// Someone standing well behind the hero (a spectator) is never let in as the second player.
//
// "Left" is left in the mirrored picture the game shows (PoseFrame.image), which is also the left of the room as
// the players see it: the person standing on the left is player one, the hero.
import type { PoseFrame } from "../core/types";
import { NO_PLAYERS, assignPlayers } from "../pose/players";
import type { PlayerAssignment } from "../pose/players";
import { JOINT, joint } from "../pose/signals";
import { homeOf, rebase } from "./split";
import type { Body, Home } from "./split";

/** Shoulders less sure than this are not a body the game can play. The same level presence uses. */
const MIN_VISIBILITY = 0.5;
/** Shoulders narrower than this share of the picture belong to someone in the background. */
export const MIN_SHOULDERS = 0.06;
/** Two bodies whose middles are nearer than this many shoulder widths are one person the tracker found twice. */
const SAME_PERSON = 0.6;
/** The second player joins after standing in the picture this long without a break. */
export const JOIN_MS = 1000;
/**
 * The second player joins only with shoulders at least this share of the hero's. Someone smaller stands well behind
 * the hero (at 0.6, more than one and a half times as far from the camera): a spectator, who would cost the player
 * every defend, since a defend counts only when both make it. It is asked only at the join: a player who is in stays in.
 */
export const BEHIND = 0.6;
/**
 * The shoulder width the join compares is each seat's widest, let down by this much with every picture. Turning the
 * body in a punch makes the shoulders narrow for a moment; the widest of the last second or so does not move with it.
 */
const WIDTH_HOLD = 0.98;
/** A second player not seen for this long has left; until then a few lost frames change nothing. */
export const LEAVE_MS = 700;
/**
 * No picture at all for this long (the camera or the tracker stopped): the count falls back to one player. It is
 * longer than LEAVE_MS on purpose. A hitch of most of a second in the pictures is not player two walking out, and
 * for that moment the fight must not let player one defend for both or take player two's stance again.
 */
export const STOPPED_MS = 1500;
/** Not seen for this long, the second player's steady time starts again. */
const BREAK_MS = 250;
/** The hero not seen for this long, with the other player still there: the other player becomes the hero. */
export const PROMOTE_MS = 400;
/** A seat's home is the average of its first frames. */
const HOME_FRAMES = 15;

export interface Seats {
  /** Player one, the hero: what the fight reads as its one player. */
  readonly first: PoseFrame | null;
  /**
   * Player one's frame as it is in the camera's picture. The same as `first`, except after player two took the
   * hero's place: `first` is then moved to where the hero stood, and this is where the player really stands.
   */
  readonly firstSeen: PoseFrame | null;
  /** Player two's body, as soon as it is seen (also before they count as joined). */
  readonly second: PoseFrame | null;
  /** 2 only while a second player has joined and has not left. */
  readonly players: 1 | 2;
}

export interface Seating {
  /** Give it every body found in one picture and the picture's time in milliseconds. */
  next(bodies: readonly Body[], t: number): Seats;
  /** How many are playing at time `now`; falls to 1 by itself when frames stop coming. */
  players(now: number): 1 | 2;
  reset(): void;
}

function usable(body: Body): boolean {
  const left = joint(body.image, JOINT.leftShoulder);
  const right = joint(body.image, JOINT.rightShoulder);
  if (left.visibility < MIN_VISIBILITY || right.visibility < MIN_VISIBILITY) return false;
  return homeOf(body.image).w >= MIN_SHOULDERS;
}

/** Drops the smaller of two bodies that are really one person. */
function distinct(bodies: readonly Body[]): Body[] {
  const sized = bodies.map((body) => ({ body, home: homeOf(body.image) })).sort((a, b) => b.home.w - a.home.w);
  const kept: typeof sized = [];
  for (const next of sized) {
    const twin = kept.some((big) => Math.hypot(big.home.x - next.home.x, big.home.y - next.home.y) < SAME_PERSON * big.home.w);
    if (!twin) kept.push(next);
  }
  return kept.map((entry) => entry.body);
}

interface Average {
  x: number;
  y: number;
  w: number;
  n: number;
}

function add(average: Average | null, home: Home): Average {
  if (!average) return { ...home, n: 1 };
  if (average.n >= HOME_FRAMES) return average;
  const n = average.n + 1;
  return { x: average.x + (home.x - average.x) / n, y: average.y + (home.y - average.y) / n, w: average.w + (home.w - average.w) / n, n };
}

export function createSeating(): Seating {
  let assignment: PlayerAssignment = NO_PLAYERS;
  let homes: [Average | null, Average | null] = [null, null];
  /** Set when player two took the hero's place: their picture is moved from where they stand to where the hero stood. */
  let moved: { from: Home; to: Home } | null = null;
  /** How wide each seat's shoulders are, as it stands in the picture: see WIDTH_HOLD. */
  let wide: [number, number] = [0, 0];
  let firstSeenAt = -Infinity;
  let secondSeenAt = -Infinity;
  let steadyFrom = Infinity;
  let two = false;
  /** The time of the newest picture, whoever was in it. */
  let lastT = -Infinity;

  const frameOf = (body: Body | undefined, t: number): PoseFrame | null => (body ? { t, image: body.image, world: body.world } : null);

  return {
    next(found, t) {
      lastT = t;
      const bodies = distinct(found.filter(usable));
      assignment = assignPlayers(bodies.map((body) => body.image), t, assignment);
      let [zero, one] = assignment.bodies;
      if (zero !== null) firstSeenAt = t;
      else if (one !== null && t - firstSeenAt >= PROMOTE_MS) {
        // The hero left and the other player stayed: they take the first seat, drawn where the hero stood, so the
        // fight (and the stance it measured for the hero) carries on without a pause.
        const from = homes[1] ?? homeOf(bodies[one]?.image ?? []);
        const to = moved?.to ?? homes[0];
        moved = to ? { from, to } : null;
        homes = [homes[0], null];
        wide = [wide[1], 0];
        assignment = { bodies: [one, null], memory: [assignment.memory[1], null] };
        [zero, one] = assignment.bodies;
        firstSeenAt = t;
        two = false;
        secondSeenAt = -Infinity;
        steadyFrom = Infinity;
      }
      const firstBody = zero === null ? undefined : bodies[zero];
      const secondBody = one === null ? undefined : bodies[one];
      if (firstBody && !moved) homes[0] = add(homes[0], homeOf(firstBody.image));
      if (firstBody) wide[0] = Math.max(homeOf(firstBody.image).w, wide[0] * WIDTH_HOLD);
      if (secondBody) {
        homes[1] = add(homes[1], homeOf(secondBody.image));
        if (t - secondSeenAt > BREAK_MS) {
          steadyFrom = t;
          wide[1] = 0;
        }
        secondSeenAt = t;
        wide[1] = Math.max(homeOf(secondBody.image).w, wide[1] * WIDTH_HOLD);
        if (t - steadyFrom >= JOIN_MS && wide[1] >= BEHIND * wide[0]) two = true;
      } else if (t - secondSeenAt >= LEAVE_MS) {
        two = false;
        homes[1] = null;
        wide[1] = 0;
      }
      const raw = frameOf(firstBody, t);
      return {
        first: raw && moved ? rebase(raw, moved.from, moved.to) : raw,
        firstSeen: raw,
        second: frameOf(secondBody, t),
        players: two ? 2 : 1,
      };
    },
    // While pictures keep coming, `next` has already said whether player two left. This only covers pictures stopping.
    players: (now) => (two && now - lastT < STOPPED_MS ? 2 : 1),
    reset() {
      assignment = NO_PLAYERS;
      homes = [null, null];
      moved = null;
      wide = [0, 0];
      firstSeenAt = -Infinity;
      secondSeenAt = -Infinity;
      steadyFrom = Infinity;
      two = false;
      lastT = -Infinity;
    },
  };
}
