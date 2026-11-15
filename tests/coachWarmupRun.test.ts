// The warm-up run: phases, kept frames and what the skill check is handed. Made-up frames and times, no camera.
import { describe, expect, it } from "vitest";
import type { Assess, Assessment, WarmupStep } from "../src/coach/contract";
import { MAX_FRAMES, MIN_READY_FRAMES, READY_MS, finish, nobodySeen, plainName, resultLines, startRun, tick, totalMs } from "../src/coach/ui/run";
import type { RunState } from "../src/coach/ui/run";
import type { PoseFrame } from "../src/core/types";

const STEPS: readonly WarmupStep[] = [
  { id: "a", moveId: "jab", say: "Punch", ms: 3000 },
  { id: "b", moveId: "block", say: "Hands up", ms: 2000 },
  { id: "c", moveId: "dodge_left", say: "Step left", ms: 4000 },
];

function frame(t: number): PoseFrame {
  return { t, image: [], world: [] };
}

/** Ticks every `everyMs` from `fromMs` up to (not including) `toMs`, with a frame stamped `now + offset` each time. */
function play(state: RunState, fromMs: number, toMs: number, everyMs = 100, offset = 0): RunState {
  let next = state;
  for (let now = fromMs; now < toMs; now += everyMs) next = tick(next, now, frame(now + offset));
  return next;
}

const BLANK: Assessment = { level: "average", focus: [], strong: [], habits: [], steps: [] };

describe("the warm-up run", () => {
  it("starts in the ready phase with the whole run ahead", () => {
    const run = startRun(STEPS, 5000);
    expect(run).toMatchObject({ phase: "ready", stepIndex: -1, msLeft: READY_MS, phaseMs: READY_MS, totalMsLeft: READY_MS + 9000 });
    expect(run.frames).toEqual([]);
    expect(totalMs(STEPS)).toBe(READY_MS + 9000);
    expect(totalMs(STEPS, 500)).toBe(9500);
  });

  it("moves through ready, each step and done at the right times", () => {
    const start = startRun(STEPS, 1000);
    const at = (ms: number): RunState => tick(start, 1000 + ms, null);
    expect(at(1999)).toMatchObject({ phase: "ready", stepIndex: -1, msLeft: 1, totalMsLeft: 9001 });
    expect(at(2000)).toMatchObject({ phase: "step", stepIndex: 0, msLeft: 3000, phaseMs: 3000, totalMsLeft: 9000 });
    expect(at(4999)).toMatchObject({ phase: "step", stepIndex: 0, msLeft: 1 });
    expect(at(5000)).toMatchObject({ phase: "step", stepIndex: 1, msLeft: 2000, phaseMs: 2000 });
    expect(at(7000)).toMatchObject({ phase: "step", stepIndex: 2, msLeft: 4000, totalMsLeft: 4000 });
    expect(at(10999)).toMatchObject({ phase: "step", stepIndex: 2, msLeft: 1, totalMsLeft: 1 });
    expect(at(11000)).toMatchObject({ phase: "done", stepIndex: 3, msLeft: 0, totalMsLeft: 0 });
  });

  it("takes a shorter ready phase when asked", () => {
    const start = startRun(STEPS, 0, 500);
    expect(tick(start, 499, null).phase).toBe("ready");
    expect(tick(start, 500, null)).toMatchObject({ phase: "step", stepIndex: 0 });
    expect(start.startedAtMs).toBe(500);
  });

  it("keeps the frames of the ready phase along with the rest, oldest first", () => {
    const run = play(startRun(STEPS, 0), 0, 3000);
    expect(run.frames).toHaveLength(30);
    expect(run.frames[0]?.t).toBe(0);
    expect(run.frames.at(-1)?.t).toBe(2900);
    expect(run.readyFrames).toBe(20);
  });

  it("ignores null frames", () => {
    let run = startRun(STEPS, 0);
    run = tick(run, 100, null);
    run = tick(run, 200, frame(200));
    run = tick(run, 300, null);
    expect(run.frames.map((each) => each.t)).toEqual([200]);
    expect(run.readyFrames).toBe(1);
  });

  it("gives the start of the first step as startedAtMs", () => {
    expect(startRun(STEPS, 700).startedAtMs).toBe(700 + READY_MS);
    expect(play(startRun(STEPS, 700), 700, 9000).startedAtMs).toBe(700 + READY_MS);
  });

  it("puts startedAtMs on the frames' clock when that clock differs from the caller's", () => {
    const run = play(startRun(STEPS, 700), 700, 4000, 100, 50_000);
    expect(run.clockOffsetMs).toBe(50_000);
    expect(run.startedAtMs).toBe(700 + READY_MS + 50_000);
    const firstStepFrame = run.frames.find((each) => each.t >= run.startedAtMs);
    expect(firstStepFrame?.t).toBe(2700 + 50_000);
  });

  it("never keeps more than the cap, and drops the oldest", () => {
    const long: readonly WarmupStep[] = [{ id: "long", moveId: "jab", say: "Punch", ms: 60_000 }];
    const run = play(startRun(long, 0), 0, 30_000, 10);
    expect(run.frames).toHaveLength(MAX_FRAMES);
    expect(run.frames.at(-1)?.t).toBe(29_990);
    expect(run.frames[0]?.t).toBe(29_990 - (MAX_FRAMES - 1) * 10);
  });

  it("stops changing once done", () => {
    const done = play(startRun(STEPS, 0), 0, 11_100);
    expect(done.phase).toBe("done");
    expect(tick(done, 20_000, frame(20_000))).toBe(done);
  });

  it("hands the kept frames, the start time and the steps to the skill check", () => {
    const run = play(startRun(STEPS, 400), 400, 11_500);
    const calls: Parameters<Assess>[] = [];
    const assess: Assess = (...args) => {
      calls.push(args);
      return BLANK;
    };
    expect(finish(run, assess)).toBe(BLANK);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe(run.frames);
    expect(calls[0]?.[1]).toBe(400 + READY_MS);
    expect(calls[0]?.[2]).toBe(STEPS);
  });

  it("says nobody was seen after an empty ready phase, even when frames come later", () => {
    let run = startRun(STEPS, 0);
    for (let now = 0; now < 2000; now += 100) run = tick(run, now, null);
    expect(nobodySeen(run)).toBe(true);
    expect(nobodySeen(play(run, 2000, 6000))).toBe(true);
  });

  it("says somebody was seen once enough ready frames arrive", () => {
    expect(nobodySeen(play(startRun(STEPS, 0), 0, (MIN_READY_FRAMES - 1) * 100))).toBe(true);
    expect(nobodySeen(play(startRun(STEPS, 0), 0, MIN_READY_FRAMES * 100))).toBe(false);
  });
});

describe("the lines shown after a warm-up", () => {
  it("gives the level, the moves to work on with their tips, and what is strong", () => {
    const assessment: Assessment = {
      ...BLANK,
      level: "beginner",
      focus: [{ moveId: "dodge_left", tip: "Step further." }, { moveId: "block", tip: "Hands higher." }],
      strong: ["jab", "duck"],
    };
    expect(resultLines(assessment)).toEqual([
      "Your level: beginner",
      "Work on Dodge left: Step further.",
      "Work on Block: Hands higher.",
      "Already strong: Jab, Duck",
    ]);
    expect(resultLines(assessment, (id) => id.toUpperCase())[3]).toBe("Already strong: JAB, DUCK");
  });

  it("is only the level when there is nothing else to say", () => {
    expect(resultLines({ ...BLANK, level: "good" })).toEqual(["Your level: good"]);
    expect(plainName("spear-thrust")).toBe("Spear thrust");
  });
});
