// Turns one PoseFrame into what the hero's skeleton should do: a scene direction per limb segment, a full orientation
// for the pelvis, chest and head, and how far the body has stepped and sunk. Pure apart from its own filter state.
import { Quaternion, Vector3 } from "three";
import type { PoseFrame } from "../../../core/types";
import { OneEuro } from "./filter";
import { LIMBS } from "./boneMap";
import type { LimbKey } from "./boneMap";
import { clampAngle, frameFromXY, frameFromXZ, segmentDir, toScene, UP } from "./math";

/** Under this a landmark is a guess: its limb eases back to the clip instead. */
export const MIN_VISIBILITY = 0.5;
const USED = [0, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28] as const;
/** Elbows and knees do not fold further than this (radians between the two bones). */
const MAX_FOLD = 2.6;
/** The spine does not lean further than this from upright. */
const MAX_LEAN = 1.05;
const MAX_HEAD_TURN = 1.2;
/** MediaPipe's nose sits a little below the ear line; tip the head up by this much so a level head reads level. */
const HEAD_PITCH_BIAS = 0.3;
const PELVIS_FOLLOWS_SPINE = 0.35;
/** The image is 4:3, so one unit up the picture is 3/4 of one unit across it. */
const ASPECT = 4 / 3;
const CALIBRATE_SECONDS = 1;
const MAX_DROP = 0.6;
const DROP_DEADZONE = 0.03;
const STEP_DEADZONE = 0.04;
/** Tracked steps stay inside the arena. */
export const STEP_LIMIT = 1;

/** The One Euro settings for every landmark coordinate (metres, hip-centred world space). Picked by sweeping recorded webcam poses: the old 2.5 Hz / beta 0.9 lagged a punch by about 30 ms
 * and was 12 degrees off during fast moves; these keep the same calm at rest and are about 7 degrees off. */
export const LANDMARK_FILTER = { minCutoff: 1, beta: 5, dCutoff: 1 };

const HEAD_BIAS = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), HEAD_PITCH_BIAS);

interface Calibration {
  n: number;
  startMs: number;
  hipX: number;
  shoulderY: number;
  perMetre: number;
  worldShoulderY: number;
  done: boolean;
}

export class PoseTargets {
  readonly dir = {} as Record<LimbKey, Vector3>;
  readonly dirOk = {} as Record<LimbKey, boolean>;
  readonly chest = new Quaternion();
  readonly pelvis = new Quaternion();
  readonly head = new Quaternion();
  torsoOk = false;
  legsSeen = false;
  /** Metres the body has stepped to the player's right, and sunk, against the first second of tracking. */
  step = 0;
  drop = 0;
  calibrated = false;

  private readonly xyz: OneEuro[];
  private readonly seen: boolean[] = new Array<boolean>(33).fill(false);
  private readonly stepFilter = new OneEuro(1.2, 0.2);
  private readonly dropFilter = new OneEuro(1.2, 0.2);
  private readonly p = Array.from({ length: 33 }, () => new Vector3());
  private readonly vis: number[] = new Array<number>(33).fill(0);
  private readonly a = new Vector3();
  private readonly b = new Vector3();
  private readonly c = new Vector3();
  private readonly q = new Quaternion();
  private cal: Calibration = { n: 0, startMs: NaN, hipX: 0, shoulderY: 0, perMetre: 0, worldShoulderY: 0, done: false };

  constructor(landmarkFilter: { minCutoff: number; beta: number; dCutoff: number } = LANDMARK_FILTER) {
    this.xyz = Array.from({ length: 33 * 3 }, () => new OneEuro(landmarkFilter.minCutoff, landmarkFilter.beta, landmarkFilter.dCutoff));
    for (const l of LIMBS) { this.dir[l.key] = new Vector3(0, -1, 0); this.dirOk[l.key] = false; }
  }

  /** Forget the calibration (the player left the picture for a while). */
  recalibrate(): void {
    this.cal = { n: 0, startMs: NaN, hipX: 0, shoulderY: 0, perMetre: 0, worldShoulderY: 0, done: false };
    this.calibrated = false;
    this.step = 0;
    this.drop = 0;
  }

  private ok(i: number): boolean {
    return (this.vis[i] ?? 0) >= MIN_VISIBILITY;
  }

  ingest(frame: PoseFrame): void {
    const t = frame.t / 1000;
    for (const i of USED) {
      const w = frame.world[i];
      const v = w?.visibility ?? 0;
      this.vis[i] = Number.isFinite(v) ? v : 0;
      if (!w || !Number.isFinite(w.x + w.y + w.z) || !this.ok(i)) { this.seen[i] = false; for (let k = 0; k < 3; k++) this.xyz[i * 3 + k]?.reset(); continue; }
      this.seen[i] = true;
      const f = (k: number, value: number): number => this.xyz[i * 3 + k]?.filter(value, t) ?? value;
      toScene({ x: f(0, w.x), y: f(1, w.y), z: f(2, w.z) }, this.p[i] ?? this.a);
    }
    this.limbs();
    this.torso();
    this.stepAndDrop(frame, t);
  }

