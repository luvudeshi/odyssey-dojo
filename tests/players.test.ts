// Two players on one camera: each player keeps their own body whatever order the tracker returns them in.
import { expect, test } from "vitest";
import type { Landmark } from "../src/core/types";
import { MEMORY_MS, NO_PLAYERS, assignPlayers } from "../src/pose/players";
import type { PlayerAssignment } from "../src/pose/players";
import { JOINT } from "../src/pose/signals";

/** A made-up body: only the torso matters. `width` is the shoulder width, so a bigger body is nearer the camera. */
function body(x: number, y = 0.5, width = 0.12): Landmark[] {
  const points: Landmark[] = Array.from({ length: 33 }, () => ({ x, y, z: 0, visibility: 1 }));
  const put = (index: number, px: number, py: number) => {
    points[index] = { x: px, y: py, z: 0, visibility: 1 };
  };
  put(JOINT.leftShoulder, x - width / 2, y - 0.15);
  put(JOINT.rightShoulder, x + width / 2, y - 0.15);
  put(JOINT.leftHip, x - width / 3, y + 0.15);
  put(JOINT.rightHip, x + width / 3, y + 0.15);
  return points;
}

/** Runs frames 33 ms apart from `start`, feeding each result into the next. Returns every assignment. */
function run(frames: readonly (readonly Landmark[][])[], start = 0, from: PlayerAssignment = NO_PLAYERS) {
  const out: PlayerAssignment[] = [];
  let state = from;
  frames.forEach((bodies, i) => {
    state = assignPlayers(bodies, start + i * 33, state);
    out.push(state);
  });
  return out;
}

test("no bodies means no players, and a lone newcomer is player 0 wherever they stand", () => {
  expect(assignPlayers([], 0).bodies).toEqual([null, null]);
  expect(assignPlayers([body(0.8)], 0).bodies).toEqual([0, null]);
  expect(assignPlayers([body(0.2)], 0).bodies).toEqual([0, null]);
});

test("a fresh pair: screen left is player 0, in either order", () => {
  expect(assignPlayers([body(0.3), body(0.7)], 0).bodies).toEqual([0, 1]);
  expect(assignPlayers([body(0.7), body(0.3)], 0).bodies).toEqual([1, 0]);
});

test("players keep their bodies when the tracker swaps the order every frame", () => {
  const left = body(0.3);
  const right = body(0.7);
  const frames = Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? [left, right] : [right, left]));
  run(frames).forEach((assignment, i) => {
    expect(assignment.bodies, `frame ${String(i)}`).toEqual(i % 2 === 0 ? [0, 1] : [1, 0]);
  });
});

test("standing close with jitter, in random order, never swaps the players", () => {
  // Centres only 0.1 of the picture apart, each wobbling by up to 0.015, order shuffled by a fixed pattern.
  let seed = 7;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  let state = NO_PLAYERS;
  for (let i = 0; i < 300; i++) {
    const left = body(0.45 + (random() - 0.5) * 0.03, 0.5 + (random() - 0.5) * 0.03);
    const right = body(0.55 + (random() - 0.5) * 0.03, 0.5 + (random() - 0.5) * 0.03);
    const flipped = random() < 0.5;
    state = assignPlayers(flipped ? [right, left] : [left, right], i * 33, state);
    expect(state.bodies, `frame ${String(i)}`).toEqual(flipped ? [1, 0] : [0, 1]);
  }
});

test("players who walk past each other keep their numbers", () => {
  // Player 0 walks from 0.3 to 0.7 while player 1 walks from 0.7 to 0.3, one in front of the other.
  const frames = Array.from({ length: 41 }, (_, i) => [body(0.3 + i * 0.01, 0.45), body(0.7 - i * 0.01, 0.55)]);
  for (const assignment of run(frames)) expect(assignment.bodies).toEqual([0, 1]);
});

test("when one player drops out for under half a second, the other keeps their number and the first comes back as themself", () => {
  const both = [body(0.3), body(0.7)];
  const [start] = run([both]);
  if (!start) throw new Error("no first frame");
  // Player 0 vanishes: the one body left is still player 1.
  const alone = run(Array.from({ length: 12 }, () => [body(0.7)]), 33, start);
  for (const assignment of alone) expect(assignment.bodies).toEqual([null, 0]);
  // 12 frames is about 400 ms. Player 0 returns, listed second, then first.
  const last = alone.at(-1) ?? start;
  expect(assignPlayers([body(0.7), body(0.32)], 13 * 33, last).bodies).toEqual([1, 0]);
  expect(assignPlayers([body(0.32), body(0.7)], 13 * 33, last).bodies).toEqual([0, 1]);

  // The same with player 1 dropping out.
  const aloneLeft = run(Array.from({ length: 12 }, () => [body(0.3)]), 33, start);
  for (const assignment of aloneLeft) expect(assignment.bodies).toEqual([0, null]);
  expect(assignPlayers([body(0.68), body(0.3)], 13 * 33, aloneLeft.at(-1) ?? start).bodies).toEqual([1, 0]);
});

test("a body that drops out and comes back while both were briefly gone is matched to where each stood", () => {
  const [start] = run([[body(0.3), body(0.7)]]);
  if (!start) throw new Error("no first frame");
  const gone = assignPlayers([], 200, start);
  expect(gone.bodies).toEqual([null, null]);
  // Only the right-hand player is found again first: they are still player 1.
  expect(assignPlayers([body(0.69)], 400, gone).bodies).toEqual([null, 0]);
  expect(assignPlayers([body(0.31)], 400, gone).bodies).toEqual([0, null]);
});

test("after a long absence the places are forgotten and dealt again from the left", () => {
  const [start] = run([[body(0.3), body(0.7)]]);
  if (!start) throw new Error("no first frame");
  const later = MEMORY_MS + 100;
  // Both gone for longer than the memory: a lone body is player 0 again, even on the right.
  expect(assignPlayers([body(0.7)], later, start).bodies).toEqual([0, null]);
  // Player 1 stayed, player 0 left for good; someone new walks in on the far right. The stayer keeps number 1.
  const stayed = run(Array.from({ length: 30 }, () => [body(0.5)]), 33, assignPlayers([body(0.3), body(0.5)], 0));
  const last = stayed.at(-1);
  if (!last) throw new Error("no frames");
  expect(last.bodies).toEqual([null, 0]);
  expect(last.memory[0]).toBeNull();
  expect(assignPlayers([body(0.9), body(0.5)], 31 * 33, last).bodies).toEqual([0, 1]);
});

test("with one player remembered, a body far from them is the other player", () => {
  const solo = assignPlayers([body(0.2)], 0);
  expect(solo.bodies).toEqual([0, null]);
  // The tracker loses player 0 for a frame and finds a second person across the room instead.
  expect(assignPlayers([body(0.8)], 33, solo).bodies).toEqual([null, 0]);
  // The same body, moved a little, is still player 0.
  expect(assignPlayers([body(0.25)], 33, solo).bodies).toEqual([0, null]);
});

test("a bystander further from the camera is ignored when three bodies are found", () => {
  const frame = [body(0.5, 0.4, 0.05), body(0.7), body(0.3)];
  expect(assignPlayers(frame, 0).bodies).toEqual([2, 1]);
});

test("the function does not change what it is given", () => {
  const first = assignPlayers([body(0.3), body(0.7)], 0);
  const copy = JSON.stringify(first);
  const bodies = [body(0.7), body(0.3)];
  const before = JSON.stringify(bodies);
  assignPlayers(bodies, 33, first);
  expect(JSON.stringify(first)).toBe(copy);
  expect(JSON.stringify(bodies)).toBe(before);
});
