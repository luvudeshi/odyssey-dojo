// Text-fitting maths for the god card: shrink a font or wrap words until text fits its box.
// Pure: the caller supplies the measuring, so this runs without a canvas.

/** Width in pixels of `text` set at a font size of `size` pixels. */
export type Measure = (text: string, size: number) => number;

export interface FittedText {
  readonly size: number;
  /** One entry per line, top to bottom. Empty when there is nothing to draw. */
  readonly lines: readonly string[];
}

/** Line pitch as a multiple of the font size. */
export const LINE_HEIGHT = 1.18;
const ELLIPSIS = "…";

/** The largest size from `maxSize` down to `minSize` at which `text` is no wider than `maxWidth`; `minSize` if none is. */
export function fitFontSize(text: string, maxWidth: number, maxSize: number, minSize: number, measure: Measure): number {
  const floor = Math.min(minSize, maxSize);
  const width = measure(text, maxSize);
  if (width <= maxWidth) return maxSize;
  // Width grows in step with size, so jump close first and then walk down to be exact.
  let size = width > 0 ? Math.max(floor, Math.floor((maxSize * maxWidth) / width)) : maxSize;
  while (size > floor && measure(text, size) > maxWidth) size -= 1;
  return Math.max(floor, size);
}

function words(text: string): string[] {
  return text.split(/\s+/).filter((word) => word !== "");
}

/** Greedy word wrap with no line limit. A single word wider than `maxWidth` gets a line to itself. */
function breakLines(text: string, maxWidth: number, width: (text: string) => number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of words(text)) {
    const joined = line === "" ? word : `${line} ${word}`;
    if (line === "" || width(joined) <= maxWidth) {
      line = joined;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line !== "") lines.push(line);
  return lines;
}

/** `text` cut from the end, with an ellipsis, until it is no wider than `maxWidth`. */
function truncate(text: string, maxWidth: number, width: (text: string) => number): string {
  if (width(text) <= maxWidth) return text;
  const glyphs = Array.from(text);
  while (glyphs.length > 0) {
    glyphs.pop();
    const cut = `${glyphs.join("").trimEnd()}${ELLIPSIS}`;
    if (width(cut) <= maxWidth) return cut;
  }
  return "";
}

/** Word wrap into at most `maxLines` lines no wider than `maxWidth`; whatever is left over ends in an ellipsis. */
export function wrapLines(text: string, maxWidth: number, maxLines: number, width: (text: string) => number): string[] {
  const limit = Math.max(1, Math.floor(maxLines));
  const lines = breakLines(text, maxWidth, width);
  const kept = lines.length > limit ? [...lines.slice(0, limit - 1), lines.slice(limit - 1).join(" ")] : lines;
  return kept.map((line) => truncate(line, maxWidth, width)).filter((line) => line !== "");
}

/**
 * Fits `text` into `box`, at the largest font size from `maxSize` down to `minSize` that works on up to `maxLines` lines.
 * Short text stays on one line at full size; long text shrinks or wraps, whichever keeps it bigger.
 * If even `minSize` overflows, the text is cut with an ellipsis, so nothing ever leaves the box.
 */
export function fitText(
  text: string,
  box: { readonly width: number; readonly height: number },
  maxSize: number,
  minSize: number,
  maxLines: number,
  measure: Measure,
): FittedText {
  const clean = words(text).join(" ");
  const floor = Math.max(1, Math.floor(Math.min(minSize, maxSize)));
  if (clean === "") return { size: floor, lines: [] };
  for (let size = Math.max(floor, Math.floor(maxSize)); size >= floor; size--) {
    const lines = breakLines(clean, box.width, (value) => measure(value, size));
    const fits =
      lines.length <= maxLines &&
      lines.length * size * LINE_HEIGHT <= box.height &&
      lines.every((line) => measure(line, size) <= box.width);
    if (fits) return { size, lines };
  }
  const rows = Math.max(1, Math.min(maxLines, Math.floor(box.height / (floor * LINE_HEIGHT))));
  return { size: floor, lines: wrapLines(clean, box.width, rows, (value) => measure(value, floor)) };
}
