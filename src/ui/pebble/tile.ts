// Seamless pebble ground as a small repeating tile. A big panel is then one CSS background, not thousands of stones.
import { drawWrapped, newCanvas } from "./draw";
import { PAL, type Palette } from "./palette";
import { tileStones } from "./stones";

export type GroundTone = "ground" | "dusk" | "blood" | "olive";
const BASE: Record<GroundTone, string> = { ground: "#0d0a09", dusk: "#10181d", blood: "#1f0e0b", olive: "#232a14" };
const COLS: Record<GroundTone, Palette> = { ground: PAL.ground, dusk: PAL.dusk, blood: PAL.blood, olive: PAL.olive };
const TILE = 192;
const urls = new Map<GroundTone, string>();

/** A data URL for the tone's tile (drawn once). Null where there is no canvas. */
export function groundTile(tone: GroundTone): string | null {
  const hit = urls.get(tone);
  if (hit) return hit;
  const made = newCanvas(TILE, TILE, 1);
  if (!made) return null;
  made.ctx.fillStyle = BASE[tone];
  made.ctx.fillRect(0, 0, TILE, TILE);
  drawWrapped(made.ctx, tileStones(TILE, TILE, { seed: 17 + tone.length, size: tone === "olive" ? 5 : 7, col: COLS[tone] }), TILE, TILE);
  const url = `url("${made.canvas.toDataURL("image/png")}")`;
  urls.set(tone, url);
  return url;
}

/** Sets --pebble-ground, --pebble-dusk, --pebble-blood and --pebble-olive on :root. Safe to call again. */
export function installGround(): void {
  const root = document.documentElement;
  for (const tone of ["ground", "dusk", "blood", "olive"] as const) {
    const key = `--pebble-${tone}`;
    if (root.style.getPropertyValue(key)) continue;
    const url = groundTile(tone);
    if (url) root.style.setProperty(key, url);
  }
}
