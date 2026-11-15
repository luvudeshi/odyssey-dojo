// Jab, asked for: while the prompt is a jab, any clear movement of the left arm counts. On any other prompt the
// jab keeps the strict detector, so nothing here loosens the cross, the hook or the block.
import { expect, test } from "vitest";
import type { PoseFrame, PoseHistory } from "../../src/core/types";
import { ASK_GRACE_MS, createPoseInput } from "../../src/input/poseInput";
import { createMissWatch } from "../../src/input/missWatch";
import { MOVES } from "../../src/moves/registry";
import { EMPTY_HISTORY, pushFrame } from "../../src/pose/signals";
import { startDojo, tickDojo } from "../../src/coach";
import { loadTrace } from "../../tools/recorder/trace";
import type { StoredTrace } from "../../tools/recorder/trace";
import { LEFT_OUT, READY, RIGHT_OUT, STANDING, blend, bodyFrame, pose, recording } from "../poseFixture";
import type { Step } from "../poseFixture";
import { SEEDS, shaken } from "./looseMoves";

interface Seen { readonly t: number; readonly struck: readonly string[]; readonly miss: boolean }

/** The prompt asks for `ask` from the first frame at or after `from` ms. The pose input and MISS watch see it as the fight does. */
function run(frames: readonly PoseFrame[], ask: string | null, from: number, baseline: PoseHistory["baseline"] = null): Seen[] {
  const read = createPoseInput(MOVES);
  const watch = createMissWatch();
  let history: PoseHistory = EMPTY_HISTORY;
  return frames.map((frame) => {
    history = { ...pushFrame(history, frame), baseline: baseline ?? pushFrame(history, frame).baseline };
    const asked = frame.t >= from ? ask : null;
    const input = read(history, asked);
    return { t: frame.t, struck: input.struck.map((s) => s.move), miss: watch(asked, false, input, false, frame.t) };
  });
}
const strikes = (seen: readonly Seen[], move: string): number => seen.filter((s) => s.struck.includes(move)).length;
const misses = (seen: readonly Seen[]): number => seen.filter((s) => s.miss).length;

/** The prompt opens after a 600 ms wait in the guard; `steps` is what the player does after that, from 300 ms in. */
const ASKED_AT = 20 * 33 + 600;
const take = (steps: readonly Step[], wait: readonly Step[] = [[READY, 600], [READY, 300]]): { frames: PoseFrame[]; from: number } =>
  ({ frames: recording([...wait, ...steps]), from: ASKED_AT });

const SMALL = pose(LEFT_OUT, READY);
const small = take([[blend(READY, SMALL, 0.3), 150], [blend(READY, SMALL, 0.3), 500]], [[READY, 600], [READY, 450]]);

test("a small left-arm movement is a jab when a jab is asked for (a) and is not on the strict detector (b)", () => {
  expect(strikes(run(small.frames, "jab", small.from), "jab")).toBe(1);
  expect(strikes(run(small.frames, null, small.from), "jab")).toBe(0);
  expect(strikes(run(small.frames, "cross", small.from), "jab")).toBe(0);
  expect(strikes(run(small.frames, "hook", small.from), "jab")).toBe(0);
});

test("a hand lifted a hand's width from a hanging arm is a jab when asked for", () => {
  const lift = pose({ leftFore: [0.1, 0.4, -0.9] });
  const t = take([[lift, 200], [lift, 500]], [[STANDING, 600], [STANDING, 300]]);
  expect(strikes(run(t.frames, "jab", t.from), "jab")).toBe(1);
  expect(strikes(run(t.frames, null, t.from), "jab")).toBe(0);
});

test("a small movement flashes no MISS on a jab prompt (g)", () => {
  expect(misses(run(small.frames, "jab", small.from))).toBe(0);
});

test.each(SEEDS)("seed %i: standing still with random shake of a tenth of a shoulder width strikes nothing and flashes no MISS (c)", (seed) => {
  for (const stance of [STANDING, READY]) {
    const seen = run(shaken(recording([[stance, 33], [stance, 3000]]), seed, 0.1), "jab", 0);
    expect(seen.flatMap((s) => s.struck)).toEqual([]);
    expect(misses(seen)).toBe(0);
  }
});