  private pt(i: number): Vector3 {
    return this.p[i] ?? this.a;
  }

  private limbs(): void {
    let legs = true;
    for (const l of LIMBS) {
      const ok = !!this.seen[l.from] && !!this.seen[l.to] && segmentDir(this.fromLandmark(l.from), this.fromLandmark(l.to), this.dir[l.key]);
      this.dirOk[l.key] = ok;
      if (l.key.startsWith("thigh") || l.key.startsWith("calf")) legs &&= ok;
    }
    this.legsSeen = legs;
    for (const l of LIMBS) {
      const parent = l.bendOf;
      if (this.dirOk[l.key] && parent && this.dirOk[parent]) clampAngle(this.dir[l.key], this.dir[parent], MAX_FOLD);
    }
  }

  /** The filtered point as a landmark (y down) so segmentDir's own flip lands in scene axes. */
  private fromLandmark(i: number): { x: number; y: number; z: number } {
    const s = this.pt(i);
    return { x: s.x, y: -s.y, z: s.z };
  }

  private torso(): void {
    this.torsoOk = false;
    if (!(this.ok(11) && this.ok(12))) return;
    const hips = this.ok(23) && this.ok(24);
    const up = this.a.addVectors(this.pt(11), this.pt(12)).multiplyScalar(0.5);
    if (hips) up.sub(this.b.addVectors(this.pt(23), this.pt(24)).multiplyScalar(0.5));
    if (up.lengthSq() < 0.01) return;
    up.normalize();
    clampAngle(up, UP, MAX_LEAN);
    const shoulderX = this.b.subVectors(this.pt(12), this.pt(11));
    // The hips are out of the picture: the world origin is the hip centre by definition, so the pelvis follows the shoulder line.
    const hipX = hips ? this.c.subVectors(this.pt(24), this.pt(23)) : shoulderX;
    if (!frameFromXY(shoulderX, up, this.chest)) return;
    const lean = this.a.copy(UP).lerp(up, PELVIS_FOLLOWS_SPINE);
    if (!frameFromXY(hipX, lean, this.pelvis)) return;
    this.torsoOk = true;
    this.head.copy(this.chest);
    if (this.ok(0) && this.ok(7) && this.ok(8)) {
      const earLine = this.b.subVectors(this.pt(8), this.pt(7));
      const face = this.c.copy(this.pt(0)).sub(this.a.addVectors(this.pt(7), this.pt(8)).multiplyScalar(0.5)).negate();
      if (frameFromXZ(earLine, face, this.q)) {
        this.q.multiply(HEAD_BIAS);
        this.head.copy(this.chest).rotateTowards(this.q, MAX_HEAD_TURN);
      }
    }
  }

  private stepAndDrop(frame: PoseFrame, t: number): void {
    const l = frame.image[11];
    const r = frame.image[12];
    if (!this.torsoOk || !l || !r) return;
    const worldWidth = this.pt(12).distanceTo(this.pt(11));
    const perMetre = Math.abs(r.x - l.x) / worldWidth;
    if (!Number.isFinite(perMetre) || perMetre < 0.1) return;
    const midX = (l.x + r.x) / 2;
    const midY = (l.y + r.y) / 2;
    const worldMid = (this.pt(11).x + this.pt(12).x) / 2;
    // Shoulders drift sideways when the body leans; take the lean out so only the hips' own travel is left.
    const hipX = midX - worldMid * perMetre;
    // MediaPipe's y points down: the shoulder line's height below the hips.
    const worldShoulderY = -(this.pt(11).y + this.pt(12).y) / 2;
    const cal = this.cal;
    if (!cal.done) {
      if (!Number.isFinite(cal.startMs)) cal.startMs = frame.t;
      cal.n += 1;
      cal.hipX += (hipX - cal.hipX) / cal.n;
      cal.shoulderY += (midY - cal.shoulderY) / cal.n;
      cal.perMetre += (perMetre - cal.perMetre) / cal.n;
      cal.worldShoulderY += (worldShoulderY - cal.worldShoulderY) / cal.n;
      if (frame.t - cal.startMs >= CALIBRATE_SECONDS * 1000 && cal.n >= 5) { cal.done = true; this.calibrated = true; }
      return;
    }
    const stepRaw = (hipX - cal.hipX) / cal.perMetre;
    // The shoulders also sink when the body leans forward; the world term takes that out, leaving the hips' own drop.
    const dropRaw = (midY - cal.shoulderY) / (cal.perMetre * ASPECT) - (worldShoulderY - cal.worldShoulderY);
    const soft = (v: number, dead: number): number => Math.sign(v) * Math.max(0, Math.abs(v) - dead);
    this.step = Math.max(-STEP_LIMIT, Math.min(STEP_LIMIT, soft(this.stepFilter.filter(stepRaw, t), STEP_DEADZONE)));
    this.drop = Math.max(0, Math.min(MAX_DROP, soft(this.dropFilter.filter(dropRaw, t), DROP_DEADZONE)));
  }
}
