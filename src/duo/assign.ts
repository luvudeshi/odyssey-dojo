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
import { MEMORY_MS, NO_PLAYERS, assignPlayers } from "../pose/players";
import type { PlayerAssignment, PlayerMemory } from "../pose/players";
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
/**
 * Missing from the pictures for this long, the second player's steady time starts again. A break needs a picture
 * without them: on a loaded laptop the pictures themselves can come most of a second apart, and a player seen in
 * every one of them is standing steady however slow they come.
 */
const BREAK_MS = 250;
/** The hero not seen for this long, with the other player still there: the other player becomes the hero. */
export const PROMOTE_MS = 400;
/**
 * A seat's home is where its body stood for most of this long: the middle value of its place over that time. Not
 * its first frames: the one who pressed the button is at the computer then, close and large, and the friend is
 * still walking in. And not an average: a walk out of the picture or a dodge is over well inside half of it, so the
 * middle value is still where the player stands to fight.
 */
export const HOME_MS = 3000;
/**
 * A lone body this far (share of the picture) from where the hero stood a moment ago, with player two not in the
 * picture, is the whole-picture reader flipping to a newcomer standing close: it is left out, not given the hero's seat.
 */
export const FLIP_JUMP = 0.1;
/** "A moment ago" for FLIP_JUMP. A real step is far less than FLIP_JUMP in this time. */
const FLIP_MS = 250;
/** A lone body nearer than this many shoulder widths to where the hero was last seen may be the hero merged with the other player. */
const MERGE_REACH = 2;
/** The hero missing next to the remaining body for this long has left; sooner it is two people overlapping, who come apart again. */
export const MERGE_PROMOTE_MS = 3000;

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

/** Where one seat's body was in each of its newest pictures, oldest first. */
type Stood = { readonly home: Home; readonly t: number }[];

function note(stood: Stood, home: Home, t: number): void {
  stood.push({ home, t });
  while (stood[0] && t - stood[0].t > HOME_MS) stood.shift();
}

function middle(values: number[]): number {
  values.sort((a, b) => a - b);
  const half = values.length >> 1;
  return values.length % 2 === 1 ? (values[half] ?? 0) : ((values[half - 1] ?? 0) + (values[half] ?? 0)) / 2;
}

/** The seat's home, or null for a seat nobody has sat in. Only asked for at a take-over. */
function homeFrom(stood: Stood): Home | null {
  if (stood.length === 0) return null;
  return { x: middle(stood.map((s) => s.home.x)), y: middle(stood.map((s) => s.home.y)), w: middle(stood.map((s) => s.home.w)) };
}

/** How long the hero must be missing before the body that stayed takes the hero's seat. */
function promoteAfter(stayer: Body | undefined, hero: { home: Home } | null): number {
  if (!stayer || !hero) return PROMOTE_MS;
  const home = homeOf(stayer.image);
  return Math.hypot(home.x - hero.home.x, home.y - hero.home.y) < MERGE_REACH * Math.max(home.w, hero.home.w) ? MERGE_PROMOTE_MS : PROMOTE_MS;
}

export function createSeating(): Seating {
  let assignment: PlayerAssignment = NO_PLAYERS;
  let stood: [Stood, Stood] = [[], []];
  /** Set when player two took the hero's place: their picture is moved from where they stand to where the hero stood. */
  let moved: { from: Home; to: Home } | null = null;
  /** The hero's home as it was when player two joined: a take-over places the one who stayed there, not where the hero walked to. */
  let heroHome: Home | null = null;
  /** Where the hero was in the newest picture that had them. */
  let lastFirst: { home: Home; t: number } | null = null;
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
      const previousT = lastT;
      lastT = t;
      const bodies = distinct(found.filter(usable));
      // The shift belongs to the one body that took the hero's place. Once nobody has been seen for so long that the
      // seats are dealt afresh, whoever sits down next is read where they really stand.
      const forgotten = (memory: PlayerMemory | null): boolean => memory === null || t - memory.t > MEMORY_MS;
      if (moved && forgotten(assignment.memory[0]) && forgotten(assignment.memory[1])) {
        moved = null;
        heroHome = null;
        stood = [[], []];
      }
      // Player two is not in the picture and one body jumps from where the hero was a moment ago: not a step, a flip.
      const jumped = lastFirst && !moved && t - lastFirst.t <= FLIP_MS && bodies.length === 1 && t - secondSeenAt > MEMORY_MS;
      const lone = jumped ? bodies[0] : undefined;
      const flipped = lone !== undefined && lastFirst !== null && Math.hypot(homeOf(lone.image).x - lastFirst.home.x, homeOf(lone.image).y - lastFirst.home.y) > FLIP_JUMP;
      assignment = assignPlayers(flipped ? [] : bodies.map((body) => body.image), t, assignment);
      let [zero, one] = assignment.bodies;
      if (zero !== null) firstSeenAt = t;
      else if (one !== null && t - firstSeenAt >= promoteAfter(bodies[one], lastFirst)) {
        // The hero left and the other player stayed: they take the first seat, drawn where the hero stood, so the
        // fight (and the stance it measured for the hero) carries on without a pause.
        const from = homeFrom(stood[1]) ?? homeOf(bodies[one]?.image ?? []);
        const to = moved?.to ?? heroHome ?? homeFrom(stood[0]);
        moved = to ? { from, to } : null;
        stood = [stood[0], []];
        heroHome = null;
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
      if (firstBody) lastFirst = { home: homeOf(firstBody.image), t };
      if (firstBody && !moved) note(stood[0], homeOf(firstBody.image), t);
      if (firstBody) wide[0] = Math.max(homeOf(firstBody.image).w, wide[0] * WIDTH_HOLD);
      if (secondBody) {
        note(stood[1], homeOf(secondBody.image), t);
        // A break: a picture came without them and they were gone longer than BREAK_MS, or no picture came for as long
        // as it takes the count to fall back to one player (STOPPED_MS).
        const away = t - secondSeenAt;
        const missed = secondSeenAt < previousT;
        if ((missed && away > BREAK_MS) || away >= STOPPED_MS) {
          steadyFrom = t;
          wide[1] = 0;
        }
        secondSeenAt = t;
        wide[1] = Math.max(homeOf(secondBody.image).w, wide[1] * WIDTH_HOLD);
        if (t - steadyFrom >= JOIN_MS && wide[1] >= BEHIND * wide[0]) {
          if (!two && !moved) heroHome = homeFrom(stood[0]);
          two = true;
        }
      } else if (t - secondSeenAt >= LEAVE_MS) {
        two = false;
        stood[1] = [];
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
      stood = [[], []];
      moved = null;
      heroHome = null;
      lastFirst = null;
      wide = [0, 0];
      firstSeenAt = -Infinity;
      secondSeenAt = -Infinity;
      steadyFrom = Infinity;
      two = false;
      lastT = -Infinity;
    },
  };
}
