// Two players on one camera: the tracking points are fine lines and small joints, one colour per player, and much
// smaller than the stones a fight alone lays, so the people in the camera's picture are not hidden.
import { expect, test } from "vitest";
import type { Landmark } from "../src/core/types";
import { FINE_INK, drawFine, fineSizes } from "../src/hud/fineSkeleton";

function image(): Landmark[] {
  return Array.from({ length: 33 }, (_, i) => ({ x: 0.1 + i * 0.02, y: 0.2 + i * 0.01, z: 0, visibility: 1 }));
}

/** A canvas that only writes down what was drawn. */
function recorder() {
  const arcs: number[] = [];
  const strokes: { color: string; width: number }[] = [];
  const fills: string[] = [];
  const context = {
    lineCap: "butt", strokeStyle: "", fillStyle: "", lineWidth: 1, globalAlpha: 1,
    beginPath() { /* nothing to keep */ },
    moveTo() { /* nothing to keep */ },
    lineTo() { /* nothing to keep */ },
    arc(_x: number, _y: number, radius: number) { arcs.push(radius); },
    stroke() { strokes.push({ color: this.strokeStyle, width: this.lineWidth }); },
    fill() { fills.push(this.fillStyle); },
  };
  return { context: context as unknown as CanvasRenderingContext2D, arcs, strokes, fills, alpha: () => context.globalAlpha };
}

test("each player has their own colour", () => {
  expect(FINE_INK[0]).not.toBe(FINE_INK[1]);
  for (const ink of FINE_INK) {
    const seen = recorder();
    drawFine(seen.context, image(), true, 428, 328, 2, ink);
    expect(seen.fills).toHaveLength(13);
    expect(new Set(seen.fills)).toEqual(new Set([ink]));
    expect(seen.strokes.some((stroke) => stroke.color === ink)).toBe(true);
    expect(seen.alpha()).toBe(1);
  }
});

test("the points are small: a joint is under a third of the stone joint a fight alone draws, and a line is about a pixel", () => {
  for (const [width, ratio] of [[428, 2], [214, 1], [640, 2]] as const) {
    const { line, joint } = fineSizes(width, ratio);
    const stoneJoint = Math.max(2.2 * ratio, width * 0.017) * 1.75;
    expect(joint).toBeLessThan(stoneJoint / 3);
    expect(line / ratio).toBeGreaterThanOrEqual(1);
    expect(line / ratio).toBeLessThan(2);
    const seen = recorder();
    drawFine(seen.context, image(), false, width, Math.round(width * 0.77), ratio, FINE_INK[0]);
    expect(Math.max(...seen.arcs)).toBeCloseTo(joint);
  }
});
