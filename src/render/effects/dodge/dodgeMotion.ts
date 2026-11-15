// The dodge, as numbers. Pure (no three.js), so it is tested without a browser. A spring carries the hero sideways and
// back, so he gets anticipation (a small step the other way), real travel, an overshoot and a settle for free. The
// fight store says when a dodge is held or counted; this turns that into where he is, how he leans and how low he sits.
// Four looks, picked with ?dodge=1..4 (no parameter keeps the old slide). Nothing here touches a combat rule or timing.
import type { DefendSeen } from "../../../hud/DefendFlash";

export type DodgeVariant = 0 | 1 | 2 | 3 | 4;

/** Which look to draw: ?dodge=1, 2, 3 or 4; anything else is today's. */
export function dodgeVariant(search: string): DodgeVariant {
  const v = Number(new URLSearchParams(search).get("dodge"));
  return v === 1 || v === 2 || v === 3 || v === 4 ? v : 0;
}

export interface DodgeLook {
  /** Metres to the side he ends up at. */
  readonly dist: number;
  /** Spring stiffness (rad/s squared) and damping ratio: below 1 it overshoots, and how far. */
  readonly stiff: number;
  readonly zeta: number;
  /** The step the other way first: metres and seconds. */
  readonly antic: number;
  readonly anticS: number;
  /** Radians he leans into the move at full travel. */
  readonly lean: number;
  /** 0..1 how far the pelvis drops. */
  readonly crouch: number;
  /** A full sideways roll while he travels. */
  readonly roll: boolean;
  /** How much the body stretches along the move at top speed (0.14 is 14%). */
  readonly stretch: number;
  /** Seconds he stays out after the blow has passed, so the miss is seen. */
  readonly hold: number;
  /** Share of the travel kept on webcam play, where the tracked body already moves him. */
  readonly share: number;
}

export const LOOKS: Readonly<Record<1 | 2 | 3 | 4, DodgeLook>> = {
  1: { dist: 1.25, stiff: 420, zeta: 0.55, antic: 0.16, anticS: 0.07, lean: 0.3, crouch: 0.35, roll: false, stretch: 0, hold: 0.3, share: 0.55 },
  2: { dist: 1.7, stiff: 650, zeta: 0.8, antic: 0.1, anticS: 0.05, lean: 0.5, crouch: 0.9, roll: false, stretch: 0, hold: 0.22, share: 0.55 },
  3: { dist: 1.5, stiff: 300, zeta: 0.7, antic: 0.12, anticS: 0.06, lean: 0.12, crouch: 0.75, roll: true, stretch: 0, hold: 0.3, share: 0.55 },
  4: { dist: 1.9, stiff: 1100, zeta: 0.9, antic: 0.05, anticS: 0.04, lean: 0.22, crouch: 0.3, roll: false, stretch: 0.14, hold: 0.45, share: 0.55 },
};

/** The body turns about this height, so a lean keeps the feet near the floor and a roll turns about his middle. */
export const PIVOT_Y = 0.6;
const ROLL_SECONDS = 0.42;
const TRAIL_SIZE = 40;
const STEP = 1 / 120;

export interface DodgeState {
  /** The variant in force this frame; 0 means the old look is drawing and nothing here is read. */
  variant: DodgeVariant;
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
  /** 1 at rest, more at speed (a stretch along x). */
  stretch: number;
  /** Rotation of the whole body about z, radians (lean plus roll). */
  tiltZ: number;
  rollT: number;
  rolling: boolean;
  rollDir: -1 | 1;
  /** When the blow he dodged last passed him (the defend phase ended on a counted dodge). -Infinity before the first. */
  missAt: number;
  /** When he last went out. */
  outAt: number;
  /** 0..1 camera push, up while the blow passes. */
  push: number;
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
    variant: 0, x: 0, vx: 0, dir: 1, out: false, anticUntil: -Infinity, holdUntil: -Infinity, lean: 0, crouch: 0, stretch: 1, tiltZ: 0,
    rollT: 0, rolling: false, rollDir: 1, missAt: -Infinity, outAt: -Infinity, push: 0, share: 1, prevKind: "", defendStart: -Infinity, trail: new Trail(),
  };
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const smooth = (t: number): number => { const k = clamp(t, 0, 1); return k * k * (3 - 2 * k); };

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
  if (!look) { s.variant = 0; return; }

  const want = wantDir(s, input);
  if (want !== 0 && (!s.out || want !== s.dir)) {
    s.out = true;
    s.dir = want;
    s.outAt = now;
    s.anticUntil = now + look.anticS;
    if (look.roll) { s.rolling = true; s.rollT = 0; s.rollDir = want; }
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
  s.stretch = 1 + look.stretch * clamp(Math.abs(s.vx) / (reach * 7), 0, 1);
  if (s.rolling) {
    s.rollT += input.dt / ROLL_SECONDS;
    if (s.rollT >= 1) { s.rollT = 1; s.rolling = false; }
  } else if (!s.out && Math.abs(s.x) < 0.03) s.rollT = 0;
  // Rolling toward +x turns the head toward +x, which is a negative turn about z (see tiltZ below).
  s.tiltZ = -s.lean - (look.roll ? s.rollDir * 2 * Math.PI * smooth(s.rollT) : 0);
  const since = now - s.missAt;
  const pushTo = look === LOOKS[4] ? (since >= 0 && since < 0.6 ? 1 : s.out ? 0.35 : 0) : 0;
  s.push += (pushTo - s.push) * (1 - Math.exp(-(pushTo > s.push ? 14 : 6) * input.dt));
  s.variant = look === LOOKS[1] ? 1 : look === LOOKS[2] ? 2 : look === LOOKS[3] ? 3 : 4;
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
