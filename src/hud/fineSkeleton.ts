// Two players on one camera: each body as fine lines and small joints in its own colour, so the people in the
// camera's picture stay visible under their tracking points. A fight alone keeps the stones (CameraView.tsx).
import type { Landmark } from "../core/types";
import { skeletonLines } from "./skeletonLines";

/** Player one's gold and player two's blue. */
export const FINE_INK = ["#ffd166", "#62b0ff"] as const;
const EDGE = "#0b0f18";

/** Line width and joint radius in canvas pixels: sized from the panel, never thinner than a screen can show. */
export function fineSizes(width: number, ratio: number): { readonly line: number; readonly joint: number } {
  const line = Math.max(1.1 * ratio, width * 0.0045);
  return { line, joint: line * 1.8 };
}

export function drawFine(context: CanvasRenderingContext2D, image: readonly Landmark[], mirror: boolean, width: number, height: number, ratio: number, ink: string): void {
  const { lines, dots } = skeletonLines(image, mirror, width, height);
  const { line, joint } = fineSizes(width, ratio);
  context.lineCap = "round";
  // A dark line under the coloured one, so it reads on a bright room as well as a dark one.
  for (const under of [true, false]) {
    context.strokeStyle = under ? EDGE : ink;
    context.lineWidth = under ? line * 1.9 : line;
    for (const { from, to, faint } of lines) {
      context.globalAlpha = faint ? 0.25 : under ? 0.5 : 0.95;
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();
    }
  }
  context.fillStyle = ink;
  context.strokeStyle = EDGE;
  context.lineWidth = line * 0.6;
  for (const dot of dots) {
    context.globalAlpha = dot.faint ? 0.3 : 1;
    context.beginPath();
    context.arc(dot.x, dot.y, joint, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }
  context.globalAlpha = 1;
}
