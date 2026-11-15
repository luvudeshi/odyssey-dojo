// The dodge, as numbers. Pure (no three.js), so it is tested without a browser. A spring carries the hero sideways and
// back, so he gets anticipation (a small step the other way), real travel, an overshoot and a settle for free. The
// fight store says when a dodge is held or counted; this turns that into where he is, how he leans and how low he sits.
// A low dash: he drops into a crouch, leans and dips a shoulder into the move (never more than a quarter turn), and is
// back on his mark soon after the blow has passed. Nothing here touches a combat rule or timing.
import type { DefendSeen } from "../../../hud/DefendFlash";

export interface DodgeLook {
  /** Metres to the side he ends up at. */
  readonly dist: number;
  /** Spring stiffness (rad/s squared) and damping ratio: below 1 it overshoots, and how far. */
  readonly stiff: number;
  readonly zeta: number;
  /** The step the other way first: metres and seconds. */
  readonly antic: number;
  readonly anticS: number;
  /** Radians he leans and dips a shoulder into the move at full travel. A quarter turn is 1.57; keep it well under. */
  readonly lean: number;
  /** 0..1 how far the pelvis drops. */
  readonly crouch: number;
  /** Seconds he stays out after the blow has passed, so the miss is seen. */
  readonly hold: number;
  /** Share of the travel kept on webcam play, where the tracked body already moves him. */
  readonly share: number;
}

/** The numbers to nudge. */
export const LOOK: DodgeLook = { dist: 1.6, stiff: 650, zeta: 0.8, antic: 0.1, anticS: 0.05, lean: 0.5, crouch: 0.85, hold: 0.22, share: 0.55 };

/** The body turns about this height, so a lean keeps the feet near the floor. */
export const PIVOT_Y = 0.6;
const TRAIL_SIZE = 40;
const STEP = 1 / 120;

export interface DodgeState {
  /** The dodge look is in force this frame (false with reduced motion, when the old slide stays). */
  active: boolean;
  x: number;
  vx: number;
  /** -1 left, 1 right: the last way he went. */
  dir: -1 | 1;
  out: boolean;
  anticUntil: number;
  holdUntil: number;
  /** Radians, positive = head toward +x. */
  lean: number;
  crouch: number;
  /** Rotation of the whole body about z, radians. */
  tiltZ: number;
  /** When the blow he dodged last passed him (the defend phase ended on a counted dodge). -Infinity before the first. */
  missAt: number;
  /** When he last went out. */
  outAt: number;
  share: number;
  prevKind: DefendSeen["kind"] | "";
  defendStart: number;
  trail: Trail;
}

export interface DodgeInput {
  readonly now: number;
  readonly dt: number;
  readonly held: ReadonlySet<string>;
  readonly seen: DefendSeen;
  readonly defendedAt: number;
  readonly defendedMove: string;
  /** The webcam is driving his body. */
  readonly live: boolean;
}

