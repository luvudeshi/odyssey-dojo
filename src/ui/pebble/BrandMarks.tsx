import { drawLayout } from "./draw";
import { emblemLayout, logoLayout, logoSize } from "./brand";
import { PebbleCanvas } from "./PebbleCanvas";

/** The dark ground under the emblem, so it reads the same on a bright scene. */
const disk = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void => {
  ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fillStyle = "#15100e"; ctx.fill();
};

/** The emblem at `size` px square. Drawn once per size and cached. Below 140 px it uses the plain ring. */
export function Emblem(props: { size?: number; className?: string; label?: string }) {
  const size = Math.round(props.size ?? 160);
  return (
    <span className={`pb-emblem ${props.className ?? ""}`} role="img" aria-label={props.label ?? "Odyssey Dojo emblem"}>
      <PebbleCanvas width={size} height={size} cacheKey="emblem" draw={(ctx) => { disk(ctx, size / 2, size / 2, size * 0.49); drawLayout(ctx, emblemLayout(size)); }} />
    </span>
  );
}

/** The emblem with ODYSSEY DOJO beside it, `height` px tall. */
export function Logo(props: { height?: number; className?: string }) {
  const scale = (props.height ?? 160) / 344, { w, h } = logoSize(scale);
  return (
    <span className={`pb-logo ${props.className ?? ""}`} role="img" aria-label="Odyssey Dojo">
      <PebbleCanvas width={w} height={h} cacheKey="logo" draw={(ctx) => { disk(ctx, 170 * scale, 170 * scale, 148 * scale); drawLayout(ctx, logoLayout(scale)); }} />
    </span>
  );
}
