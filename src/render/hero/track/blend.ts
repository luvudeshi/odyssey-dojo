// How much of the pose the player's body owns right now. Keyboard play never reaches this (no frames, no tracking).
// Hurt, victory and defeat are moments the clip tells better than the camera can, so the clip comes back for them.

export interface ShareInput {
  readonly sinceHurt: number;
  readonly won: boolean;
  readonly lost: boolean;
}

/** A hurt flinch never takes more than this share of the pose from the body: the arms keep following through it. */
export const HURT_FLOOR = 0.4;

/** 1 = all body, 0 = all clip. */
export function trackShare(input: ShareInput, hurtSeconds: number): number {
  if (input.won || input.lost) return 0;
  if (input.sinceHurt >= 0 && input.sinceHurt < hurtSeconds) return 1 - (1 - HURT_FLOOR) * Math.sin((Math.PI * input.sinceHurt) / hurtSeconds);
  return 1;
}
