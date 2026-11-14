// Plays a recorded trace through the move detectors exactly as the game does, and says what fired.
// Pure: the recorder page uses it to check a take on the spot, and tests/moves/replay.test.ts uses it on the files.
import type { MoveDef, PoseHistory } from "../../src/core/types";
import { createPoseInput } from "../../src/input/poseInput";
import { pushFrame } from "../../src/pose/signals";
import { IDLE } from "./trace";
import type { Trace } from "./trace";

export interface ReplayResult {
  /** Every strike that fired, in order. A strike listed twice fired twice. */
  readonly strikes: readonly string[];
  /** Every defend move that was held on at least one frame. */
  readonly held: readonly string[];
  /** The highest confidence each move reached, for tuning. */
  readonly peaks: Readonly<Record<string, number>>;
}

export function replay(trace: Trace, moves: ReadonlyMap<string, MoveDef>): ReplayResult {
  const read = createPoseInput(moves);
  const strikes: string[] = [];
  const held = new Set<string>();
  const peaks: Record<string, number> = {};
  let history: PoseHistory = { frames: [], baseline: trace.baseline };
  for (const frame of trace.frames) {
    history = pushFrame(history, frame);
    const input = read(history);
    for (const strike of input.struck) strikes.push(strike.move);
    for (const id of input.held) held.add(id);
    for (const move of moves.values()) peaks[move.id] = Math.max(peaks[move.id] ?? 0, move.detect(history));
  }
  return { strikes, held: [...held], peaks };
}

/**
 * What is wrong with a take, in plain words, or an empty list when it is good.
 * A strike must fire once and alone. A defend move must be held, with no strike. Idle must fire and hold nothing.
 */
export function problems(trace: Trace, moves: ReadonlyMap<string, MoveDef>): string[] {
  const result = replay(trace, moves);
  const found: string[] = [];
  const peak = (id: string) => (result.peaks[id] ?? 0).toFixed(2);
  if (trace.move === IDLE) {
    for (const id of result.strikes) found.push(`${id} fired while idle (peak ${peak(id)})`);
    for (const id of result.held) found.push(`${id} was held while idle (peak ${peak(id)})`);
    return found;
  }
  const labelled = moves.get(trace.move);
  if (!labelled) return [`there is no move called ${trace.move}`];
  if (labelled.kind === "defend") {
    if (!result.held.includes(labelled.id)) found.push(`${labelled.id} was never held (peak ${peak(labelled.id)}, needs 0.70)`);
  } else {
    const times = result.strikes.filter((id) => id === labelled.id).length;
    if (times === 0) found.push(`${labelled.id} did not fire (peak ${peak(labelled.id)}, needs 0.70)`);
    if (times > 1) found.push(`${labelled.id} fired ${String(times)} times, not once`);
  }
  for (const id of new Set(result.strikes)) {
    if (id !== labelled.id) found.push(`${id} also fired (peak ${peak(id)})`);
  }
  return found;
}
