// Axis-aligned rectangles for the god card's layout.

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** `rect` shrunk by `by` on every side; it collapses to its centre rather than going negative. */
export function inset(rect: Rect, by: number): Rect {
  const dx = Math.max(0, Math.min(by, rect.width / 2));
  const dy = Math.max(0, Math.min(by, rect.height / 2));
  return { x: rect.x + dx, y: rect.y + dy, width: rect.width - 2 * dx, height: rect.height - 2 * dy };
}

export function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

/** True when the two share any area; touching edges do not count. */
export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
