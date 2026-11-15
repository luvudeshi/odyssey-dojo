// Two players on one camera: reading each half of the picture, and choosing between the halves and the whole.
// All bodies are made up: no camera and no pose model.
import { expect, test } from "vitest";
import type { Landmark } from "../src/core/types";
import { createSeating } from "../src/duo/assign";
import { GIVE_UP, HALF_SHARE, PROBE_EVERY, createPairFinder, fromHalf, halfStart, pairOf, sameBody } from "../src/duo/halves";
import type { PairFinder, Side } from "../src/duo/halves";
import { homeOf } from "../src/duo/split";
import type { Body } from "../src/duo/split";
import { JOINT } from "../src/pose/signals";

/** A made-up body: only the shoulders and hips matter. `x` is the middle of the shoulders in the mirrored picture. */
function body(x: number, width = 0.12, y = 0.5): Body {
  const points: Landmark[] = Array.from({ length: 33 }, () => ({ x, y, z: 0, visibility: 1 }));
  points[JOINT.leftShoulder] = { x: x - width / 2, y: y - 0.15, z: 0, visibility: 1 };
  points[JOINT.rightShoulder] = { x: x + width / 2, y: y - 0.15, z: 0, visibility: 1 };
  points[JOINT.leftHip] = { x: x - width / 3, y: y + 0.15, z: 0, visibility: 1 };
  points[JOINT.rightHip] = { x: x + width / 3, y: y + 0.15, z: 0, visibility: 1 };
  return { image: points, world: points };
}
const xs = (bodies: readonly Body[]): number[] => bodies.map((one) => Number(homeOf(one.image).x.toFixed(3)));

/** A made-up camera: what the whole picture shows and what each half shows, and how often each was read. */
function stage(finder: PairFinder) {
  const scene = {
    whole: [] as Body[], halves: [null, null] as [Body | null, Body | null], usable: true,
    wholeReads: 0, halfReads: 0, most: 0,
    /** Plays this many pictures and gives back the bodies of the last one. */
    play(pictures: number): Body[] {
      let out: Body[] = [];
      for (let i = 0; i < pictures; i += 1) {
        const before = scene.wholeReads + scene.halfReads;
        out = finder.next(
          () => { scene.wholeReads += 1; return scene.whole; },
          scene.usable ? (side: Side) => { scene.halfReads += 1; return scene.halves[side]; } : null,
        );
        scene.most = Math.max(scene.most, scene.wholeReads + scene.halfReads - before);
      }
      return out;
    },
    count(): void { scene.wholeReads = 0; scene.halfReads = 0; scene.most = 0; },
  };
  return scene;
}

test("a half's points become the whole picture's, mirrored", () => {
  // The screen's left half is the right-hand part of the camera's own picture.
  expect(halfStart(0)).toBeCloseTo(1 - HALF_SHARE);
  expect(halfStart(1)).toBe(0);
  const left = fromHalf([{ x: 0, y: 0.3, z: 0.2, visibility: 0.9 }, { x: 1, y: 0.4, z: -0.1 }], halfStart(0), HALF_SHARE);
  expect(left[0]).toEqual({ x: expect.closeTo(HALF_SHARE) as number, y: 0.3, z: expect.closeTo(0.2 * HALF_SHARE) as number, visibility: 0.9 });
  expect(left[1]).toEqual({ x: expect.closeTo(0) as number, y: 0.4, z: expect.closeTo(-0.1 * HALF_SHARE) as number, visibility: 0 });
  const right = fromHalf([{ x: 0, y: 0.3, z: 0 }, { x: 1, y: 0.3, z: 0 }], halfStart(1), HALF_SHARE);
  expect(right[0]?.x).toBeCloseTo(1);
  expect(right[1]?.x).toBeCloseTo(1 - HALF_SHARE);
});

