// What the cutscene knows about each stop: its epithet, its book, where the camera pushes in, the flash and the weather.

export interface Weather {
  /** Drift in vw and vh per second at depth 1. */
  readonly vx: number;
  readonly vy: number;
  /** Size of one speck in px at depth 1 (the streak is `h` tall). */
  readonly w: number;
  readonly h: number;
  readonly color: string;
  readonly glow: string;
  readonly tilt: number;
  readonly count: number;
}

export interface BossCut {
  readonly epithet: string;
  readonly book: number;
  /** The point the picture pushes in toward, in percent of the picture. */
  readonly focus: string;
  /** The reveal's lightning or fire flash. */
  readonly flash: string;
  readonly weather: Weather;
}

const RAIN: Weather = { vx: -14, vy: 150, w: 2, h: 70, color: "rgba(190,225,255,0.55)", glow: "transparent", tilt: 6, count: 26 };
const EMBERS: Weather = { vx: 2, vy: -16, w: 6, h: 6, color: "#ffb347", glow: "0 0 10px 3px rgba(255,140,40,0.7)", tilt: 0, count: 22 };
const GREEN_EMBERS: Weather = { ...EMBERS, vy: -11, color: "#9dffb0", glow: "0 0 12px 4px rgba(90,255,150,0.6)" };
const SPRAY: Weather = { vx: 22, vy: -9, w: 5, h: 5, color: "rgba(225,245,255,0.8)", glow: "0 0 6px 2px rgba(180,230,255,0.5)", tilt: 0, count: 28 };

export const BOSS_CUTS: Readonly<Record<string, BossCut>> = {
  polyphemus: { epithet: "The Cyclops", book: 9, focus: "66% 36%", flash: "rgba(255,200,90,0.85)", weather: EMBERS },
  circe: { epithet: "The Witch of Aeaea", book: 10, focus: "64% 42%", flash: "rgba(120,255,170,0.7)", weather: GREEN_EMBERS },
  sirens: { epithet: "The Song That Drowns", book: 12, focus: "72% 38%", flash: "rgba(255,225,120,0.85)", weather: SPRAY },
  scylla: { epithet: "Six Heads in the Cliff", book: 12, focus: "72% 48%", flash: "rgba(200,230,255,0.95)", weather: RAIN },
  charybdis: { epithet: "The Drinking Sea", book: 12, focus: "62% 42%", flash: "rgba(200,235,255,0.9)", weather: { ...RAIN, vx: -30, vy: 110 } },
  suitors: { epithet: "The Hall of Ithaca", book: 22, focus: "72% 45%", flash: "rgba(255,170,80,0.7)", weather: { ...EMBERS, vy: -9, count: 18 } },
};
