// Clothing colour as a cue: averages the torso's colour from raw pixels and sorts a colour into a god's palette. Pure.
import type { Landmark, PoseFrame } from "../core/types";
import { JOINT, clamp01, joint } from "../pose/signals";
import type { GodId } from "./gods";

/** An average colour, 0..255 red, green, blue. */
export type Tint = readonly [number, number, number];

/** The part of ImageData this file needs, so it can be tested without a canvas. */
export interface PixelGrid {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

export type TintId = "dark" | "grey" | "red" | "gold" | "green" | "blue" | "purple";

/** The god each colour family reveals and the sentence that says why. Reasons name the clothing colour only. */
export const TINTS: Readonly<Record<TintId, { readonly god: GodId; readonly reason: string }>> = {
  dark: {
    god: "hermes",
    reason: "You came dressed in the dark of the night roads, the colour of a traveller who arrives unannounced, and Hermes walks those roads gladly.",
  },
  grey: {
    god: "athena",
    reason: "You wear clear, cool greys and whites, the colours of dawn mist and owl feathers, and Athena favours that quiet confidence.",
  },
  red: {
    god: "zeus",
    reason: "You wear a bold storm-red that announces itself like thunder, and Zeus favours whoever dares to be noticed.",
  },
  purple: {
    god: "zeus",
    reason: "You wear royal purple, the colour of the finest cloaks in Homer, and the king of the gods claims it as a matter of course.",
  },
  gold: {
    god: "apollo",
    reason: "You wear the warm golds of full daylight, and Apollo cannot resist a colour borrowed from the sun.",
  },
  green: {
    god: "artemis",
    reason: "You wear the greens of the wild hills, and Artemis welcomes anyone dressed for the forest into the hunt.",
  },
  blue: {
    god: "poseidon",
    reason: "You wear the deep blues of open water, and Poseidon claims everything the colour of the sea with pride.",
  },
};

const MIN_VISIBILITY = 0.5;
const SAMPLES = 24;

/** Which colour family a tint belongs to, or null when there is no usable colour. */
export function tintId(tint: Tint | null): TintId | null {
  if (!tint) return null;
  const r = clamp01(tint[0] / 255);
  const g = clamp01(tint[1] / 255);
  const b = clamp01(tint[2] / 255);
  if (!Number.isFinite(r + g + b)) return null;
  const max = Math.max(r, g, b);
  const spread = max - Math.min(r, g, b);
  const saturation = max === 0 ? 0 : spread / max;
  // A black shirt on a webcam is rarely pure black: allow a faint colour cast when it is dim.
  if (max < 0.22 || (max < 0.32 && saturation < 0.3)) return "dark";
  if (saturation < 0.16) return "grey";
  const sector = max === r ? ((g - b) / spread + 6) % 6 : max === g ? (b - r) / spread + 2 : (r - g) / spread + 4;
  const hue = sector * 60;
  if (hue < 18 || hue >= 335) return "red";
  if (hue < 70) return "gold";
  if (hue < 165) return "green";
  return hue < 255 ? "blue" : "purple";
}

function seen(point: Landmark): Landmark | null {
  return Number.isFinite(point.x) && Number.isFinite(point.y) && point.visibility >= MIN_VISIBILITY ? point : null;
}

/**
 * The average colour of the player's clothing: the middle of the torso, between the shoulders and the hips.
 * `pixels` is RGBA, row by row, as from getImageData. Pose points are in the mirrored picture, so say
 * `mirrored: true` if the pixels were drawn mirrored too; by default they are taken to be the raw camera picture.
 * Returns null when the torso is not in view.
 */
export function clothingTint(
  pixels: PixelGrid,
  frame: PoseFrame | null,
  options: { readonly mirrored?: boolean } = {},
): Tint | null {
  const { data, width, height } = pixels;
  if (!frame || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) return null;
  const leftShoulder = seen(joint(frame.image, JOINT.leftShoulder));
  const rightShoulder = seen(joint(frame.image, JOINT.rightShoulder));
  if (!leftShoulder || !rightShoulder) return null;
  const leftHip = seen(joint(frame.image, JOINT.leftHip));
  const rightHip = seen(joint(frame.image, JOINT.rightHip));

  const span = Math.abs(rightShoulder.x - leftShoulder.x);
  const top = (leftShoulder.y + rightShoulder.y) / 2;
  // With the hips out of view, take about one shoulder width of chest below the shoulders.
  const bottom = leftHip && rightHip ? (leftHip.y + rightHip.y) / 2 : top + (span * width) / height;
  const center = (leftShoulder.x + rightShoulder.x) / 2;
  // Stay inside the torso: skip the collar, the belt line and the arms at the edges.
  const x0 = clamp01(center - span * 0.3);
  const x1 = clamp01(center + span * 0.3);
  const y0 = clamp01(top + (bottom - top) * 0.2);
  const y1 = clamp01(top + (bottom - top) * 0.85);
  if (x1 <= x0 || y1 <= y0) return null;

  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;
  for (let row = 0; row < SAMPLES; row++) {
    const y = Math.min(height - 1, Math.floor((y0 + ((row + 0.5) / SAMPLES) * (y1 - y0)) * height));
    for (let column = 0; column < SAMPLES; column++) {
      const along = x0 + ((column + 0.5) / SAMPLES) * (x1 - x0);
      const x = Math.min(width - 1, Math.floor((options.mirrored ? along : 1 - along) * width));
      const at = (y * width + x) * 4;
      const [r, g, b, alpha] = [data[at], data[at + 1], data[at + 2], data[at + 3]];
      // A short buffer or a see-through pixel has no colour to add.
      if (r === undefined || g === undefined || b === undefined || !alpha) continue;
      red += r;
      green += g;
      blue += b;
      count += 1;
    }
  }
  return count === 0 ? null : [Math.round(red / count), Math.round(green / count), Math.round(blue / count)];
}
