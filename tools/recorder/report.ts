/// <reference types="node" />
// The margins report: how close a recorded trace came to its move, condition by condition.
//   npx tsx tools/recorder/report.ts <trace file or folder>
// For each trace: the move its file name says, whether it fired and on which frame, and every condition of that
// move's detector with what was measured, the threshold and the margin in percent, smallest margin first.
// The conditions come from src/moves/measures.ts. docs/detector-tuning.md says how to read the table.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { MoveDef, PoseHistory } from "../../src/core/types";
import { createPoseInput } from "../../src/input/poseInput";
import { MEASURES, readMeasure } from "../../src/moves/measures";
import type { Reading } from "../../src/moves/measures";
import { pushFrame } from "../../src/pose/signals";
import { problems } from "./replay";
import { IDLE, loadTrace } from "./trace";
import type { StoredTrace, Trace } from "./trace";

export interface TraceReport {
  readonly move: string;
  readonly fired: boolean;
  /** The frame the move fired on or, for a miss, the frame that came closest. Counted from 1. */
  readonly frame: number;
  readonly ms: number;
  /** The surest the detector got, 0..1. */
  readonly peak: number;
  /** Every condition at that frame, in the order the detector checks them. */
  readonly readings: readonly Reading[];
}

/**
 * How near a frame is to firing, biggest first: the fewest conditions with nothing to measure (a start position
 * never seen), then the worst of the rest missing by the least, then the most conditions passed.
 */
const nearness = (readings: readonly Reading[]): number[] => [
  -readings.filter((reading) => reading.margin === -Infinity).length,
  Math.min(...readings.map((reading) => reading.margin).filter((margin) => margin !== -Infinity)),
  readings.filter((reading) => reading.passed).length,
];
const closer = (a: readonly Reading[], b: readonly Reading[]): boolean => {
  const [x, y] = [nearness(a), nearness(b)];
  const differs = x.findIndex((value, index) => value !== y[index]);
  return differs >= 0 && (x[differs] ?? 0) > (y[differs] ?? 0);
};

/** Null when the trace is labelled idle, or with a move that does not exist or has no measures. */
export function measureTrace(trace: Trace, moves: ReadonlyMap<string, MoveDef>, label = trace.move): TraceReport | null {
  const move = moves.get(label);
  const options = MEASURES[label];
  if (!move || !options) return null;
  const read = createPoseInput(moves);
  const sides = (history: PoseHistory) => options.map((option) => option.map((measure) => readMeasure(measure, history)));
  const best = (history: PoseHistory) => sides(history).reduce((a, b) => (closer(b, a) ? b : a));
  let history: PoseHistory = { frames: [], baseline: trace.baseline };
  let peak = 0;
  let closest: { frame: number; ms: number; readings: readonly Reading[] } | null = null;
  for (const [index, frame] of trace.frames.entries()) {
    history = pushFrame(history, frame);
    const input = read(history);
    peak = Math.max(peak, move.detect(history));
    const at = { frame: index + 1, ms: Math.round(frame.t), readings: best(history) };
    const fired = move.kind === "defend" ? input.held.has(move.id) : input.struck.some((strike) => strike.move === move.id);
    if (fired) return { move: label, fired: true, peak, ...at };
    if (!closest || closer(at.readings, closest.readings)) closest = at;
  }
  return closest && { move: label, fired: false, peak, ...closest };
}

function number(value: number): string {
  if (Number.isNaN(value)) return "none";
  if (!Number.isFinite(value)) return "never";
  return Math.abs(value) >= 20 ? value.toFixed(0) : value.toFixed(2);
}

function percent({ margin, passed: ok }: Reading): string {
  if (!Number.isFinite(margin)) return margin > 0 ? "clear" : "missed";
  if (Math.round(margin) === 0) return ok ? "+0%" : "-0%";
  return `${margin >= 0 ? "+" : ""}${margin.toFixed(0)}%`;
}

const needs = (reading: Reading): string =>
  `${reading.need === "min" ? ">" : "<"}${reading.strict ? " " : "="} ${number(reading.threshold)}`;

/** The report for one trace as plain text. `file` is its name; the move is the part before the first "-". */
export function reportText(file: string, trace: Trace, moves: ReadonlyMap<string, MoveDef>): string {
  const label = basename(file).split("-")[0] ?? trace.move;
  const frames = String(trace.frames.length);
  const report = measureTrace(trace, moves, label);
  if (!report) {
    if (label !== IDLE) return `${file}: ${label}: ${moves.has(label) ? "no measures in src/moves/measures.ts" : "there is no move with that name"}`;
    const found = problems({ ...trace, move: IDLE }, moves);
    return `${file}: idle: ${found.length === 0 ? "nothing fired, as it should" : found.join("; ")}`;
  }
  const at = `frame ${String(report.frame)} of ${frames} (${String(report.ms)} ms)`;
  const lines = [report.fired
    ? `${file}: ${label} FIRED on ${at}`
    : `${file}: ${label} DID NOT FIRE (peak confidence ${report.peak.toFixed(2)}, needs 0.70); closest on ${at}`];
  const failed = report.readings.find((reading) => !reading.passed);
  if (!report.fired) {
    lines.push(failed
      ? `  first failed: ${failed.name}: ${number(failed.value)}, needs ${needs(failed)} (${percent(failed)})`
      : "  every condition passed at that frame: src/moves/measures.ts is out of step with the detector");
  }
  const rows = [...report.readings].sort((a, b) => a.margin - b.margin).map((reading) =>
    [percent(reading), number(reading.value), needs(reading), reading.name]);
  for (const row of [["margin", "measured", "threshold", "condition"], ...rows]) {
    lines.push(`  ${(row[0] ?? "").padStart(7)}  ${(row[1] ?? "").padStart(8)}  ${(row[2] ?? "").padEnd(9)}  ${row[3] ?? ""}`);
  }
  return lines.join("\n");
}

/** The moves, read from the folder: `src/moves/registry.ts` needs Vite, and this runs under plain Node. */
async function loadMoves(): Promise<Map<string, MoveDef>> {
  const defs = join(dirname(fileURLToPath(import.meta.url)), "../../src/moves/defs");
  const moves = new Map<string, MoveDef>();
  for (const file of readdirSync(defs).filter((name) => name.endsWith(".ts")).sort()) {
    const { move } = (await import(pathToFileURL(join(defs, file)).href)) as { move: MoveDef };
    moves.set(move.id, move);
  }
  return moves;
}

async function main(target: string | undefined): Promise<void> {
  if (target === undefined) throw new Error("usage: npx tsx tools/recorder/report.ts <trace file or folder>");
  const files = statSync(target).isDirectory()
    ? readdirSync(target).filter((name) => name.endsWith(".json")).sort().map((name) => join(target, name))
    : [target];
  const moves = await loadMoves();
  for (const path of files) {
    let text: string;
    try {
      text = reportText(basename(path), loadTrace(JSON.parse(readFileSync(path, "utf8")) as StoredTrace), moves);
    } catch (error) {
      text = `${basename(path)}: not a usable trace: ${error instanceof Error ? error.message : String(error)}`;
    }
    process.stdout.write(`${text}\n\n`);
  }
}

if (basename(process.argv[1] ?? "") === "report.ts") {
  main(process.argv[2]).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
