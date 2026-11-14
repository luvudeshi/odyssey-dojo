// The god card's Greek-key (meander) border: the path maths, and the canvas strokes that use it.
import { inset } from "./rect";
import type { Rect } from "./rect";

/** The band is this many cells thick: a rule, a two-cell key, and a rule, with a cell of air each side of the key. */
export const BAND_CELLS = 4;

/**
 * One straight run of Greek keys as a single polyline. x runs 0..length along the run; y is the height above the
 * run's baseline, 0..2 cells. The keys are stretched slightly so that a whole number of them fills the run exactly.
 */
export function meanderPoints(length: number, cell: number): (readonly [number, number])[] {
  if (!(length > 0) || !(cell > 0)) return [];
  const keys = Math.max(1, Math.round(length / (cell * 3)));
  // Each key is three steps long; dividing last keeps the final point exactly at `length`.
  const at = (steps: number): number => (length * steps) / (keys * 3);
  const points: (readonly [number, number])[] = [[0, 0]];
  for (let key = 0; key < keys; key++) {
    const start = key * 3;
    points.push(
      [at(start), cell * 2],
      [at(start + 2), cell * 2],
      [at(start + 2), cell],
      [at(start + 1), cell],
      [at(start + 1), 0],
      [at(start + 3), 0],
    );
  }
  return points;
}

/** Strokes the border band just inside `frame`: two rules, a run of keys along each side and a boss in each corner. */
export function drawMeander(context: CanvasRenderingContext2D, frame: Rect, cell: number, color: string): void {
  const band = cell * BAND_CELLS;
  const right = frame.x + frame.width;
  const bottom = frame.y + frame.height;
  context.save();
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = Math.max(1, cell * 0.3);
  context.lineJoin = "miter";
  context.lineCap = "square";
  context.strokeRect(frame.x, frame.y, frame.width, frame.height);
  const inner = inset(frame, band);
  context.strokeRect(inner.x, inner.y, inner.width, inner.height);

  // Each side is drawn in its own turned frame: x along the side, y pointing into the card.
  const sides: readonly (readonly [x: number, y: number, quarterTurns: number, length: number])[] = [
    [frame.x + band, frame.y, 0, frame.width - band * 2],
    [right, frame.y + band, 1, frame.height - band * 2],
    [right - band, bottom, 2, frame.width - band * 2],
    [frame.x, bottom - band, 3, frame.height - band * 2],
  ];
  for (const [x, y, quarterTurns, length] of sides) {
    context.save();
    context.translate(x, y);
    context.rotate((quarterTurns * Math.PI) / 2);
    context.beginPath();
    meanderPoints(length, cell).forEach(([along, up], index) => {
      if (index === 0) context.moveTo(along, cell * 3 - up);
      else context.lineTo(along, cell * 3 - up);
    });
    context.stroke();
    context.restore();
  }

  for (const [x, y] of [[frame.x, frame.y], [right - band, frame.y], [right - band, bottom - band], [frame.x, bottom - band]] as const) {
    context.strokeRect(x + cell, y + cell, cell * 2, cell * 2);
    context.fillRect(x + cell * 1.6, y + cell * 1.6, cell * 0.8, cell * 0.8);
  }
  context.restore();
}
