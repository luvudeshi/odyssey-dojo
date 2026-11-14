// Every recorded pose trace in tests/fixtures/poses/ is played through the detectors as the game would.
// A file named <move>-<person>-<n>.json must fire that move once and no other strike; idle-* must fire nothing.
// To add a trace, record it at /tools/recorder/index.html and drop the file in the folder: no test to write.
import { expect, test } from "vitest";
import { MOVES } from "../../src/moves/registry";
import { EMPTY_HISTORY, pushFrame } from "../../src/pose/signals";
import { problems, replay } from "../../tools/recorder/replay";
import { IDLE, cleanName, loadTrace, storeTrace, traceFileName } from "../../tools/recorder/trace";
import type { StoredTrace, Trace } from "../../tools/recorder/trace";
import { DOWN, GUARD, NEUTRAL, PUNCH, COCKED, pose, sequence, standing } from "../helpers/poses";

const FILES = import.meta.glob<StoredTrace>("../fixtures/poses/*.json", { eager: true, import: "default" });
const TRACES = Object.entries(FILES).map(([path, stored]) => ({ file: path.split("/").at(-1) ?? path, stored }));

test("there are traces to replay, and each is named for what it holds", () => {
  expect(TRACES.length).toBeGreaterThanOrEqual(3);
  for (const { file, stored } of TRACES) {
    expect(traceFileName(stored), file).toBe(file);
    expect(stored.move === IDLE || MOVES.has(stored.move), `${file}: no move called ${stored.move}`).toBe(true);
  }
});

test.each(TRACES)("$file reads as its label and nothing else", ({ stored }) => {
  expect(problems(loadTrace(stored), MOVES)).toEqual([]);
});

/** A made-up take: a second standing still for the baseline, then the given frames. */
function madeUp(move: string, frames: ReturnType<typeof sequence>): Trace {
  const still = standing(1000);
  const baseline = still.reduce(pushFrame, EMPTY_HISTORY).baseline;
  return { move, person: "test", n: 1, baseline, frames };
}

// The player waits in a guard, jabs once and comes back to the guard. (Hands that shoot up from the waist to the
// chin read as a rising palm or an uppercut, so a made-up take starts with the hands already up.)
const JAB = sequence([
  { t: 0, pose: pose(COCKED, DOWN) },
  { t: 700, pose: pose(COCKED, DOWN) },
  { t: 860, pose: pose(PUNCH, DOWN) },
  { t: 1200, pose: pose(COCKED, DOWN) },
  { t: 2340, pose: pose(COCKED, DOWN) },
]);

test("the checker catches a wrong label, a missing move and a move made twice", () => {
  expect(problems(madeUp("jab", JAB), MOVES)).toEqual([]);
  expect(replay(madeUp("jab", JAB), MOVES).strikes).toEqual(["jab"]);
  // The same motion labelled as something else, or as nothing.
  expect(problems(madeUp("hook", JAB), MOVES).join("; ")).toMatch(/hook did not fire.*jab also fired/);
  expect(problems(madeUp(IDLE, JAB), MOVES).join("; ")).toMatch(/jab fired while idle/);
  expect(problems(madeUp("no_such_move", JAB), MOVES)).toEqual(["there is no move called no_such_move"]);
  // Standing still labelled as a move.
  expect(problems(madeUp("jab", standing(3000)), MOVES).join("; ")).toMatch(/jab did not fire \(peak 0\.00/);
  expect(problems(madeUp("block", standing(3000)), MOVES).join("; ")).toMatch(/block was never held/);
  // Two jabs in one take.
  const twice = sequence([
    { t: 0, pose: pose(COCKED, DOWN) },
    { t: 700, pose: pose(COCKED, DOWN) },
    { t: 860, pose: pose(PUNCH, DOWN) },
    { t: 1200, pose: pose(COCKED, DOWN) },
    { t: 1360, pose: pose(PUNCH, DOWN) },
    { t: 1700, pose: pose(COCKED, DOWN) },
    { t: 2340, pose: pose(COCKED, DOWN) },
  ]);
  expect(problems(madeUp("jab", twice), MOVES).join("; ")).toMatch(/jab fired 2 times, not once/);
  // A guard held is a block, and holding a guard while "idle" is caught.
  const guard = sequence([{ t: 0, pose: NEUTRAL }, { t: 1300, pose: pose(GUARD) }, { t: 2100, pose: pose(GUARD) }, { t: 2340, pose: NEUTRAL }]);
  expect(problems(madeUp("block", guard), MOVES)).toEqual([]);
  expect(problems(madeUp(IDLE, guard), MOVES).join("; ")).toMatch(/block was held while idle/);
});

test("a trace survives being stored and loaded, and bad files are refused with a reason", () => {
  const trace = madeUp("jab", JAB.map((frame) => ({ ...frame, t: frame.t + 123456.789 })));
  const stored = JSON.parse(JSON.stringify(storeTrace(trace))) as StoredTrace;
  expect(stored.frames[0]?.t).toBe(0);
  const back = loadTrace(stored);
  expect(back.frames.length).toBe(trace.frames.length);
  expect(replay(back, MOVES).strikes).toEqual(["jab"]);
  expect(traceFileName({ move: "jab", person: " Ana María ", n: 3 })).toBe("jab-ana_mar_a-3.json");
  expect(cleanName("  ")).toBe("someone");

  expect(() => loadTrace({ ...stored, version: 99 })).toThrow(/version/);
  expect(() => loadTrace({ ...stored, frames: [] })).toThrow(/no frames/);
  const short = { ...stored, frames: stored.frames.map((frame, i) => (i === 2 ? { ...frame, image: frame.image.slice(0, 5) } : frame)) };
  expect(() => loadTrace(short)).toThrow(/frame 2 does not have 33 points/);
  const backwards = { ...stored, frames: stored.frames.map((frame, i) => (i === 3 ? { ...frame, t: 0 } : frame)) };
  expect(() => loadTrace(backwards)).toThrow(/frame 3 is not later/);
});
