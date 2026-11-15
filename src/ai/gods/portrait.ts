// Draws the god portrait in the browser: the webcam snapshot as a marble bust inside a gold ring and laurel wreath.
// This is what the player sees when the AI portrait is slow, fails or there is no network, so it never throws.
import { log } from "../../core/log";
import { gilded, headIsFramed, isBlank, laurelBranch, marbleize, portraitCrop, sourceX } from "./marble";

export interface PortraitOptions {
  /** The god's colour, as any CSS colour. The gilding is this blended toward gold. */
  readonly accent: string;
  /** Width and height of the result in pixels. 512 when left out. */
  readonly size?: number;
  /** Flip the picture sideways so it matches what the player sees. On unless set to false. */
  readonly mirror?: boolean;
  /**
   * Landmarks, 0..1 of the picture as the player sees it: `frame.image` when mirrored, the raw source when not.
   * The laurel crown and the tight bust light assume the crop was framed on these. Without a usable pose the
   * picture is the centred square, lit wide, and the branches only cradle its lower half so no leaf crosses a face.
   */
  readonly pose?: Parameters<typeof portraitCrop>[2];
  readonly seed?: number;
}

type Rgb = readonly [number, number, number];

const GOLD: Rgb = [232, 184, 74];
const GOLD_CSS = "#e8b84a";
const SHADOW_CSS = "rgba(20, 12, 34, 0.75)";
const DEFAULT_SIZE = 512;
const SMALLEST_SIZE = 32;
const LARGEST_SIZE = 2048;

/** Sizes as fractions of the portrait's width. */
export const RING_RADIUS = 0.478;
export const RING_WIDTH = 0.011;

function mix(from: Rgb, to: Rgb, amount: number): Rgb {
  return [from[0] + (to[0] - from[0]) * amount, from[1] + (to[1] - from[1]) * amount, from[2] + (to[2] - from[2]) * amount];
}

function css(colour: Rgb, alpha = 1): string {
  return `rgba(${colour.map((channel) => Math.round(channel).toFixed(0)).join(", ")}, ${alpha.toFixed(2)})`;
}

/** The accent blended toward gold. The canvas parses the CSS colour; one it does not know leaves plain gold. */
function gilding(context: CanvasRenderingContext2D, accent: string): Rgb {
  context.fillStyle = GOLD_CSS;
  context.fillStyle = accent;
  context.fillRect(0, 0, 1, 1);
  const [r = GOLD[0], g = GOLD[1], b = GOLD[2]] = context.getImageData(0, 0, 1, 1).data;
  context.clearRect(0, 0, 1, 1);
  return gilded([r, g, b]);
}

/** One pointed leaf from its stem end at (x, y), lit along its outer half, with a dark midrib. */
function drawLeaf(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  length: number,
  colours: { readonly body: string; readonly lit: string; readonly dark: string },
): void {
  const belly = length * 0.24;
  context.save();
  context.translate(x, y);
  context.rotate(angle);
  context.beginPath();
  context.moveTo(0, 0);
  context.bezierCurveTo(length * 0.25, -belly, length * 0.7, -belly * 0.8, length, 0);
  context.bezierCurveTo(length * 0.7, belly * 0.8, length * 0.25, belly, 0, 0);
  context.fillStyle = colours.body;
  context.fill();

  context.shadowColor = "transparent";
  context.beginPath();
  context.moveTo(0, 0);
  context.bezierCurveTo(length * 0.25, -belly, length * 0.7, -belly * 0.8, length, 0);
  context.closePath();
  context.fillStyle = colours.lit;
  context.fill();
  context.beginPath();
  context.moveTo(length * 0.08, 0);
  context.lineTo(length * 0.94, 0);
  context.strokeStyle = colours.dark;
  context.lineWidth = Math.max(0.5, length * 0.035);
  context.stroke();
  context.restore();
}

/** The wreath and ring's three colours for a gilding; the emblem (emblem.ts) uses the same ones. */
export function wreathColours(gilt: Rgb): { readonly body: string; readonly lit: string; readonly dark: string } {
  return {
    body: css(mix(gilt, [70, 40, 10], 0.18)),
    lit: css(mix(gilt, [255, 250, 225], 0.55), 0.85),
    dark: css(mix(gilt, [45, 22, 8], 0.7), 0.7),
  };
}

