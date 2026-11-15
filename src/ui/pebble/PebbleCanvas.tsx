import { type CSSProperties, useEffect, useRef } from "react";
import { cachedBitmap } from "./draw";
import { pixelRatio } from "./hooks";

export interface PebbleCanvasProps {
  /** CSS pixels. */
  width: number;
  height: number;
  /** Names what is drawn. The bitmap is redrawn only when this, the size or the pixel ratio changes. */
  cacheKey: string;
  draw: (ctx: CanvasRenderingContext2D) => void;
  className?: string;
  style?: CSSProperties;
}

/** A static piece: drawn once into a cached bitmap, then only composited. Decorative, so hidden from assistive tech. */
export function PebbleCanvas(props: PebbleCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(props.draw);
  useEffect(() => { drawRef.current = props.draw; });
  const { width, height, cacheKey } = props;
  useEffect(() => {
    const canvas = ref.current, ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || width < 1 || height < 1) return;
    const dpr = pixelRatio(), bmp = cachedBitmap(cacheKey, width, height, dpr, (c) => { drawRef.current(c); });
    if (!bmp) return;
    canvas.width = bmp.width; canvas.height = bmp.height;
    ctx.drawImage(bmp, 0, 0);
  }, [width, height, cacheKey]);
  return <canvas ref={ref} aria-hidden="true" className={props.className} style={{ width, height, ...props.style }} />;
}
