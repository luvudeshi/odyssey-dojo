// A trail drawn as a tapering strip: one mesh, rewritten every frame from a list of points (newest first). Each point
// carries its own brightness, and the strip is drawn additively, so a dim point is a faded one.
import { AdditiveBlending, BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial } from "three";

export class Ribbon {
  readonly mesh: Mesh;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly geo = new BufferGeometry();
  private readonly posAttr: BufferAttribute;
  private readonly colAttr: BufferAttribute;

  constructor(private readonly n: number) {
    this.pos = new Float32Array(n * 6);
    this.col = new Float32Array(n * 6);
    const index: number[] = [];
    for (let i = 0; i < n - 1; i++) index.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
    this.geo.setIndex(index);
    this.posAttr = new BufferAttribute(this.pos, 3);
    this.colAttr = new BufferAttribute(this.col, 3);
    this.geo.setAttribute("position", this.posAttr);
    this.geo.setAttribute("color", this.colAttr);
    const material = new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, fog: false });
    this.mesh = new Mesh(this.geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** Point `i` of the strip. `flat` lays the strip on the floor (it widens along z); otherwise it widens across the line of travel in the x/y plane. */
  set(i: number, x: number, y: number, z: number, width: number, flat: boolean, r: number, g: number, b: number): void {
    const prev = Math.max(0, i - 1);
    const next = Math.min(this.n - 1, i + 1);
    let nx = 0;
    let ny = 1;
    let nz = 0;
    if (flat) { ny = 0; nz = 1; } else {
      const tx = (this.pos[next * 6] ?? 0) + (this.pos[next * 6 + 3] ?? 0) - (this.pos[prev * 6] ?? 0) - (this.pos[prev * 6 + 3] ?? 0);
      const ty = (this.pos[next * 6 + 1] ?? 0) + (this.pos[next * 6 + 4] ?? 0) - (this.pos[prev * 6 + 1] ?? 0) - (this.pos[prev * 6 + 4] ?? 0);
      const len = Math.hypot(tx, ty);
      if (len > 1e-4) { nx = -ty / len; ny = tx / len; }
    }
    const k = i * 6;
    this.pos[k] = x + nx * width; this.pos[k + 1] = y + ny * width; this.pos[k + 2] = z + nz * width;
    this.pos[k + 3] = x - nx * width; this.pos[k + 4] = y - ny * width; this.pos[k + 5] = z - nz * width;
    this.col[k] = r; this.col[k + 1] = g; this.col[k + 2] = b;
    this.col[k + 3] = r; this.col[k + 4] = g; this.col[k + 5] = b;
  }

  /** Call once after setting every point. */
  commit(visible: boolean): void {
    this.mesh.visible = visible;
    if (!visible) return;
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
  }
}