/** A thin ring, then two laurel branches that meet at the bottom: open above the head when crowned, else only the lower half. */
function drawWreath(context: CanvasRenderingContext2D, size: number, gilt: Rgb, crowned: boolean): void {
  const colours = wreathColours(gilt);
  const branch = laurelBranch(crowned);
  const radius = size * branch.radius;
  context.save();
  context.translate(size / 2, size / 2);
  context.lineCap = "round";

  context.beginPath();
  context.arc(0, 0, size * RING_RADIUS, 0, Math.PI * 2);
  context.strokeStyle = colours.body;
  context.lineWidth = size * RING_WIDTH;
  context.stroke();
  context.beginPath();
  context.arc(0, 0, size * (RING_RADIUS - RING_WIDTH * 0.2), 0, Math.PI * 2);
  context.strokeStyle = colours.lit;
  context.lineWidth = size * RING_WIDTH * 0.25;
  context.stroke();

  context.shadowColor = SHADOW_CSS;
  context.shadowBlur = size * 0.014;
  for (const side of [1, -1]) {
    context.save();
    context.scale(side, 1);
    context.beginPath();
    context.arc(0, 0, radius, Math.PI / 2, branch.end, true);
    context.strokeStyle = colours.body;
    context.lineWidth = size * 0.009;
    context.stroke();
    for (const leaf of branch.leaves) drawLeaf(context, leaf.x * size, leaf.y * size, leaf.angle, leaf.length * size, colours);
    context.restore();
  }

  // The knot where the branches are tied.
  context.beginPath();
  context.arc(0, radius, size * 0.017, 0, Math.PI * 2);
  context.fillStyle = colours.body;
  context.fill();
  context.shadowColor = "transparent";
  context.beginPath();
  context.arc(-size * 0.004, radius - size * 0.004, size * 0.008, 0, Math.PI * 2);
  context.fillStyle = colours.lit;
  context.fill();
  context.restore();
}

/**
 * The player as a marble bust with a gold laurel wreath, as a PNG data URL.
 * Returns null, with a warning in the log, when there is no canvas, the source has no picture yet or anything goes wrong.
 */
export function renderPortrait(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  options: PortraitOptions,
): string | null {
  try {
    if (typeof document === "undefined") {
      log("warn", "portrait.unavailable", "no document");
      return null;
    }
    const requested = Math.round(options.size ?? DEFAULT_SIZE);
    const size = Number.isFinite(requested) ? Math.min(LARGEST_SIZE, Math.max(SMALLEST_SIZE, requested)) : DEFAULT_SIZE;
    const mirror = options.mirror ?? true;
    const pose = options.pose ?? null;
    const crop = portraitCrop(sourceWidth, sourceHeight, pose);
    const framed = headIsFramed(sourceWidth, sourceHeight, pose);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context || crop.size <= 0) {
      log("warn", "portrait.unavailable", context ? "empty source" : "no 2d canvas");
      return null;
    }
    if (typeof HTMLVideoElement !== "undefined" && source instanceof HTMLVideoElement && source.readyState < source.HAVE_CURRENT_DATA) {
      log("warn", "portrait.unavailable", "video has no frame yet");
      return null;
    }

    const gilt = gilding(context, options.accent);
    context.save();
    if (mirror) {
      context.translate(size, 0);
      context.scale(-1, 1);
    }
    context.imageSmoothingQuality = "high";
    context.drawImage(source, sourceX(sourceWidth, crop, mirror), crop.y, crop.size, crop.size, 0, 0, size, size);
    context.restore();

    const photo = context.getImageData(0, 0, size, size);
    // A video with no data, a dead camera track or a crop outside the real source would otherwise become an empty stone disc.
    if (isBlank(photo)) {
      log("warn", "portrait.unavailable", "blank frame");
      return null;
    }
    const light = { accent: gilt, wide: !framed };
    const stone = marbleize(photo, options.seed === undefined ? light : { ...light, seed: options.seed });
    photo.data.set(stone.data);
    context.putImageData(photo, 0, 0);
    drawWreath(context, size, gilt, framed);
    return canvas.toDataURL("image/png");
  } catch (error) {
    log("warn", "portrait.failed", error);
    return null;
  }
}
