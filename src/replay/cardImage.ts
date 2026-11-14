// Pictures on the god card: the portrait cropped to fill its circle, and the QR code on its white plate.
import { log } from "../core/log";
import { INK } from "./cardPalette";
import type { Rect } from "./rect";

/** How big a picture is in its own pixels, or null when it does not say (an SVG image). */
function sourceSize(source: CanvasImageSource): { width: number; height: number } | null {
  if ("naturalWidth" in source) return { width: source.naturalWidth, height: source.naturalHeight };
  if ("videoWidth" in source) return { width: source.videoWidth, height: source.videoHeight };
  if ("displayWidth" in source) return { width: source.displayWidth, height: source.displayHeight };
  const { width, height } = source;
  return typeof width === "number" && typeof height === "number" ? { width, height } : null;
}

/** True for a picture that says it has no pixels: one still loading, or broken. drawImage ignores those silently. */
function isEmpty(source: CanvasImageSource): boolean {
  const size = sourceSize(source);
  return size !== null && !(size.width > 0 && size.height > 0);
}

/** The centred part of a source picture that fills a target of the given shape without stretching. */
export function coverCrop(sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number): Rect {
  const wider = sourceWidth * targetHeight > sourceHeight * targetWidth;
  const width = wider ? (sourceHeight * targetWidth) / targetHeight : sourceWidth;
  const height = wider ? sourceHeight : (sourceWidth * targetHeight) / targetWidth;
  return { x: (sourceWidth - width) / 2, y: (sourceHeight - height) / 2, width, height };
}

/** Draws a picture to fill `box`, cropping the overflow. False if the picture cannot be drawn (broken or empty). */
export function drawCover(context: CanvasRenderingContext2D, source: CanvasImageSource, box: Rect): boolean {
  try {
    const size = sourceSize(source);
    if (!size) {
      context.drawImage(source, box.x, box.y, box.width, box.height);
      return true;
    }
    if (isEmpty(source) || !(box.width > 0) || !(box.height > 0)) return false;
    const crop = coverCrop(size.width, size.height, box.width, box.height);
    context.drawImage(source, crop.x, crop.y, crop.width, crop.height, box.x, box.y, box.width, box.height);
    return true;
  } catch (error) {
    log("warn", "godCard.imageFailed", error);
    return false;
  }
}

/** Draws the QR on a white plate with a quiet zone, so it scans against the dark card. False if it cannot be drawn. */
export function drawQr(context: CanvasRenderingContext2D, qr: CanvasImageSource, box: Rect): boolean {
  if (!(box.width > 0)) return false;
  context.save();
  try {
    // Checked before the plate goes down, so an empty code leaves no blank white square behind.
    if (isEmpty(qr)) {
      log("warn", "godCard.qrEmpty");
      return false;
    }
    const quiet = box.width * 0.07;
    context.fillStyle = "#ffffff";
    context.fillRect(box.x, box.y, box.width, box.height);
    context.imageSmoothingEnabled = false;
    context.drawImage(qr, box.x + quiet, box.y + quiet, box.width - quiet * 2, box.height - quiet * 2);
    return true;
  } catch (error) {
    log("warn", "godCard.qrFailed", error);
    context.fillStyle = INK;
    context.fillRect(box.x, box.y, box.width, box.height);
    return false;
  } finally {
    context.restore();
  }
}
