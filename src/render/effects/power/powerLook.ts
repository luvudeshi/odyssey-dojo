// The layers every power shares and PowerStrike drives: the point light that lights the cave, the thin screen tint
// or flash, and the camera shake. Pure functions of the clock, so they are tested without a browser.
import type { GodId } from "../../../ai/gods/gods";
import { POWER_SPAN, bump, clamp01, easeIn, smooth } from "./powerTiming";
import type { PowerClock } from "./powerTiming";

export interface Rgb { r: number; g: number; b: number }

/** Light and glow colour per god (0..1 linear-ish). */
export const POWER_COLOR: Readonly<Record<GodId, Rgb>> = {
  zeus: { r: 0.62, g: 0.74, b: 1 },
  poseidon: { r: 0.2, g: 0.85, b: 0.8 },
  athena: { r: 1, g: 0.78, b: 0.3 },
  hermes: { r: 0.55, g: 1, b: 0.7 },
  artemis: { r: 0.78, g: 0.86, b: 1 },
  apollo: { r: 1, g: 0.62, b: 0.2 },
};

/** Where the light sits between the hero (0) and the weak spot (1). */
export function lightTravel(god: GodId, c: PowerClock): number {
  if (god === "poseidon" || god === "athena") return easeIn(c.strike);
  if (god === "hermes") return c.phase === "windup" ? 0 : 1;
  return 1;
}

/** Point light intensity: a build in the wind-up, a spike at the hit, then a fade. */
export function lightLevel(god: GodId, c: PowerClock): number {
  if (c.phase === "idle") return 0;
  const hit = c.phase === "aftermath" ? (1 - c.after) ** 2 : 0;
  const build = c.phase === "windup" ? 0.15 * c.wind : 0.15 + 0.35 * c.strike;
  switch (god) {
    case "zeus": return c.phase === "aftermath" ? 160 * hit * (0.6 + 0.4 * Math.sin(c.t * 90) ** 2) : 6 * c.wind;
    case "poseidon": return 26 * (c.phase === "aftermath" ? 0.4 + 0.6 * hit : build * 1.4);
    case "athena": return 40 * (c.phase === "aftermath" ? hit : build);
    case "hermes": return 30 * (c.phase === "aftermath" ? hit : 0.25 * c.wind);
    case "artemis": return 32 * (c.phase === "aftermath" ? hit : build);
    case "apollo": return 70 * (c.phase === "aftermath" ? 0.25 + 0.75 * hit : build * 1.5);
  }
}

/** The thin layer over the canvas. Alpha 0 means leave it hidden. */
export function screenLayer(god: GodId, c: PowerClock, out: Rgb & { a: number }): void {
  out.a = 0;
  if (c.phase === "idle") return;
  const span = POWER_SPAN[god];
  switch (god) {
    case "zeus": {
      // The sky darkens through the wind-up, a white flash on the hit, then the dark lets go.
      const flash = c.t >= span.hit ? (1 - clamp01((c.t - span.hit) / 0.22)) ** 2 : 0;
      const dark = c.phase === "aftermath" ? 0.5 * (1 - smooth(c.after * 1.6)) : 0.5 * smooth(c.t / 0.28);
      if (flash > 0.01) { out.r = 0.92; out.g = 0.95; out.b = 1; out.a = 0.6 * flash; } else { out.r = 0.01; out.g = 0.02; out.b = 0.09; out.a = dark; }
      return;
    }
    case "poseidon": out.r = 0.02; out.g = 0.35; out.b = 0.4; out.a = 0.3 * bump(c.t, 0.1, span.total); return;
    case "athena": out.r = 1; out.g = 0.85; out.b = 0.45; out.a = 0.45 * bump(c.t, span.hit - 0.04, span.hit + 0.26); return;
    case "hermes": out.r = 0.8; out.g = 1; out.b = 0.9; out.a = 0.3 * bump(c.t, span.hit - 0.03, span.hit + 0.12); return;
    case "artemis": {
      const night = 0.32 * bump(c.t, 0, span.total);
      const flash = 0.5 * bump(c.t, span.hit - 0.03, span.hit + 0.24);
      if (flash > night) { out.r = 0.9; out.g = 0.95; out.b = 1; out.a = flash; } else { out.r = 0.02; out.g = 0.04; out.b = 0.16; out.a = night; }
      return;
    }
    case "apollo": out.r = 1; out.g = 0.7; out.b = 0.3; out.a = 0.55 * bump(c.t, span.hit - 0.1, span.hit + 0.6); return;
  }
}

const SHAKE: Readonly<Record<GodId, { amp: number; hold: number }>> = {
  zeus: { amp: 0.34, hold: 0.45 },
  poseidon: { amp: 0.22, hold: 0.4 },
  athena: { amp: 0.26, hold: 0.35 },
  hermes: { amp: 0.1, hold: 0.14 },
  artemis: { amp: 0.14, hold: 0.28 },
  apollo: { amp: 0.2, hold: 0.7 },
};

/** Camera shake amplitude in world units for `since` seconds after the hit (0 before it). */
export function shakeAmount(god: GodId, since: number): number {
  if (!(since >= 0)) return 0;
  const s = SHAKE[god];
  return since >= s.hold ? 0 : s.amp * (1 - since / s.hold) ** 2;
}

/** The soft glow on the monster that stands in for all of this under reduced motion: it only fades in, then out. */
export function calmGlow(god: GodId, c: PowerClock): number {
  if (c.phase === "idle") return 0;
  return bump(c.t, 0, POWER_SPAN[god].total);
}
