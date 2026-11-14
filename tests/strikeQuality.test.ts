import { describe, expect, it } from "vitest";
import type { PoseFrame, PoseHistory } from "../src/core/types";
import { MOVES } from "../src/moves/registry";
import { createPoseInput } from "../src/input/poseInput";
import { rating, strikeQuality } from "../src/pose/quality";
import { JOINT } from "../src/pose/signals";
import { frameAt } from "./poseFixture";

const J = JOINT;
const jab = [...MOVES.values()].find((move) => move.id === "jab") ?? expect.unreachable("jab missing");

/** Left arm at shoulder height, `reach` 0..1 from bent to straight. */
function armFrame(t: number, reach: number): PoseFrame {
  return frameAt(
    t,
    { [J.leftElbow]: [0.37 - 0.1 * reach, 0.35], [J.leftWrist]: [0.37 - 0.3 * reach, 0.35] },
    {
      [J.leftElbow]: [-0.3, -0.5, 0],
      [J.leftWrist]: reach > 0.5 ? [-0.7, -0.5, 0] : [-0.3, -0.7, 0],
    },
  );
}

function history(frames: readonly PoseFrame[]): PoseHistory {
  return { frames, baseline: null };
}

const fast = history([armFrame(0, 0), armFrame(60, 0.5), armFrame(120, 1)]);
const slow = history([armFrame(0, 0), armFrame(150, 0.1), armFrame(300, 0.3)]);

describe("strikeQuality", () => {
  it("scores a fast full punch well above a slow half-extended one", () => {
    const good = strikeQuality(fast, { sides: ["left"] });
    const weak = strikeQuality(slow, { sides: ["left"] });
    expect(good).toBeGreaterThan(0.8);
    expect(weak).toBeLessThan(0.5);
    expect(good - weak).toBeGreaterThan(0.3);
  });

  it("stays in 0..1 and finite for every move, with odd histories", () => {
    const missing: PoseFrame = { t: 100, image: [], world: [] };
    const cases = [history([]), history([armFrame(0, 1)]), history([missing]), history([missing, armFrame(150, 1)]), fast, slow];
    for (const move of MOVES.values()) {
      if (!move.quality) continue;
      for (const h of cases) {
        const q = move.quality(h);
        expect(Number.isFinite(q)).toBe(true);
        expect(q).toBeGreaterThanOrEqual(0);
        expect(q).toBeLessThanOrEqual(1);
      }
    }
    expect(strikeQuality(history([armFrame(0, 1)]), { sides: [] })).toBe(0);
  });

  it("gives every strike move a quality", () => {
    for (const move of MOVES.values()) if (move.kind === "strike") expect(typeof move.quality).toBe("function");
  });

  it("clamps what a move reports in poseInput", () => {
    const wild = new Map([["x", { ...jab, id: "x", detect: () => 1, quality: () => 7 }]]);
    expect(createPoseInput(wild)(fast).struck[0]?.quality).toBe(1);
  });
});

/** The same lazy 400 ms half-extension, sampled at `fps`, with deterministic wrist jitter. */
function lazy(fps: number): PoseHistory {
  const frames: PoseFrame[] = [];
  for (let n = 0, t = 0; t <= 400; n++, t = Math.round((n * 1000) / fps)) {
    const jitter = n % 2 === 0 ? 0.008 : -0.008;
    frames.push(
      frameAt(
        t,
        { [J.leftElbow]: [0.37, 0.35], [J.leftWrist]: [0.37 - 0.1 * (t / 400) + jitter, 0.35 + jitter] },
        { [J.leftElbow]: [-0.3, -0.5, 0], [J.leftWrist]: [-0.3, -0.7, 0] },
      ),
    );
  }
  return history(frames);
}

describe("strikeQuality robustness", () => {
  it("rates a lazy motion the same, and low, at any frame rate", () => {
    const scores = [15, 30, 60, 120].map((fps) => strikeQuality(lazy(fps), { sides: ["left"] }));
    expect(Math.max(...scores)).toBeLessThan(0.55);
    expect(Math.max(...scores) - Math.min(...scores)).toBeLessThan(0.1);
  });

  it("ignores a one-frame wrist glitch", () => {
    const glitch = armFrame(150, 0);
    const bad = { ...glitch, image: glitch.image.map((p, i) => (i === J.leftWrist ? { ...p, x: 0.9, visibility: 0.1 } : p)) };
    const calm = [armFrame(0, 0), armFrame(75, 0), bad, armFrame(225, 0), armFrame(300, 0)];
    expect(strikeQuality(history(calm), { sides: ["left"] })).toBeLessThan(0.55);
  });

  it("does not saturate speed for a 300 ms full punch", () => {
    const steady = history([0, 1, 2, 3, 4, 5].map((n) => armFrame(n * 60, n / 5)));
    expect(strikeQuality(steady, { sides: ["left"] })).toBeLessThan(0.92);
    expect(strikeQuality(steady, { sides: ["left"] })).toBeGreaterThan(0.55);
  });
});

describe("rating", () => {
  it("names the tiers", () => {
    expect([0.3, 0.55, 0.8, 0.95].map(rating)).toEqual([null, "GOOD", "GREAT", "PERFECT"]);
  });
});
