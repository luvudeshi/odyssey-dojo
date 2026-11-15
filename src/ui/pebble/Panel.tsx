import { type ElementType, type ReactNode, useEffect, useMemo } from "react";
import { drawLayout } from "./draw";
import { useBoxSize } from "./hooks";
import { PebbleCanvas } from "./PebbleCanvas";
import { type GroundTone, installGround } from "./tile";
import { makeRng, newLayout } from "./stones";
import { straightBase, waveBand } from "./wave";

/** The wave-scroll border: a looping line of stones, as wide as its parent and 26 px tall. */
export function WaveBorder(props: { className?: string; size?: number }) {
  const [ref, box] = useBoxSize<HTMLDivElement>(), size = props.size ?? 3.6, h = 26;
  const draw = useMemo(() => (ctx: CanvasRenderingContext2D): void => {
    const l = newLayout();
    waveBand(l, makeRng(5), straightBase(4, h / 2), Math.max(60, box.w - 8), { size, r: size * 1.4 });
    drawLayout(ctx, l);
  }, [box.w, size]);
  return (
    <div ref={ref} className={`pb-wave ${props.className ?? ""}`} style={{ height: h }}>
      {box.w > 0 && <PebbleCanvas width={box.w} height={h} cacheKey={`wave|${String(size)}`} draw={draw} />}
    </div>
  );
}

export interface PanelProps {
  children?: ReactNode;
  /** The pebble ground under the panel. */
  tone?: GroundTone;
  /** A wave-scroll along the top edge. */
  ornament?: boolean;
  as?: ElementType;
  className?: string;
}

/** A dark pebble-ground panel in a thin lead frame. The ground is one repeating CSS tile, so it costs nothing per panel. */
export function Panel(props: PanelProps) {
  const { tone = "ground", ornament = false, as: Tag = "section" } = props;
  useEffect(() => { installGround(); }, []);
  return (
    <Tag className={`pb-panel pb-panel--${tone} ${props.className ?? ""}`}>
      {ornament && <WaveBorder className="pb-panel__wave" />}
      {props.children}
    </Tag>
  );
}
