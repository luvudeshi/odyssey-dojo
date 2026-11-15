import { type RefObject, useLayoutEffect, useRef, useState } from "react";

export const prefersReducedMotion = (): boolean =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Device pixel ratio, snapped to quarters so a cached bitmap is shared between nearly equal screens. */
export const pixelRatio = (): number => Math.min(3, Math.max(1, Math.round((window.devicePixelRatio || 1) * 4) / 4));

export interface Box { w: number; h: number }

/** Whole-pixel size of an element, kept current. Zero until measured. */
export function useBoxSize<T extends HTMLElement>(): [RefObject<T | null>, Box] {
  const ref = useRef<T | null>(null);
  const [box, setBox] = useState<Box>({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = (): void => {
      const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
      setBox((b) => (b.w === w && b.h === h ? b : { w, h }));
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => { ro.disconnect(); };
  }, []);
  return [ref, box];
}
