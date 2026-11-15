// The Sirens: each attack has its own visible windup, the meadow is the same every run and never crowds the fight,
// the stop is registered, and the weak spots sit on the body they name.
import { expect, test } from "vitest";
import { enemy } from "../src/enemies/defs/sirens";
import { CAMERA_ZONE, FIGHT_ZONE, bones, flowers, groundHeight, rocks, touchesZone, tufts } from "../src/render/arena/sirens/layout";
import { terrainGeometry } from "../src/render/arena/sirens/solids";
import { ARENAS } from "../src/render/arena/registry";
import { model } from "../src/render/monsters/models/Sirens";
import { makePose, sirenPose } from "../src/render/monsters/sirens/pose";
import type { SirenInput } from "../src/render/monsters/sirens/pose";
import { SIREN } from "../src/render/monsters/sirens/parts";

const base: SirenInput = { windup: 0, attackId: null, defeated: false, phaseIndex: 0, hitFlash: 0, time: 0, lead: true };
const pose = (over: Partial<SirenInput>) => ({ ...sirenPose(makePose(), { ...base, ...over }) });

test("the stop and its arena are registered for the Sirens", () => {
  expect(ARENAS.has("sirens")).toBe(true);
  expect(model.enemyId).toBe("sirens");
});

test("every attack in the data has a windup that differs from rest and from every other attack", () => {
  const rest = pose({});
  const seen = new Map<string, string>();
  for (const attack of enemy.attacks) {
    const p = pose({ windup: 0.9, attackId: attack.id });
    expect(JSON.stringify(p)).not.toBe(JSON.stringify(rest));
    for (const [other, json] of seen) expect(JSON.stringify(p), `${attack.id} vs ${other}`).not.toBe(json);
    seen.set(attack.id, JSON.stringify(p));
  }
});

test("the song opens both wings and the mouth and lets the song out", () => {
  const rest = pose({});
  const song = pose({ windup: 1, attackId: "song" });
  expect(song.wingL).toBeGreaterThan(rest.wingL);
  expect(song.wingR).toBeGreaterThan(rest.wingR);
  expect(song.mouth).toBeGreaterThan(0.5);
  expect(song.song).toBeGreaterThan(0.5);
  expect(rest.song).toBe(0);
});

test("a swoop rears toward the side it comes from, and the two sides mirror each other", () => {
  const left = pose({ windup: 1, attackId: "swoop_left" });
  const right = pose({ windup: 1, attackId: "swoop_right" });
  expect(left.x).toBeLessThan(0);
  expect(right.x).toBeGreaterThan(0);
  expect(left.x).toBeCloseTo(-right.x, 5);
  expect(left.wingL).toBeGreaterThan(left.wingR);
  expect(right.wingR).toBeGreaterThan(right.wingL);
  expect(left.roll).toBeCloseTo(-right.roll, 5);
});

test("the talon dive rises and drives the claws out", () => {
  const rest = pose({});
  const dive = pose({ windup: 1, attackId: "talons" });
  expect(dive.y).toBeGreaterThan(rest.y + 0.5);
  expect(dive.claws).toBeGreaterThan(0.5);
});

test("only the lead shows the swoop and dive cues; the second Siren just sings", () => {
  const rest = pose({ lead: false });
  expect(pose({ windup: 1, attackId: "talons", lead: false }).y).toBeCloseTo(rest.y, 5);
  expect(pose({ windup: 1, attackId: "song", lead: false }).song).toBeGreaterThan(0.5);
});

test("a hit makes her flinch and the phases make her wings wilder", () => {
  expect(pose({ hitFlash: 1 }).headX).toBeLessThan(pose({}).headX);
  const wings = [0, 1, 2].map((phaseIndex) => pose({ phaseIndex }).wingL);
  expect(wings[1]).toBeGreaterThan(wings[0] ?? 0);
  expect(wings[2]).toBeGreaterThan(wings[1] ?? 0);
});

test("defeated, she sinks, droops her wings and shuts her eyes, whatever she was doing", () => {
  const rest = pose({});
  const down = pose({ defeated: true, windup: 1, attackId: "song" });
  expect(down.y).toBeLessThan(rest.y);
  expect(down.wingL).toBeLessThan(0);
  expect(down.eyesOpen).toBe(false);
  expect(down.song).toBe(0);
});

test("the weak spots sit on the throat and the open wing she actually has", () => {
  const throat = enemy.weakSpots.find((spot) => spot.id === "throat");
  const wing = enemy.weakSpots.find((spot) => spot.id === "wing");
  expect(throat).toBeDefined();
  expect(wing).toBeDefined();
  const [tx, ty] = throat?.position ?? [0, 0, 0];
  expect(Math.abs(tx - SIREN.throat[0])).toBeLessThan(0.3);
  expect(Math.abs(ty - SIREN.throat[1])).toBeLessThan(0.3);
  const [wx, wy] = wing?.position ?? [0, 0, 0];
  expect(wx).toBeLessThan(-0.9);
  expect(wy).toBeGreaterThan(2.5);
  expect(wy).toBeLessThan(3.8);
});

test("the meadow is the same every run", () => {
  expect(rocks()).toEqual(rocks());
  expect(bones()).toEqual(bones());
  expect(flowers()).toEqual(flowers());
  expect(tufts()).toEqual(tufts());
  expect(rocks(1)).not.toEqual(rocks(2));
});

test("nothing tall stands in the fight or in the camera's way", () => {
  for (const rock of rocks()) {
    if (rock.footprint > 2.4) continue;
    expect(touchesZone(FIGHT_ZONE, rock.position[0], rock.position[2], rock.footprint), "rock in the fight").toBe(false);
  }
  for (const bone of bones()) {
    if (bone.kind === "long") continue;
    expect(touchesZone(FIGHT_ZONE, bone.position[0], bone.position[2], bone.footprint), `${bone.kind} in the fight`).toBe(false);
    expect(touchesZone(CAMERA_ZONE, bone.position[0], bone.position[2], bone.footprint), `${bone.kind} by the camera`).toBe(false);
  }
});

test("the ground is dead flat under the fight so the hero never floats or sinks", () => {
  // The hero stands near z=+1.2, the leading Siren near z=-4 and the second at x=5.2, z=-3.4.
  const spots: readonly (readonly [number, number])[] = [[0, 1.2], [0, -4], [-2.5, 1.2], [2.5, 1.2], [-2.5, -4], [2.5, -4], [5.2, -3.4]];
  for (const [x, z] of spots) expect(Math.abs(groundHeight(x, z)), `ground at ${String(x)},${String(z)}`).toBeLessThan(0.15);
});

test("the terrain has finite, in-range colours and normals", () => {
  const terrain = terrainGeometry();
  const colors = terrain.getAttribute("color").array;
  const normals = terrain.getAttribute("normal").array;
  expect(Array.from(colors).every((v) => v >= 0 && v <= 1)).toBe(true);
  expect(Array.from(normals).every((v) => Number.isFinite(v))).toBe(true);
});
