// The cave's layout is data: check it is repeatable and never crowds the fight.
import { expect, test } from "vitest";
import {
  CAVE,
  TORCH_ANGLES,
  TORCH_RADIUS,
  caveRocks,
  caveStalactites,
  domeHeight,
  flicker,
  onFloor,
} from "../src/render/arena/layout";
import { ARENAS } from "../src/render/arena/registry";

const fromCentre = (position: readonly [number, number, number]): number =>
  Math.hypot(position[0], position[2] - CAVE.centerZ);

test("the cave is the same every time it is built", () => {
  expect(caveRocks()).toEqual(caveRocks());
  expect(caveStalactites()).toEqual(caveStalactites());
  expect(caveRocks(1)).not.toEqual(caveRocks(2));
});

test("rocks and torches stay out of the fight and inside the dome", () => {
  const rocks = caveRocks();
  expect(rocks.length).toBeGreaterThan(40);
  expect(rocks.length).toBeLessThan(90);
  for (const rock of rocks) {
    expect(fromCentre(rock.position)).toBeGreaterThanOrEqual(CAVE.clearRadius);
    expect(fromCentre(rock.position)).toBeLessThan(CAVE.radius);
    for (const value of [...rock.position, ...rock.scale, ...rock.rotation]) expect(Number.isFinite(value)).toBe(true);
  }
  for (const angle of TORCH_ANGLES) expect(fromCentre(onFloor(angle, TORCH_RADIUS))).toBeGreaterThan(CAVE.clearRadius);
});

test("the cave mouth is in front of the camera and off to one side of the monster", () => {
  const mouth = onFloor(CAVE.mouthAngle, CAVE.radius - 0.9);
  expect(mouth[2]).toBeLessThan(-6);
  expect(Math.abs(mouth[0])).toBeGreaterThan(3);
});

test("stalactites hang from the roof and clear the monster's head", () => {
  const spikes = caveStalactites();
  expect(spikes.length).toBeGreaterThan(5);
  for (const spike of spikes) {
    const tip = spike.position[1] - spike.length / 2;
    const top = spike.position[1] + spike.length / 2;
    expect(tip).toBeGreaterThan(5.4);
    expect(top).toBeLessThanOrEqual(domeHeight(fromCentre(spike.position)));
  }
});

test("torch flicker stays in a safe range and differs between torches", () => {
  for (let t = 0; t < 20; t += 0.013) {
    for (let index = 0; index < 4; index++) {
      const level = flicker(t, index);
      expect(level).toBeGreaterThanOrEqual(0.7);
      expect(level).toBeLessThanOrEqual(1.15);
    }
  }
  expect(flicker(1, 0)).not.toBe(flicker(1, 1));
});

test("Polyphemus has an arena; an unknown enemy falls back", () => {
  expect(ARENAS.has("polyphemus")).toBe(true);
  expect(ARENAS.has("nobody")).toBe(false);
});
