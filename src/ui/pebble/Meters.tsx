import { useEffect, useMemo, useRef } from "react";
import { MeterView } from "./MeterView";
import { type LitColour, type Meter, barMeter, dotsMeter, looseAt, loosePebbles, ringMeter } from "./meter";
import { PAL } from "./palette";
import { pixelRatio, prefersReducedMotion } from "./hooks";
import { drawStone } from "./draw";
import { pick } from "./stones";

export type MeterTone = "player" | "enemy" | "power" | "slate" | "ochre";

const TONES: Record<MeterTone, LitColour> = {
  player: (k, r) => (r() < 0.14 ? pick(PAL.cream, r) : pick(PAL.ochre, r)),
  enemy: (k, r) => (k < 0.2 && r() < 0.6 ? pick(PAL.ochre, r) : pick(PAL.terra, r)),
  power: (k, r) => pick(PAL.ochre, r),
  slate: (k, r) => pick(PAL.slate, r),
  ochre: (k, r) => pick(PAL.ochre, r),
};
const GLOW: LitColour = (k, r) => (r() < 0.4 ? pick(PAL.cream, r) : pick(PAL.ochre, r));

/** Sizes a canvas for the meter and returns a view that paints value changes. */
function useMeter(meter: Meter, value: number): { canvas: React.RefObject<HTMLCanvasElement | null>; view: React.RefObject<MeterView | null> } {
  const canvas = useRef<HTMLCanvasElement | null>(null), view = useRef<MeterView | null>(null);
  const first = useRef(value);
  useEffect(() => {
    const el = canvas.current, ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const dpr = pixelRatio();
    el.width = Math.ceil(meter.w * dpr); el.height = Math.ceil(meter.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const v = new MeterView(ctx, meter);
    v.set(first.current);
    view.current = v;
    return () => { view.current = null; };
  }, [meter]);
  useEffect(() => { first.current = value; view.current?.set(value); }, [value, meter]);
  return { canvas, view };
}

export interface PebbleBarProps {
  /** 0 to 1. */
  value: number;
  /** CSS pixels; the bar uses the whole number of stones that fits. */
  width: number;
  tone?: MeterTone;
  /** Stone diameter in px. */
  d?: number;
  rows?: number;
  /** -1 fills from the right (the monster's bar). */
  dir?: 1 | -1;
  seed?: number;
  /** Add a cream glow to the stones (power full). */
  glow?: boolean;
  /** Pebbles that fall loose below the bar when the value drops. Off under prefers-reduced-motion. */
  knock?: boolean;
  label: string;
  className?: string;
}

/** A bar filled stone by stone. Repaints only the stones a change flips. */
export function PebbleBar(props: PebbleBarProps) {
  const { width, tone = "player", d = 9.5, rows = 2, dir = 1, seed = 11, glow = false } = props;
  const meter = useMemo(() => barMeter({ width, d, rows, dir, seed, lit: glow ? GLOW : TONES[tone] }), [width, d, rows, dir, seed, tone, glow]);
  const { canvas } = useMeter(meter, props.value);
  const loose = useRef<HTMLCanvasElement | null>(null), prev = useRef(props.value), raf = useRef(0), epoch = useRef(0);
  const knock = props.knock !== false;
  useEffect(() => {
    const from = prev.current;
    prev.current = props.value;
    const el = loose.current, ctx = el?.getContext("2d");
    if (!knock || !el || !ctx || prefersReducedMotion()) return;
    const pebbles = loosePebbles(meter, from, props.value, ++epoch.current * 7919, TONES[tone]);
    if (pebbles.length === 0) return;
    const dpr = pixelRatio(), t0 = performance.now(), span = 1000;
    el.width = Math.ceil(meter.w * dpr); el.height = Math.ceil(44 * dpr);
    cancelAnimationFrame(raf.current);
    const step = (now: number): void => {
      const p = Math.min(1, (now - t0) / span);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, meter.w, 44);
      for (const l of pebbles) {
        const at = looseAt(l, p);
        drawStone(ctx, { x: l.x, y: at.y - meter.h, a: l.size / 2, b: l.size / 2.4, rot: l.x, color: l.color, alpha: at.alpha, flat: false });
      }
      if (p < 1) raf.current = requestAnimationFrame(step);
      else ctx.clearRect(0, 0, meter.w, 44);
    };
    raf.current = requestAnimationFrame(step);
  }, [props.value, meter, tone, knock]);
  useEffect(() => () => { cancelAnimationFrame(raf.current); }, []);
  return (
    <div className={`pb-meter ${props.className ?? ""}`} role="meter" aria-label={props.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(props.value * 100)} style={{ width: meter.w, height: meter.h }}>
      <canvas ref={canvas} aria-hidden="true" style={{ width: meter.w, height: meter.h }} />
      {knock && <canvas ref={loose} aria-hidden="true" className="pb-loose" style={{ width: meter.w, height: 44, top: meter.h }} />}
    </div>
  );
}

export interface PebbleDotsProps {
  value: number;
  n?: number;
  d?: number;
  tone?: MeterTone;
  glow?: boolean;
  /** The lead trough round the dots. Off for a timer set inside a card. */
  trough?: boolean;
  seed?: number;
  label: string;
  className?: string;
}

/** A row of stones for timers and the power meter. */
export function PebbleDots(props: PebbleDotsProps) {
  const { n = 20, d = 12, tone = "ochre", glow = false, trough = true, seed = 41 } = props;
  const meter = useMemo(() => dotsMeter({ n, d, seed, trough, lit: glow ? GLOW : TONES[tone] }), [n, d, seed, trough, tone, glow]);
  const { canvas } = useMeter(meter, props.value);
  return (
    <div className={`pb-meter ${props.className ?? ""}`} role="meter" aria-label={props.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(props.value * 100)} style={{ width: meter.w, height: meter.h }}>
      <canvas ref={canvas} aria-hidden="true" style={{ width: meter.w, height: meter.h }} />
    </div>
  );
}

export interface PebbleRingProps { value: number; radius?: number; n?: number; d?: number; tone?: MeterTone; seed?: number; label: string; className?: string }

/** A ring of stones that lights clockwise from the top: a round timer. */
export function PebbleRing(props: PebbleRingProps) {
  const { radius = 22, n = 24, d = 7, tone = "ochre", seed = 5 } = props;
  const meter = useMemo(() => ringMeter({ n, radius, d, seed, lit: TONES[tone] }), [n, radius, d, seed, tone]);
  const { canvas } = useMeter(meter, props.value);
  return (
    <div className={`pb-meter ${props.className ?? ""}`} role="meter" aria-label={props.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(props.value * 100)} style={{ width: meter.w, height: meter.h }}>
      <canvas ref={canvas} aria-hidden="true" style={{ width: meter.w, height: meter.h }} />
    </div>
  );
}
