// Which clip a GLB hero plays. Pure (no three.js), so it is unit-tested alone. The fight store says what happened
// and when; this turns that into a clip name and a position inside it, with stand-ins for clips a model lacks.
import { newDecision } from "../models/clipMap";
import type { ClipDecision } from "../models/clipMap";

export type HeroPose = "idle" | "block" | "duck" | "dodgeLeft" | "dodgeRight" | "punch" | "thrust" | "hurt" | "victory" | "defeat";

/** A clip that is driven by the fight clock instead of playing freely, so its key frame lands on the engine's event. */
export interface Timed {
  /** Wall-clock seconds the whole clip is stretched or squeezed to. */
  readonly seconds: number;
  /** Where in the clip (0..1) the blow connects. Strikes only. */
  readonly hit?: number;
}

export interface HeroRig {
  readonly idle: string;
  /** Clip names to try in order for each pose; the first one the model has is used, else idle. */
  readonly poses: Readonly<Partial<Record<Exclude<HeroPose, "idle">, readonly string[]>>>;
  /** A specific move can use its own clip (falls back to the pose's list when the model lacks it). */
  readonly byMove?: Readonly<Record<string, string>>;
  readonly punch: Timed;
  readonly thrust: Timed;
  readonly hurt: Timed;
  /** Duck has no crouch clip on every model: `hold` freezes a clip at that fraction, `squash` lowers the whole model. */
  readonly duck?: { readonly hold?: number; readonly squash?: number };
}

/** What the fight store knows, as plain numbers: seconds since each event, and what is held. */
export interface HeroInput {
  readonly held: ReadonlySet<string>;
  readonly struckMove: string;
  readonly sinceStrike: number;
  readonly sinceHurt: number;
  readonly won: boolean;
  readonly lost: boolean;
  readonly finisherMove: string | null;
}

/**
 * The clip starts this far before its contact frame, so the blow is thrown in the air and lands as the hero arrives on
 * the weak spot: the same as REACH.out in ../strikeReach.ts (a test holds them together).
 */
export const CONTACT_LEAD = 0.14;
const TWO_HANDED: ReadonlySet<string> = new Set(["stake_thrust", "double_palm", "spear_thrust"]);

export function isThrust(move: string, finisherMove: string | null): boolean {
  return TWO_HANDED.has(move) || move === finisherMove;
}

/** Fraction of the strike clip that plays at the instant of the event. */
export function strikeStart(timed: Timed): number {
  return Math.max(0, (timed.hit ?? 0.4) - CONTACT_LEAD / timed.seconds);
}

/** Seconds the strike pose lasts after the event: from the start fraction to the end of the clip. */
export function strikeWindow(timed: Timed): number {
  return (1 - strikeStart(timed)) * timed.seconds;
}

export function chooseHeroPose(rig: Pick<HeroRig, "punch" | "thrust" | "hurt">, input: HeroInput): HeroPose {
  const strike = isThrust(input.struckMove, input.finisherMove) ? rig.thrust : rig.punch;
  if (input.lost) return "defeat";
  if (input.won && input.sinceStrike >= strikeWindow(strike)) return "victory";
  if (input.sinceHurt < rig.hurt.seconds) return "hurt";
  if (input.held.has("block")) return "block";
  if (input.held.has("duck")) return "duck";
  if (input.held.has("dodge_left")) return "dodgeLeft";
  if (input.held.has("dodge_right")) return "dodgeRight";
  if (input.sinceStrike < strikeWindow(strike)) return isThrust(input.struckMove, input.finisherMove) ? "thrust" : "punch";
  return "idle";
}

const LOOPING: ReadonlySet<HeroPose> = new Set<HeroPose>(["idle", "block", "duck"]);
/** The dodges play faster than authored: a snap aside, not a stroll. */
const SNAPPY: Readonly<Partial<Record<HeroPose, number>>> = { dodgeLeft: 1.7, dodgeRight: 1.7 };

/** Writes the decision into `out`; a pose whose clips are all missing shows idle and never throws. */
export function decideHeroPose(rig: HeroRig, pose: HeroPose, input: HeroInput, available: ReadonlySet<string>, out: ClipDecision = newDecision()): ClipDecision {
  const idle = available.has(rig.idle) ? rig.idle : null;
  const fallback = (): ClipDecision => Object.assign(out, { clip: idle, loop: true, scrub: null, timeScale: 1 });
  if (pose === "idle") return fallback();
  const own = pose === "punch" || pose === "thrust" ? rig.byMove?.[input.struckMove] : undefined;
  const names = own === undefined ? rig.poses[pose] ?? [] : [own, ...(rig.poses[pose] ?? [])];
  const clip = names.find((name) => available.has(name));
  if (clip === undefined) return fallback();
  let scrub: number | null = null;
  if (pose === "punch" || pose === "thrust") {
    const timed = pose === "thrust" ? rig.thrust : rig.punch;
    scrub = Math.min(1, strikeStart(timed) + input.sinceStrike / timed.seconds);
  } else if (pose === "duck") scrub = rig.duck?.hold ?? null;
  else if (pose === "hurt") scrub = Math.min(1, input.sinceHurt / rig.hurt.seconds);
  return Object.assign(out, { clip, loop: LOOPING.has(pose), scrub, timeScale: SNAPPY[pose] ?? 1 });
}