export function newDodge(): DodgeState {
  return {
    active: false, x: 0, vx: 0, dir: 1, out: false, anticUntil: -Infinity, holdUntil: -Infinity, lean: 0, crouch: 0, tiltZ: 0,
    missAt: -Infinity, outAt: -Infinity, share: 1, prevKind: "", defendStart: -Infinity, trail: new Trail(),
  };
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Which way the fight wants him out right now: 0 stay, else -1 or 1. A dodge made while the blow winds up keeps him out until it passes. */
export function wantDir(s: DodgeState, input: DodgeInput): -1 | 0 | 1 {
  const { seen, held, now } = input;
  if (seen.kind === "defend" && seen.met && (seen.counter === "dodge_left" || seen.counter === "dodge_right")) return seen.counter === "dodge_left" ? -1 : 1;
  // The strike card ends a held dodge: he is back on his mark for it.
  if (seen.kind !== "strike") {
    if (held.has("dodge_left")) return -1;
    if (held.has("dodge_right")) return 1;
  }
  return now < s.holdUntil ? s.dir : 0;
}

/** Moves the dodge on by `input.dt` and fills the store. `look` is null when the old look is in force. */
export function stepDodge(s: DodgeState, look: DodgeLook | null, input: DodgeInput): void {
  const { now, seen } = input;
  if (seen.kind === "defend" && s.prevKind !== "defend") s.defendStart = now;
  const counted = input.defendedMove === "dodge_left" || input.defendedMove === "dodge_right";
  // The blow has just passed: the defend phase ended on a dodge that counted inside it.
  if (s.prevKind === "defend" && seen.kind !== "defend" && counted && input.defendedAt >= s.defendStart - 0.05) {
    s.missAt = now;
    if (look) s.holdUntil = now + look.hold;
  }
  s.prevKind = seen.kind;
  if (!look) { s.active = false; return; }

  const want = wantDir(s, input);
  if (want !== 0 && (!s.out || want !== s.dir)) {
    s.out = true;
    s.dir = want;
    s.outAt = now;
    s.anticUntil = now + look.anticS;
  } else if (want === 0) s.out = false;

  s.share = input.live ? look.share : 1;
  const reach = look.dist * s.share;
  const away = s.out ? (now < s.anticUntil ? -s.dir * look.antic * s.share : s.dir * reach) : 0;
  const damping = 2 * look.zeta * Math.sqrt(look.stiff);
  for (let left = Math.min(input.dt, 0.05); left > 0; left -= STEP) {
    const h = Math.min(STEP, left);
    s.vx += (look.stiff * (away - s.x) - damping * s.vx) * h;
    s.x += s.vx * h;
  }

  const u = s.x / reach;
  s.lean = look.lean * (0.7 * u + 0.3 * clamp(s.vx / (reach * 6), -1.5, 1.5));
  s.crouch = look.crouch * Math.max(clamp(Math.abs(u) * 1.1, 0, 1), now < s.anticUntil ? 0.5 : 0) * (input.live ? 0.4 : 1);
  s.tiltZ = -s.lean;
  s.active = true;
  s.trail.push(now, s.x, s.tiltZ);
}

/** Where a body point `(lx, ly)` (relative to his feet, facing the camera) is in the scene's x/y once he is turned `theta` about the pivot. */
export function bodyPoint(x: number, theta: number, lx: number, ly: number, out: { x: number; y: number }): { x: number; y: number } {
  const c = Math.cos(theta);
  const sn = Math.sin(theta);
  const rx = lx * c - (ly - PIVOT_Y) * sn;
  const ry = lx * sn + (ly - PIVOT_Y) * c;
  out.x = x + rx;
  out.y = PIVOT_Y + ry;
  return out;
}

/** The shift the hero's group needs so a turn of `theta` happens about the pivot rather than the feet. */
export function pivotShift(theta: number, out: { x: number; y: number }): { x: number; y: number } {
  out.x = PIVOT_Y * Math.sin(theta);
  out.y = PIVOT_Y * (1 - Math.cos(theta));
  return out;
}

/** A short ring of where he was: time, x and turn per frame, so effects can draw him a moment ago. */
export class Trail {
  private readonly t = new Float32Array(TRAIL_SIZE).fill(-Infinity);
  private readonly x = new Float32Array(TRAIL_SIZE);
  private readonly z = new Float32Array(TRAIL_SIZE);
  private head = 0;

  push(now: number, x: number, tilt: number): void {
    this.head = (this.head + 1) % TRAIL_SIZE;
    this.t[this.head] = now;
    this.x[this.head] = x;
    this.z[this.head] = tilt;
  }

  /** His x and turn `ago` seconds before `now`; the oldest sample if the ring does not reach that far. */
  at(now: number, ago: number, out: { x: number; tilt: number }): { x: number; tilt: number } {
    const want = now - ago;
    let i = this.head;
    for (let n = 0; n < TRAIL_SIZE - 1; n++) {
      const prev = (i + TRAIL_SIZE - 1) % TRAIL_SIZE;
      if ((this.t[prev] ?? -Infinity) === -Infinity || (this.t[i] ?? 0) <= want) break;
      if ((this.t[prev] ?? 0) <= want) {
        const span = (this.t[i] ?? 0) - (this.t[prev] ?? 0);
        const k = span > 0 ? (want - (this.t[prev] ?? 0)) / span : 1;
        out.x = (this.x[prev] ?? 0) + ((this.x[i] ?? 0) - (this.x[prev] ?? 0)) * k;
        out.tilt = (this.z[prev] ?? 0) + ((this.z[i] ?? 0) - (this.z[prev] ?? 0)) * k;
        return out;
      }
      i = prev;
    }
    out.x = this.x[i] ?? 0;
    out.tilt = this.z[i] ?? 0;
    return out;
  }
}

/** The one dodge store: written by the hero's figure each frame, read by the hero, the effects and the camera. */
export const dodge: DodgeState = newDodge();
