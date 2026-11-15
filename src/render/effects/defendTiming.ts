// Timing for the guard shield and the defend bursts. Pure, so it is tested without a browser.
export const SHIELD_UP_S = 0.12;
export const SHIELD_DOWN_S = 0.15;
/** How long a burst for a counted defend lasts, and how long the shield's block flash lasts. */
export const BURST_S = 0.55;

/** Decelerating 0 -> 1: fast at first, settling at the end. */
export function easeOut(t: number): number {
  const k = 1 - Math.min(1, Math.max(0, t));
  return 1 - k * k * k;
}

/** A burst's brightness over its progress `p`: eases in over the first tenth (no pop), then fades out smoothly. 0 at both ends. */
export function burstFade(p: number): number {
  if (p <= 0 || p >= 1) return 0;
  const k = Math.min(1, p / 0.1);
  return k * k * (3 - 2 * k) * (1 - p) * (1 - p);
}

/** Which of the dodge versions to draw: ?burst=a, b or c; anything else is a. */
export function burstVariant(search: string): "a" | "b" | "c" {
  const v = new URLSearchParams(search).get("burst");
  return v === "b" || v === "c" ? v : "a";
}

/** Moves the shield's 0..1 size toward up (held) or down (dropped): about 120 ms to rise, 150 ms to leave. */
export function stepShield(level: number, held: boolean, dt: number): number {
  return held ? Math.min(1, level + dt / SHIELD_UP_S) : Math.max(0, level - dt / SHIELD_DOWN_S);
}

/** Pop-in that overshoots a little before settling, so the shield snaps up. 0 -> 1. */
export function shieldScale(level: number): number {
  const t = Math.min(1, Math.max(0, level));
  return t * (1 + 0.18 * Math.sin(t * Math.PI));
}

export type BurstKind = "block" | "dodge" | "duck" | "jump";

/** Which burst a counted defend draws; null for a move with no burst. */
export function burstKind(move: string): BurstKind | null {
  if (move === "block") return "block";
  if (move === "dodge_left" || move === "dodge_right") return "dodge";
  if (move === "duck" || move === "jump") return move;
  return null;
}

/** 0 at the moment the defend counts, 1 when the burst is over; 1 if none has counted. */
export function burstProgress(now: number, at: number): number {
  return now < at ? 1 : Math.min(1, (now - at) / BURST_S);
}
