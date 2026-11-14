// The cave mouth's layout is data: repeatable, and nothing solid stands in the fight or on the camera's path.
import { expect, test } from "vitest";
import {
  CAMERA_ZONE, FIGHT_ZONE, FIRE, MOUTH, boulders, floorPieces, hallRadii, homestead, nearFire, noise2, roofHeight,
  stalactites, touchesZone, wallInset,
} from "../src/render/arena/cave/mouthLayout";
import { ARENAS, ARENA_SKIES } from "../src/render/arena/registry";

test("the layout is the same every time and changes with the seed", () => {
  expect(boulders()).toEqual(boulders());
  expect(stalactites()).toEqual(stalactites());
  expect(homestead()).toEqual(homestead());
  expect(boulders(1)).not.toEqual(boulders(2));
});

test("no boulder, jar, post or sheep touches the fight zone, the camera's path or the fire", () => {
  const pieces = floorPieces();
  expect(pieces.length).toBeGreaterThan(40);
  for (const piece of pieces) {
    const [x, , z] = piece.position;
    expect(touchesZone(FIGHT_ZONE, x, z, piece.footprint)).toBe(false);
    expect(touchesZone(CAMERA_ZONE, x, z, piece.footprint)).toBe(false);
    if (piece.kind === "boulder") expect(nearFire(x, z)).toBeGreaterThan(piece.footprint);
  }
});

test("the pen and the jars sit inside the cave, and the fire is clear of the fight", () => {
  for (const piece of homestead()) {
    const [x, , z] = piece.position;
    expect(Math.abs(x)).toBeLessThan(hallRadii(z).rx);
    expect(z).toBeGreaterThan(MOUTH.lipZ);
    expect(z).toBeLessThan(2);
  }
  expect(touchesZone(FIGHT_ZONE, FIRE.x, FIRE.z, 1.2)).toBe(false);
});

test("stalactites hang from the roof and stay out of the fighters' reach", () => {
  const teeth = stalactites();
  expect(teeth.length).toBeGreaterThan(20);
  for (const tooth of teeth) {
    const [x, y, z] = tooth.position;
    const length = tooth.scale[1];
    expect(y + length / 2).toBeGreaterThan(roofHeight(x, z));
    // Over the fight the lowest tip stays above the giant's raised arm.
    if (touchesZone(FIGHT_ZONE, x, z, 0.1)) expect(y - length / 2).toBeGreaterThan(5);
  }
});

test("the hall is wide and tall enough for the camera, and the wall only ever pulls inward", () => {
  const steps = Math.round((MOUTH.frontZ - MOUTH.lipZ) * 2);
  for (let i = 0; i <= steps; i++) {
    const z = MOUTH.frontZ - i / 2;
    const { rx, ry } = hallRadii(z);
    expect(rx * wallInset(0.2, z)).toBeGreaterThan(8);
    expect(ry * wallInset(Math.PI / 2, z)).toBeGreaterThan(6);
  }
  for (let theta = 0; theta <= Math.PI; theta += 0.1) expect(wallInset(theta, -10)).toBeLessThan(1);
  for (let x = 0; x < 9; x += 0.7) {
    expect(noise2(x, 3)).toBeGreaterThanOrEqual(0);
    expect(noise2(x, 3)).toBeLessThanOrEqual(1);
  }
});

test("Polyphemus fights in the cave mouth at dusk, with the old cave kept as its fallback", () => {
  expect(ARENAS.has("polyphemus")).toBe(true);
  expect(ARENAS.has("polyphemus-classic")).toBe(true);
  expect(ARENAS.get("polyphemus")).not.toBe(ARENAS.get("polyphemus-classic"));
  expect(ARENA_SKIES.get("polyphemus")?.hdri).toContain("qwantani_dusk_2_puresky_1k.hdr");
  expect(ARENA_SKIES.has("polyphemus-classic")).toBe(false);
});