test("a point in the strip both halves see lands on the same place from either half", () => {
  for (const cameraX of [0.46, 0.5, 0.54]) {
    const fromLeft = fromHalf([{ x: (cameraX - halfStart(0)) / HALF_SHARE, y: 0.5, z: 0 }], halfStart(0), HALF_SHARE);
    const fromRight = fromHalf([{ x: (cameraX - halfStart(1)) / HALF_SHARE, y: 0.5, z: 0 }], halfStart(1), HALF_SHARE);
    expect(fromLeft[0]?.x).toBeCloseTo(1 - cameraX);
    expect(fromRight[0]?.x).toBeCloseTo(1 - cameraX);
  }
});

test("two people are listed left first, and what one half found alone is kept", () => {
  expect(xs(pairOf(body(0.3), body(0.7)))).toEqual([0.3, 0.7]);
  expect(xs(pairOf(body(0.3), null))).toEqual([0.3]);
  expect(xs(pairOf(null, body(0.7)))).toEqual([0.7]);
  expect(pairOf(null, null)).toEqual([]);
  // Shoulder to shoulder is still two people: their middles are more than a shoulder width apart.
  expect(xs(pairOf(body(0.42, 0.12), body(0.58, 0.12)))).toEqual([0.42, 0.58]);
});

test("one person seen by both halves on the middle line is handed over once", () => {
  // The two readings of a body that is cut in two do not agree exactly.
  const left = body(0.47, 0.12);
  const right = body(0.55, 0.1);
  expect(sameBody(left, right)).toBe(true);
  // The seats' own rule (0.6 of a shoulder width) would have let this pair through as two players.
  const seats = createSeating().next([left, right], 0);
  expect(seats.first).not.toBeNull();
  expect(seats.second).not.toBeNull();
  expect(pairOf(left, right)).toHaveLength(1);
  // The reading kept is the one from the half that holds the person's middle.
  expect(xs(pairOf(body(0.46), body(0.48)))).toEqual([0.46]);
  expect(xs(pairOf(body(0.52), body(0.56)))).toEqual([0.56]);
});

test("while the whole picture shows two bodies the halves are never read", () => {
  const scene = stage(createPairFinder());
  scene.whole = [body(0.3), body(0.7)];
  scene.halves = [body(0.3), body(0.7)];
  expect(xs(scene.play(60))).toEqual([0.3, 0.7]);
  expect(scene.halfReads).toBe(0);
  expect(scene.wholeReads).toBe(60);
});

test("two people the whole picture reads as one are found by the halves within half a second", () => {
  const finder = createPairFinder();
  const scene = stage(finder);
  scene.whole = [body(0.5, 0.2)];
  scene.halves = [body(0.41), body(0.59)];
  let pictures = 0;
  while (finder.reader() === "whole" && pictures < 60) { scene.play(1); pictures += 1; }
  expect(pictures).toBeLessThanOrEqual(2 * PROBE_EVERY + 1);
  expect(xs(scene.play(1))).toEqual([0.41, 0.59]);
  // From then on only the halves are read: two reads a picture, as many as the whole picture costs for two bodies.
  scene.count();
  scene.play(30);
  expect(scene.wholeReads).toBe(0);
  expect(scene.halfReads).toBe(60);
});

test("someone alone stays with the whole picture, also on the middle line where both halves see them", () => {
  const finder = createPairFinder();
  const scene = stage(finder);
  scene.whole = [body(0.5)];
  scene.halves = [body(0.49), body(0.52)];
  expect(xs(scene.play(120))).toEqual([0.5]);
  expect(finder.reader()).toBe("whole");
  // One half is tried on every sixth picture, and never more than one extra read in a picture.
  expect(scene.halfReads).toBe(120 / PROBE_EVERY);
  expect(scene.most).toBe(2);
});

test("someone alone on one side stays with the whole picture", () => {
  const finder = createPairFinder();
  const scene = stage(finder);
  scene.whole = [body(0.3)];
  scene.halves = [body(0.3), null];
  expect(xs(scene.play(120))).toEqual([0.3]);
  expect(finder.reader()).toBe("whole");
  expect(scene.halfReads).toBe(120 / PROBE_EVERY);
  expect(scene.most).toBe(2);
});

