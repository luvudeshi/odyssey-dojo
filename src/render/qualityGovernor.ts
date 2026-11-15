// Drops the graphics to "low" for the rest of the session when the machine cannot keep up.
// With the camera on, pose detection and the 3D render share the GPU: on "high" the measured frames
// were 25 to 40 ms long often enough to starve the pose model; on "low" they were steady at 60 fps.
import { useRef, useSyncExternalStore } from "react";
import { useFrame } from "@react-three/fiber";

/** A frame longer than this is slow (a 60 Hz frame is 16.7 ms; a 30 Hz frame, a pose frame on a busy GPU, is 33 ms). */
export const SLOW_MS = 25;
/** The window the share of slow frames is judged over. */
export const WINDOW_MS = 3000;
/** The share of slow frames in a window that drops the quality. A healthy run measured 0 to 1 percent. */
export const SLOW_SHARE = 0.08;
/** Frames in the first seconds are shader compiles and model loads, not the machine's speed. */
export const WARMUP_MS = 6000;
/** Slow windows in a row that drop the quality, so one load hitch never does. */
export const BAD_WINDOWS = 2;
/** A gap this long is a hidden tab or a pause, not a slow frame. */
const GAP_MS = 1000;

export interface FrameWindow {
  readonly frames: number;
  readonly slow: number;
  readonly ms: number;
  /** Slow windows just before this one. */
  readonly bad: number;
}

export const EMPTY_WINDOW: FrameWindow = { frames: 0, slow: 0, ms: 0, bad: 0 };

/** Adds one frame. Returns the next window and whether enough slow windows in a row say the machine cannot keep up. */
export function governorStep(window: FrameWindow, deltaMs: number): { readonly window: FrameWindow; readonly drop: boolean } {
  if (deltaMs > GAP_MS) return { window: EMPTY_WINDOW, drop: false };
  const next: FrameWindow = { ...window, frames: window.frames + 1, slow: window.slow + (deltaMs > SLOW_MS ? 1 : 0), ms: window.ms + deltaMs };
  if (next.ms < WINDOW_MS) return { window: next, drop: false };
  const bad = next.slow / next.frames >= SLOW_SHARE ? next.bad + 1 : 0;
  return { window: { ...EMPTY_WINDOW, bad }, drop: bad >= BAD_WINDOWS };
}

let autoLow = false;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export function setAutoLow(value: boolean): void {
  if (autoLow === value) return;
  autoLow = value;
  listeners.forEach((listener) => { listener(); });
}

export function useAutoLow(): boolean {
  return useSyncExternalStore(subscribe, () => autoLow, () => false);
}

/** Put inside the Canvas. Renders nothing. */
export function QualityGovernor() {
  const frames = useRef<FrameWindow>(EMPTY_WINDOW);
  // r3f's useFrame delta is in seconds.
  useFrame((state, delta) => {
    if (autoLow || state.clock.elapsedTime * 1000 < WARMUP_MS) return;
    const step = governorStep(frames.current, delta * 1000);
    frames.current = step.window;
    if (step.drop) setAutoLow(true);
  });
  return null;
}
