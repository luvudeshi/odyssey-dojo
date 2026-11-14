// The file format for a recorded pose trace: what the recorder page downloads and what tests/moves/replay.test.ts
// reads. Pure, so the page and the test share it. Points are stored as [x, y, z, visibility], rounded, to keep
// three seconds of landmarks at about 150 kB.
import type { Baseline, Landmark, PoseFrame } from "../../src/core/types";

export const TRACE_VERSION = 1;
/** The label for a recording of somebody standing still or moving about without making any move. */
export const IDLE = "idle";

type Point = readonly [x: number, y: number, z: number, visibility: number];

interface StoredFrame {
  readonly t: number;
  readonly image: readonly Point[];
  readonly world: readonly Point[];
}

export interface StoredTrace {
  readonly version: number;
  /** A move id from src/moves/defs, or "idle". */
  readonly move: string;
  readonly person: string;
  readonly n: number;
  /** The neutral stance measured during the countdown, as the game measures it at calibration. */
  readonly baseline: Baseline | null;
  readonly frames: readonly StoredFrame[];
}

export interface Trace {
  readonly move: string;
  readonly person: string;
  readonly n: number;
  readonly baseline: Baseline | null;
  readonly frames: readonly PoseFrame[];
}

function round(value: number, places: number): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function pack(points: readonly Landmark[]): Point[] {
  return points.map((p) => [round(p.x, 4), round(p.y, 4), round(p.z, 4), round(p.visibility, 2)]);
}

function unpack(points: readonly Point[]): Landmark[] {
  return points.map(([x, y, z, visibility]) => ({ x, y, z, visibility }));
}

/** Letters, digits and underscores only, lower case, so the file name splits cleanly on "-". */
export function cleanName(text: string): string {
  const cleaned = text.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned === "" ? "someone" : cleaned;
}

/** `<move>-<person>-<n>.json` */
export function traceFileName(trace: { move: string; person: string; n: number }): string {
  return `${cleanName(trace.move)}-${cleanName(trace.person)}-${String(trace.n)}.json`;
}

/** Times are stored from zero so two recordings of the same move line up. */
export function storeTrace(trace: Trace): StoredTrace {
  const start = trace.frames[0]?.t ?? 0;
  return {
    version: TRACE_VERSION,
    move: cleanName(trace.move),
    person: cleanName(trace.person),
    n: trace.n,
    baseline: trace.baseline,
    frames: trace.frames.map((frame) => ({
      t: round(frame.t - start, 1),
      image: pack(frame.image),
      world: pack(frame.world),
    })),
  };
}

/** Reads a stored trace back into frames. Throws with a plain reason when the file is not a usable trace. */
export function loadTrace(stored: StoredTrace): Trace {
  if (stored.version !== TRACE_VERSION) throw new Error(`trace version ${String(stored.version)} is not ${String(TRACE_VERSION)}`);
  if (stored.frames.length === 0) throw new Error("trace has no frames");
  stored.frames.forEach((frame, index) => {
    if (frame.image.length !== 33 || frame.world.length !== 33) throw new Error(`frame ${String(index)} does not have 33 points`);
    const before = stored.frames[index - 1];
    if (before && frame.t <= before.t) throw new Error(`frame ${String(index)} is not later than the one before`);
  });
  return {
    move: stored.move,
    person: stored.person,
    n: stored.n,
    baseline: stored.baseline,
    frames: stored.frames.map((frame) => ({ t: frame.t, image: unpack(frame.image), world: unpack(frame.world) })),
  };
}
