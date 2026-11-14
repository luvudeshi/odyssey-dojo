import { describe, expect, test } from "vitest";
import { Box3, Object3D, Vector3 } from "three";
import { fitModel } from "../src/render/models/fitModel";

const box = new Box3(new Vector3(1, 0.5, 2), new Vector3(3, 2.5, 4));

describe("fitModel", () => {
  test("scales to height, floors the feet and centres", () => {
    const { scale, position } = fitModel(box, { targetHeight: 4 });
    expect(scale).toBe(2);
    expect(position).toEqual([-4, -1, -6]);
  });
  test("footOffset lifts the model in scaled units", () => {
    expect(fitModel(box, { targetHeight: 4, footOffset: 0.25 }).position[1]).toBeCloseTo(-0.5);
  });
  test("a degenerate bone span is left unscaled", () => {
    const flat = new Box3(new Vector3(0, 1, 0), new Vector3(1, 1 + 1e-6, 1));
    expect(fitModel(flat, { targetHeight: 3 }).scale).toBe(1);
  });
  test("rotating the outer group keeps the centre on the anchor", () => {
    const { scale, position } = fitModel(box, { targetHeight: 4 });
    const outer = new Object3D();
    outer.rotation.y = Math.PI;
    const inner = new Object3D();
    inner.position.set(...position);
    outer.add(inner);
    const model = new Object3D();
    model.scale.setScalar(scale);
    inner.add(model);
    outer.updateWorldMatrix(true, true);
    const world = model.localToWorld(box.getCenter(new Vector3()));
    expect(world.x).toBeCloseTo(0);
    expect(world.z).toBeCloseTo(0);
  });
});