test("someone who moved since the other half was tried is checked in one picture before the halves take over", () => {
  const finder = createPairFinder();
  const scene = stage(finder);
  scene.whole = [body(0.5)];
  // The left half was tried while they stood at 0.3, the right half after they had walked to 0.7: it looks like two.
  scene.halves = [body(0.3), null];
  scene.play(PROBE_EVERY);
  scene.whole = [body(0.7)];
  scene.halves = [null, body(0.7)];
  scene.play(PROBE_EVERY);
  // The next picture reads both halves at once, finds one body, and the whole picture stays the reader.
  scene.count();
  expect(xs(scene.play(1))).toEqual([0.7]);
  expect(scene.halfReads).toBe(2);
  expect(finder.reader()).toBe("whole");
});

test("the halves keep the pair through a lost picture or two and hand back when one has really gone", () => {
  const finder = createPairFinder();
  const scene = stage(finder);
  scene.whole = [body(0.5, 0.2)];
  scene.halves = [body(0.41), body(0.59)];
  scene.play(3 * PROBE_EVERY);
  expect(finder.reader()).toBe("halves");
  // One half loses its body for two pictures: the halves stay, and the body that is there is still handed over.
  scene.halves = [body(0.41), null];
  expect(scene.play(GIVE_UP - 1)).toHaveLength(1);
  expect(finder.reader()).toBe("halves");
  scene.halves = [body(0.41), body(0.59)];
  expect(scene.play(1)).toHaveLength(2);
  // Player two walks out: after a few pictures the whole picture is the reader again.
  scene.whole = [body(0.41)];
  scene.halves = [body(0.41), null];
  scene.play(GIVE_UP);
  expect(finder.reader()).toBe("whole");
  expect(xs(scene.play(1))).toEqual([0.41]);
});

test("the whole picture takes over at once when it shows more bodies than the halves", () => {
  const finder = createPairFinder();
  const scene = stage(finder);
  scene.whole = [body(0.5, 0.2)];
  scene.halves = [body(0.41), body(0.59)];
  scene.play(3 * PROBE_EVERY);
  expect(finder.reader()).toBe("halves");
  // Both step to the left: they are both in one half now, which is asked for one body.
  scene.whole = [body(0.15), body(0.4)];
  scene.halves = [body(0.15), null];
  expect(xs(scene.play(1))).toEqual([0.15, 0.4]);
  expect(finder.reader()).toBe("whole");
});

test("a body only a half can see is read by the halves, and the whole picture is tried only now and then", () => {
  const finder = createPairFinder();
  const scene = stage(finder);
  // Too small for the whole picture; the half's taller, narrower picture finds it.
  scene.whole = [];
  scene.halves = [body(0.3, 0.07), null];
  scene.play(3 * PROBE_EVERY);
  expect(finder.reader()).toBe("halves");
  scene.count();
  expect(xs(scene.play(60))).toEqual([0.3]);
  expect(finder.reader()).toBe("halves");
  expect(scene.wholeReads).toBeLessThanOrEqual(60 / PROBE_EVERY + GIVE_UP);
});

test("without half readers every picture is read whole", () => {
  const finder = createPairFinder();
  const scene = stage(finder);
  scene.whole = [body(0.5, 0.2)];
  scene.halves = [body(0.41), body(0.59)];
  scene.play(3 * PROBE_EVERY);
  expect(finder.reader()).toBe("halves");
  // The half readers broke: the very next picture is read whole, and nothing asks for a half again.
  scene.usable = false;
  scene.count();
  expect(xs(scene.play(30))).toEqual([0.5]);
  expect(finder.reader()).toBe("whole");
  expect(scene.halfReads).toBe(0);
  expect(scene.wholeReads).toBe(30);
});

test("reset starts again from the whole picture", () => {
  const finder = createPairFinder();
  const scene = stage(finder);
  scene.whole = [body(0.5, 0.2)];
  scene.halves = [body(0.41), body(0.59)];
  scene.play(3 * PROBE_EVERY);
  expect(finder.reader()).toBe("halves");
  finder.reset();
  expect(finder.reader()).toBe("whole");
  scene.count();
  scene.play(1);
  expect(scene.wholeReads).toBe(1);
  expect(scene.halfReads).toBe(0);
});
