// The face-off cutscene's clock: time in ms in, what is on screen out. Pure, so a test can pin every beat.
export const SLAM_MS = 650;
export const VS_MS = 1500;
export const BURST_MS = 3700;
/** The fight starts here, under the white of the burst. */
export const HANDOVER_MS = 4300;
export const TOTAL_MS = 4650;
export const REDUCED_HANDOVER_MS = 1800;
export const REDUCED_TOTAL_MS = 2000;

export type Beat = "slide" | "slam" | "face" | "burst" | "fade";
export interface BeatAt { readonly beat: Beat; /** 0 to 1 through the beat. */ readonly t: number }

const BEATS: readonly (readonly [Beat, number, number])[] = [
  ["slide", 0, SLAM_MS],
  ["slam", SLAM_MS, 1100],
  ["face", 1100, BURST_MS],
  ["burst", BURST_MS, HANDOVER_MS],
  ["fade", HANDOVER_MS, TOTAL_MS],
];

const clamp = (n: number): number => Math.min(1, Math.max(0, n));
const span = (ms: number, from: number, to: number): number => clamp((ms - from) / (to - from));
const easeOut = (t: number): number => 1 - (1 - t) ** 3;
const easeIn = (t: number): number => t * t * t;
const easeBack = (t: number): number => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;

/** Which beat a time falls in and how far through it. Past the end it stays at the end of the last beat. */
export function beatAt(ms: number): BeatAt {
  const last = BEATS[BEATS.length - 1];
  const found = BEATS.find(([, , to]) => ms < to) ?? last;
  if (!found) return { beat: "fade", t: 1 };
  const [beat, from, to] = found;
  return { beat, t: span(ms, from, to) };
}

export interface Frame {
  readonly beat: Beat;
  /** Each half's slide, in percent of the screen width: the hero's is 0 or less, the boss's 0 or more. */
  readonly heroX: number;
  readonly bossX: number;
  readonly zoom: number;
  readonly shakeX: number;
  readonly shakeY: number;
  /** 0 to 1 */
  readonly flash: number;
  readonly crackY: number;
  readonly crackX: number;
  readonly lava: number;
  /** Name slabs: slide-in progress, text opacity. */
  readonly slabs: number;
  readonly epithet: number;
  /** The VS's scale and opacity. */
  readonly vsScale: number;
  readonly vs: number;
  readonly hint: number;
  readonly white: number;
  /** Opacity of the whole overlay. */
  readonly overlay: number;
}

/** Everything on screen at `ms`. With reduced motion it is one still title card that only fades at the end. */
export function frameAt(ms: number, reduced: boolean): Frame {
  if (reduced) {
    return { beat: "face", heroX: 0, bossX: 0, zoom: 1, shakeX: 0, shakeY: 0, flash: 0, crackY: 1, crackX: 1, lava: 0.85, slabs: 1, epithet: 1, vsScale: 1, vs: 1, hint: 1, white: 0, overlay: 1 - span(ms, REDUCED_HANDOVER_MS, REDUCED_TOTAL_MS) };
  }
  const slide = easeOut(span(ms, 0, SLAM_MS));
  const burst = easeIn(span(ms, BURST_MS, HANDOVER_MS));
  const shaking = span(ms, SLAM_MS, SLAM_MS + 420);
  const wobble = ms >= SLAM_MS && shaking < 1 ? (1 - shaking) ** 2 : 0;
  const leave = 1 - span(ms, BURST_MS, BURST_MS + 250);
  const vsIn = span(ms, VS_MS, VS_MS + 380);
  const slam = Math.max(0, 1 - span(ms, SLAM_MS, SLAM_MS + 280));
  const vsHit = ms >= VS_MS ? (1 - span(ms, VS_MS, VS_MS + 200)) * 0.3 : 0;
  return {
    beat: beatAt(ms).beat,
    heroX: (slide - 1) * 100 - burst * 62,
    bossX: (1 - slide) * 100 + burst * 62,
    zoom: 1 + 0.07 * span(ms, SLAM_MS, BURST_MS),
    shakeX: ms >= SLAM_MS ? Math.sin(ms / 23) * 16 * wobble : 0,
    shakeY: ms >= SLAM_MS ? Math.cos(ms / 19) * 10 * wobble : 0,
    flash: ms >= SLAM_MS ? Math.max(slam, vsHit) : 0,
    crackY: easeOut(span(ms, SLAM_MS, SLAM_MS + 320)),
    crackX: 1 + burst * 18,
    lava: span(ms, SLAM_MS, SLAM_MS + 300) * (0.8 + 0.2 * Math.sin(ms / 140)) + burst * 0.4,
    slabs: easeBack(span(ms, 950, 1450)),
    epithet: span(ms, 1350, 1750) * leave,
    vsScale: 2.8 - 1.8 * easeBack(vsIn),
    vs: vsIn * leave,
    hint: Math.min(span(ms, 500, 900), 1 - span(ms, BURST_MS, BURST_MS + 150)),
    white: span(ms, BURST_MS + 250, HANDOVER_MS),
    overlay: 1 - span(ms, HANDOVER_MS, TOTAL_MS),
  };
}
