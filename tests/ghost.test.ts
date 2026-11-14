// The move ghost's maths: diagram to joints, which move a phase asks for, how visible the ghost is and how close a live pose is.
import { expect, test } from "vitest";
import type { Landmark, MoveDef, PoseFrame } from "../src/core/types";
import { ghostCloseness, ghostJoints, ghostOpacity, promptedMove } from "../src/render/ghost/ghostPose";
import { MOVES } from "../src/moves/registry";
import { JOINT } from "../src/pose/signals";

const move = (id: string): MoveDef => {
  const found = MOVES.get(id);
  if (!found) throw new Error(`no move ${id}`);
  return found;
};

/** A webcam frame (image space, y down, shoulders 0.2 wide) standing in the pose a diagram shows, shifted by (dx, dy). */
function frameFor(def: MoveDef, dx = 0, dy = 0): PoseFrame {
  const image: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
  const unit = (0.028 / 0.4) * 0.2;
  const d = def.diagram;
  const put = (index: number, x: number, y: number): void => { image[index] = { x: 0.5 + dx + x, y: 0.3 + dy + y, z: 0, visibility: 1 }; };
  put(JOINT.leftShoulder, -0.1, 0); put(JOINT.rightShoulder, 0.1, 0);
  put(JOINT.leftElbow, -0.1 + (d.leftElbow[0] - 38) * unit, (d.leftElbow[1] - 32) * unit);
  put(JOINT.leftWrist, -0.1 + (d.leftWrist[0] - 38) * unit, (d.leftWrist[1] - 32) * unit);
  put(JOINT.rightElbow, 0.1 + (d.rightElbow[0] - 62) * unit, (d.rightElbow[1] - 32) * unit);
  put(JOINT.rightWrist, 0.1 + (d.rightWrist[0] - 62) * unit, (d.rightWrist[1] - 32) * unit);
  return { t: 0, image, world: image };
}

test("a block has both hands up by the head, a jab reaches the lead hand out", () => {
  const block = ghostJoints(move("block").diagram);
  expect(block.leftWrist[1]).toBeGreaterThan(block.leftShoulder[1] - 0.1);
  expect(block.leftWrist[1]).toBeGreaterThan(1.4);
  const jab = ghostJoints(move("jab").diagram);
  expect(jab.leftShoulder[0] - jab.leftWrist[0]).toBeGreaterThan(0.3);
  expect(Math.abs(jab.rightShoulder[0] - jab.rightWrist[0])).toBeLessThan(0.2);
});

test("a duck is low, a dodge leans to its side, standing feet are on the floor", () => {
  const stand = ghostJoints(move("block").diagram);
  const duck = ghostJoints(move("duck").diagram);
  expect(duck.head[1]).toBeLessThan(stand.head[1] - 0.3);
  expect(duck.leftFoot[1]).toBe(0);
  expect(ghostJoints(move("dodge_left").diagram).head[0]).toBeLessThan(-0.2);
  expect(ghostJoints(move("dodge_right").diagram).head[0]).toBeGreaterThan(0.2);
  expect(ghostJoints(move("dodge_left").diagram).leftFoot[1]).toBe(0);
  expect(ghostJoints(move("jump").diagram).leftFoot[1]).toBeGreaterThan(0.1);
});

test("a kick lifts the foot out in front of the hip", () => {
  const kick = ghostJoints(move("front_kick").diagram);
  expect(kick.rightFoot[2]).toBeLessThan(kick.rightHip[2] - 0.5);
  expect(kick.leftFoot[2]).toBe(0);
});

test("every move in the game has a finite ghost", () => {
  for (const def of MOVES.values()) {
    const j = ghostJoints(def.diagram);
    for (const point of [j.head, j.leftElbow, j.rightElbow, j.leftWrist, j.rightWrist, j.leftKnee, j.rightKnee, j.leftFoot, j.rightFoot]) expect(point.every(Number.isFinite)).toBe(true);
  }
});

test("only a defend or strike prompt asks for a move", () => {
  const attack = { id: "swing", counter: "block" } as never;
  expect(promptedMove({ kind: "defend", attack, msLeft: 1, totalMs: 2 })).toBe("block");
  expect(promptedMove({ kind: "finisher", move: "jab", msLeft: 1, totalMs: 2 })).toBe("jab");
  expect(promptedMove({ kind: "recover", msLeft: 1 })).toBeNull();
  expect(promptedMove({ kind: "won" })).toBeNull();
  expect(promptedMove(undefined)).toBeNull();
});

test("the ghost fades as the move is learned and brightens with closeness", () => {
  expect(ghostOpacity(0, null)).toBeGreaterThan(ghostOpacity(2, null));
  expect(ghostOpacity(2, null)).toBeGreaterThan(ghostOpacity(5, null));
  expect(ghostOpacity(5, 1)).toBeGreaterThan(ghostOpacity(5, 0.5));
  expect(ghostOpacity(5, 0.5)).toBeGreaterThan(ghostOpacity(5, 0));
  expect(ghostOpacity(0, 0)).toBe(ghostOpacity(0, null));
  expect(ghostOpacity(0, 7)).toBe(ghostOpacity(0, 1));
});

test("closeness is high on the pose, drops for the wrong pose, and needs a baseline for dodges", () => {
  const jab = move("jab");
  const block = move("block");
  expect(ghostCloseness(frameFor(jab), jab.diagram, null)).toBeGreaterThan(0.95);
  expect(ghostCloseness(frameFor(block), jab.diagram, null)).toBeLessThan(0.7);
  expect(ghostCloseness(frameFor(jab), block.diagram, null)).toBeLessThan(0.7);

  const baseline = { centerX: 0.5, shoulderY: 0.3, shoulderWidth: 0.2 };
  const left = move("dodge_left");
  const leaning = frameFor(left, -0.12, 0);
  expect(ghostCloseness(leaning, left.diagram, baseline)).toBeGreaterThan(0.9);
  expect(ghostCloseness(frameFor(left), left.diagram, baseline)).toBeLessThan(0.65);
  expect(ghostCloseness(frameFor(move("dodge_right"), 0.12, 0), left.diagram, baseline)).toBeLessThan(0.2);
  const duck = move("duck");
  expect(ghostCloseness(frameFor(duck, 0, 0.12), duck.diagram, baseline)).toBeGreaterThan(0.9);
});

test("a frame with no shoulders scores 0", () => {
  const blank: PoseFrame = { t: 0, image: [], world: [] };
  expect(ghostCloseness(blank, move("jab").diagram, null)).toBe(0);
});
