// Circe's colours per phase: a sea-green hostess, a violet witch with the wand out, a crimson sorceress unmasked.
export interface Look {
  readonly robe: string;
  readonly trim: string;
  readonly hair: string;
  readonly magic: string;
}

export const LOOKS: readonly [Look, Look, Look] = [
  { robe: "#1f9a82", trim: "#f0c24a", hair: "#c4501f", magic: "#7dffb0" },
  { robe: "#6d36b8", trim: "#f0c24a", hair: "#b3321f", magic: "#c58bff" },
  { robe: "#b3163f", trim: "#ffd86a", hair: "#7a0f2a", magic: "#ff5c7a" },
];

export const SKIN = "#e8b98f";

export function lookFor(phaseIndex: number): Look {
  return LOOKS[Math.min(Math.max(Math.trunc(phaseIndex), 0), 2) as 0 | 1 | 2];
}