test("the whole body shifting sideways and ducking, arms kept in place on the body, is no jab (d)", () => {
  const shift = pose({ step: 0.5, drop: 0.25 }, READY);
  const t = take([[shift, 250], [shift, 500]]);
  const seen = run(t.frames, "jab", t.from);
  expect(strikes(seen, "jab")).toBe(0);
  expect(misses(seen)).toBe(0);
});

test("only the right arm moving on a jab prompt is no jab and still flashes MISS; the cross still reads (e)", () => {
  const right = pose(RIGHT_OUT, READY);
  const t = take([[right, 130], [right, 300], [READY, 200]]);
  const seen = run(t.frames, "jab", t.from);
  expect(strikes(seen, "jab")).toBe(0);
  expect(strikes(seen, "cross")).toBe(1);
  expect(misses(seen)).toBe(1);
  const small = take([[blend(READY, pose(RIGHT_OUT, READY), 0.5), 150], [blend(READY, pose(RIGHT_OUT, READY), 0.5), 500]]);
  expect(strikes(run(small.frames, "jab", small.from), "jab")).toBe(0);
});

test("the arms coming down in the first 250 ms of the prompt are no jab; a left-arm movement after that is (f)", () => {
  const down = take([[STANDING, 200], [STANDING, 100]], [[READY, 900]]);
  expect(ASK_GRACE_MS).toBe(250);
  expect(strikes(run(down.frames, "jab", 20 * 33 + 900), "jab")).toBe(0);
  const then = take([[STANDING, 200], [STANDING, 300], [blend(STANDING, pose(LEFT_OUT), 0.3), 150], [blend(STANDING, pose(LEFT_OUT), 0.3), 400]], [[READY, 900]]);
  const seen = run(then.frames, "jab", 20 * 33 + 900);
  console.info(seen.filter((x) => x.struck.length).map((x) => `${x.t}:${x.struck}`));
  expect(strikes(seen, "jab")).toBe(1);
});

const FILES = import.meta.glob<StoredTrace>("../fixtures/poses/*.json", { eager: true, import: "default" });
const trace = (name: string) => {
  const found = Object.entries(FILES).find(([path]) => path.endsWith(name));
  if (!found) throw new Error(`no pose fixture ${name}`);
  return loadTrace(found[1]);
};

test("the idle recording on a jab prompt strikes nothing (h)", () => {
  const idle = trace("idle-madeup-1.json");
  const seen = run(idle.frames, "jab", 0, idle.baseline);
  expect(seen.flatMap((s) => s.struck)).toEqual([]);
  expect(misses(seen)).toBe(0);
});

test("the block recording on a jab prompt (h, reported)", () => {
  const block = trace("block-madeup-1.json");
  const seen = run(block.frames, "jab", 0, block.baseline);
  console.info("block on jab prompt: jab strikes", strikes(seen, "jab"), "misses", misses(seen));
  expect(strikes(seen, "jab")).toBe(0);
});

test("the dojo counts a small left-arm movement as a rep of the jab", () => {
  let state = startDojo({ moves: ["jab"], reps: 1 }, 0);
  for (let i = 0; i < 60; i++) state = tickDojo(state, i * 33, bodyFrame(i * 33, READY));
  expect(state.phase).toBe("show");
  state = tickDojo(state, 2000, null);
  expect(state.phase).toBe("go");
  const body = blend(READY, SMALL, 0.3);
  for (let i = 61; i <= 150 && state.phase === "go"; i++) {
    state = tickDojo(state, i * 33 + 20, bodyFrame(i * 33, i < 75 ? READY : body));
  }
  expect(state.phase).toBe("result");
  expect(state.last?.result.counted).toBe(true);
  console.info("dojo grade", state.last?.grade.tier, state.last?.quality);
  expect(state.last?.grade.tier).not.toBe("needs_work");
});
