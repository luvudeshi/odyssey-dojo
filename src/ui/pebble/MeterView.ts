// Draws a Meter on a canvas and keeps it current. A value change redraws only the stones that flip (clipped to their
// own box), never the whole meter, so an animating bar costs a handful of stones per frame.
import { drawStone, drawStrip, fillTrough, troughPath } from "./draw";
import type { Meter } from "./meter";
import { changedStones, isLit } from "./meter";
import { LEAD } from "./palette";

const FULL_REDRAW_ABOVE = 24;

export class MeterView {
  private value = 0;
  constructor(private readonly ctx: CanvasRenderingContext2D, private readonly m: Meter) {
    this.paintAll();
  }

  private paintStone(i: number): void {
    const s = this.m.stones[i];
    if (!s) return;
    if (isLit(s.k, this.value)) drawStone(this.ctx, s.stone, s.lit, 1);
    else drawStone(this.ctx, s.stone, s.dim, 0.78);
  }

  private paintBase(): void {
    if (!this.m.trough) return;
    fillTrough(this.ctx, this.m.trough);
    drawStrip(this.ctx, { pts: [...this.m.trough, this.m.trough[0] ?? [0, 0]], w: 2, color: LEAD });
  }

  private paintAll(): void {
    this.ctx.clearRect(0, 0, this.m.w, this.m.h);
    this.paintBase();
    this.m.stones.forEach((_, i) => { this.paintStone(i); });
  }

  /** Set the fill (0 to 1). Returns how many stones were repainted, for the cost report. */
  set(next: number): number {
    const v = Math.min(1, Math.max(0, next)), flips = changedStones(this.m, this.value, v);
    this.value = v;
    if (flips.length === 0) return 0;
    if (flips.length > FULL_REDRAW_ABOVE) { this.paintAll(); return this.m.stones.length; }
    let painted = 0;
    for (const i of flips) {
      const f = this.m.stones[i];
      if (!f) continue;
      const x0 = f.stone.x - f.stone.a - 2, y0 = f.stone.y - f.stone.a - 2, x1 = f.stone.x + f.stone.a + 2, y1 = f.stone.y + f.stone.a + 2;
      const c = this.ctx;
      c.save();
      c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); c.clip();
      if (this.m.trough) { troughPath(c, this.m.trough); c.clip(); }
      c.clearRect(x0, y0, x1 - x0, y1 - y0);
      this.paintBase();
      this.m.stones.forEach((n, j) => {
        const r = Math.max(n.stone.a, n.stone.b);
        if (n.stone.x + r < x0 || n.stone.x - r > x1 || n.stone.y + r < y0 || n.stone.y - r > y1) return;
        this.paintStone(j); painted++;
      });
      c.restore();
    }
    return painted;
  }
}
