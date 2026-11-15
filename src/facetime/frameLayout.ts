// Where everything goes in the picture the friend sees on the phone. Pure numbers, no canvas.
//
// The game's HUD is DOM and the fight is a WebGL canvas, so neither can be sent as it is. The outgoing picture is
// built on a 2D canvas each frame: the fight's picture cropped to fit, plus the few things a player needs, drawn
// large: the move's name and figure, the countdown, the two health bars, the grade word and the call clock.
// A phone on FaceTime is held upright, so the default frame is 720 x 1280 with everything inside a safe margin
// (FaceTime rounds the corners and may crop the edges a little).

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export type FrameShape = "portrait" | "landscape";

export interface FrameLayout {
  readonly width: number;
  readonly height: number;
  /** Nothing that must be read goes outside this. */
  readonly safe: Rect;
  /** The fight's picture. */
  readonly picture: Rect;
  /** The monster's name and health. */
  readonly enemyName: Rect;
  readonly enemyBar: Rect;
  /** The heroes' health. */
  readonly heroLabel: Rect;
  readonly heroBar: Rect;
  /** Time left on the call. */
  readonly clock: Rect;
  /** The prompt card: tag, figure, the move's word, a line of help, and the countdown bar. */
  readonly card: Rect;
  readonly tag: Rect;
  readonly figure: Rect;
  readonly word: Rect;
  readonly line: Rect;
  readonly timer: Rect;
  /** GOOD / GREAT / PERFECT, over the picture. */
  readonly grade: Rect;
}

export const SAFE_MARGIN = 36;

const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

export function frameLayout(shape: FrameShape = "portrait"): FrameLayout {
  const m = SAFE_MARGIN;
  if (shape === "portrait") {
    const width = 720, height = 1280, inner = width - m * 2;
    return {
      width, height,
      safe: rect(m, m, inner, height - m * 2),
      enemyName: rect(m, 40, inner - 150, 44),
      clock: rect(width - m - 150, 40, 150, 44),
      enemyBar: rect(m, 92, inner, 30),
      heroLabel: rect(m, 130, 120, 34),
      heroBar: rect(m + 130, 134, inner - 130, 26),
      picture: rect(0, 180, width, 560),
      grade: rect(m, 600, inner, 110),
      card: rect(0, 740, width, height - 740),
      tag: rect(m, 760, inner, 50),
      figure: rect(m, 820, 300, 340),
      word: rect(m + 316, 830, inner - 316, 170),
      line: rect(m + 316, 1010, inner - 316, 150),
      timer: rect(m, 1180, inner, 44),
    };
  }
  const width = 1280, height = 720, side = 440, left = width - side, inner = side - m * 2;
  return {
    width, height,
    safe: rect(m, m, width - m * 2, height - m * 2),
    picture: rect(0, 0, left, height),
    enemyName: rect(m, m, left - m * 2 - 150, 40),
    clock: rect(left - m - 150, m, 150, 40),
    enemyBar: rect(m, m + 46, left - m * 2, 26),
    heroLabel: rect(m, height - m - 30, 120, 30),
    heroBar: rect(m + 130, height - m - 26, left - m * 2 - 130, 22),
    grade: rect(m, height - 190, left - m * 2, 100),
    card: rect(left, 0, side, height),
    tag: rect(left + m, m, inner, 46),
    figure: rect(left + m + (inner - 260) / 2, m + 56, 260, 280),
    word: rect(left + m, m + 346, inner, 110),
    line: rect(left + m, m + 462, inner, 110),
    timer: rect(left + m, height - m - 40, inner, 40),
  };
}

/**
 * The part of a `srcW` x `srcH` picture to copy so it fills `dst` with nothing stretched: the sides (or the top and
 * bottom) are cut off evenly around `focusX`, `focusY` (0..1 across the source; the middle by default).
 */
export function coverCrop(srcW: number, srcH: number, dst: Rect, focusX = 0.5, focusY = 0.5): Rect {
  if (srcW <= 0 || srcH <= 0 || dst.w <= 0 || dst.h <= 0) return rect(0, 0, 0, 0);
  const want = dst.w / dst.h;
  const have = srcW / srcH;
  const w = have > want ? srcH * want : srcW;
  const h = have > want ? srcH : srcW / want;
  const clamp = (value: number, max: number): number => Math.min(Math.max(value, 0), max);
  return rect(clamp(srcW * focusX - w / 2, srcW - w), clamp(srcH * focusY - h / 2, srcH - h), w, h);
}

/** Where a `srcW` x `srcH` picture lands inside `dstW` x `dstH` when all of it is shown, centred, with bars around it. */
export function containFit(srcW: number, srcH: number, dstW: number, dstH: number): Rect {
  if (srcW <= 0 || srcH <= 0 || dstW <= 0 || dstH <= 0) return rect(0, 0, 0, 0);
  const scale = Math.min(dstW / srcW, dstH / srcH);
  const w = srcW * scale, h = srcH * scale;
  return rect((dstW - w) / 2, (dstH - h) / 2, w, h);
}

/** A point of a move's stick figure (drawn in a 100 x 100 box) inside `box`, kept square and centred. */
export function figurePoint(box: Rect, x: number, y: number): readonly [number, number] {
  const size = Math.min(box.w, box.h);
  const left = box.x + (box.w - size) / 2;
  const top = box.y + (box.h - size) / 2;
  return [left + (x / 100) * size, top + (y / 100) * size];
}

/** The filled part of a bar for a share from 0 to 1. Anything outside is clamped; a value that is not a number is empty. */
export function barFill(bar: Rect, share: number): Rect {
  const part = Number.isFinite(share) ? Math.min(1, Math.max(0, share)) : 0;
  return rect(bar.x, bar.y, bar.w * part, bar.h);
}

/** The largest font size (in px, whole) at which text `chars` long fits `width`, given the font's mean glyph width as a share of its size. */
export function fitFont(chars: number, width: number, max: number, glyph = 0.62, min = 18): number {
  if (chars <= 0) return max;
  return Math.max(min, Math.min(max, Math.floor(width / (chars * glyph))));
}

/** True when `inner` lies wholly inside `outer`. */
export function inside(inner: Rect, outer: Rect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}

/** True when the two share any area. */
export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
