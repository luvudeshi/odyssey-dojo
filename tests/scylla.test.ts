// Scylla's world and monster are data: the weak-spot markers sit on the named body parts, every attack has a neck to
// wind up, the cave is open, and the model and arena are registered.
import { expect, test } from "vitest";
import { ENEMIES } from "../src/enemies/registry";
import { readFileSync } from "node:fs";
import { DECK, MOUTH, cliffZ, deckHalfWidth, mouthRadius } from "../src/render/arena/scylla/layout";
import { ATTACK_NECK, EXPOSED_NECKS, NECK_COUNT, jawPoint, neckBase, neckPoint, neckPose, restPose } from "../src/render/monsters/scylla/pose";

const scylla = ENEMIES.find((e) => e.id === "scylla");
const MONSTER_Z = -4;
const none = { rear: 0, strike: 0, expose: 0, dead: 0 };

const dist = (a: readonly number[], b: readonly number[]): number => Math.hypot((a[0] ?? 0) - (b[0] ?? 0), (a[1] ?? 0) - (b[1] ?? 0), (a[2] ?? 0) - (b[2] ?? 0));

// The registries need a browser to load, so check the files the glob picks up declare scylla.
test("the model and the arena files declare scylla for the registries", () => {
  const model = readFileSync("src/render/monsters/models/Scylla.tsx", "utf8");
  const arena = readFileSync("src/render/arena/arenas/Scylla.tsx", "utf8");
  expect(model).toMatch(/export const model[^=]*=\s*\{\s*enemyId: "scylla"/);
  expect(arena).toMatch(/export const arena[^=]*=\s*\{\s*enemyId: "scylla"/);
});

test("every attack in the data has a neck that winds up for it", () => {
  expect(scylla).toBeDefined();
  for (const attack of scylla?.attacks ?? []) {
    const neck = ATTACK_NECK[attack.id];
    expect(neck, attack.id).toBeDefined();
    expect(neck).toBeGreaterThanOrEqual(0);
    expect(neck).toBeLessThan(NECK_COUNT);
  }
});

test("the weak-spot markers sit on the exposed neck and the exposed jaw", () => {
  const neckSpot = scylla?.weakSpots.find((w) => w.id === "neck");
  const jawSpot = scylla?.weakSpots.find((w) => w.id === "jaw");
  const exposed = { ...none, expose: 1 };
  const worldNeck = neckPoint(neckBase(EXPOSED_NECKS.neck), neckPose(EXPOSED_NECKS.neck, exposed, 0.9), 0.9);
  const worldJaw = jawPoint(neckBase(EXPOSED_NECKS.jaw), neckPose(EXPOSED_NECKS.jaw, exposed, 0.9));
  const local = (p: readonly number[]): number[] => [p[0] ?? 0, p[1] ?? 0, (p[2] ?? 0) - MONSTER_Z];
  expect(dist(neckSpot?.position ?? [], local(worldNeck))).toBeLessThan(0.25);
  expect(dist(jawSpot?.position ?? [], local(worldJaw))).toBeLessThan(0.25);
  expect(neckSpot?.position[1]).toBeGreaterThan(2.9);
  expect(jawSpot?.position[1]).toBeLessThan(3.7);
});

test("at rest every neck leaves the cave and its head hangs clear of the hero", () => {
  for (let i = 0; i < NECK_COUNT; i++) {
    const pose = restPose(i, 0);
    expect(pose.h[2]).toBeLessThan(0);
    expect(pose.h[1]).toBeGreaterThan(2);
    const base = neckBase(i);
    expect(base[2]).toBeLessThan(MOUTH.z);
  }
});

test("the cave mouth is open and the cliff face is flat at its edge", () => {
  expect(mouthRadius(MOUTH.x, MOUTH.y)).toBe(0);
  expect(cliffZ(MOUTH.x + MOUTH.rx, MOUTH.y)).toBeCloseTo(MOUTH.z, 1);
  expect(cliffZ(MOUTH.x, MOUTH.y + MOUTH.ry)).toBeCloseTo(MOUTH.z, 1);
});

test("the deck narrows to a point at the bow and is full width at the waist", () => {
  expect(deckHalfWidth(DECK.waistZ)).toBe(DECK.halfWidth);
  expect(deckHalfWidth(DECK.sternZ)).toBe(DECK.halfWidth);
  expect(deckHalfWidth(DECK.bowZ)).toBeLessThan(DECK.halfWidth / 3);
});
