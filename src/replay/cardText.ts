// Text for the god card: letter-spaced, centred or left-set, and always fitted inside its rectangle.
import { SERIF } from "./cardPalette";
import type { Rect } from "./rect";
import { fitText, LINE_HEIGHT } from "./textFit";
import type { Measure } from "./textFit";

export interface TextStyle {
  readonly maxSize: number;
  readonly maxLines: number;
  readonly color: string;
  readonly italic?: boolean;
  readonly weight?: number;
  /** Extra space between letters, in ems. */
  readonly tracking?: number;
  readonly align?: "left" | "center";
  readonly alpha?: number;
}

function fontOf(style: TextStyle, size: number): string {
  return `${style.italic ? "italic" : "normal"} ${String(style.weight ?? 600)} ${String(size)}px ${SERIF}`;
}

/** A measure callback for the text-fitting maths that counts the letter spacing we add by hand. */
export function measureWith(context: CanvasRenderingContext2D, style: TextStyle): Measure {
  return (text, size) => {
    context.font = fontOf(style, size);
    const gaps = Math.max(0, Array.from(text).length - 1);
    return context.measureText(text).width + gaps * size * (style.tracking ?? 0);
  };
}

/** fillText with letter spacing. Each glyph is placed after the measured text before it, so kerning survives. */
function fillTracked(context: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number): void {
  if (spacing === 0) {
    context.fillText(text, x, y);
    return;
  }
  let before = "";
  Array.from(text).forEach((glyph, index) => {
    context.fillText(glyph, x + context.measureText(before).width + spacing * index, y);
    before += glyph;
  });
}

/** Draws already-fitted lines at `size`, stacked around the middle of `box`. */
export function fillLines(
  context: CanvasRenderingContext2D,
  lines: readonly string[],
  size: number,
  box: Rect,
  style: TextStyle,
): void {
  const measure = measureWith(context, style);
  const pitch = size * LINE_HEIGHT;
  const top = box.y + (box.height - pitch * lines.length) / 2;
  context.save();
  context.fillStyle = style.color;
  context.globalAlpha = style.alpha ?? 1;
  context.textAlign = "left";
  context.textBaseline = "middle";
  lines.forEach((line, index) => {
    const width = measure(line, size);
    const x = style.align === "left" ? box.x : box.x + (box.width - width) / 2;
    fillTracked(context, line, x, top + pitch * (index + 0.5), size * (style.tracking ?? 0));
  });
  context.restore();
}

/** Draws `text` inside `box`, shrunk or wrapped so that it cannot overflow. */
export function drawText(context: CanvasRenderingContext2D, text: string, box: Rect, style: TextStyle): void {
  const smallest = Math.min(style.maxSize, Math.max(8, Math.round(style.maxSize * 0.45)));
  const fitted = fitText(text, box, style.maxSize, smallest, style.maxLines, measureWith(context, style));
  fillLines(context, fitted.lines, fitted.size, box, style);
}
