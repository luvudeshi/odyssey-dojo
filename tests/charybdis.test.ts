// Charybdis's stop: the strait's layout keeps clear of the fight, every attack has its own visible windup, the weak
// spots sit on the body, and the pieces are registered so the stop opens on the quest map.
import { expect, test } from "vitest";
import { enemy } from "../src/enemies/defs/charybdis";
import { CAMERA_ZONE, FIGHT_ZONE } from "../src/render/arena/cave/mouthLayout";
import { RAFT, WHIRL, circlingDebris, driftwood, inBox } from "../src/render/arena/charybdis/layout";
import { cliffGeometry, raftGeometry, rockGeometry, treeGeometry } from "../src/render/arena/charybdis/shapes";
import { ARENAS } from "../src/render/arena/registry";
import { IDLE, lookFor } from "../src/render/monsters/charybdis/look";
import { MOUTH_RX, MOUTH_RY, THROAT_Y, columnGeometry, fangGeometry, funnelGeometry, waveGeometry } from "../src/render/monsters/charybdis/shapes";
import { model } from "../src/render/monsters/models/Charybdis";

test("the drifting wreckage is repeatable and stays out of the fight, the camera's path and the raft", () => {
  expect(driftwood()).toEqual(driftwood());
  const pieces = driftwood();
  expect(pieces.length).toBeGreaterThan(8);
  for (const piece of pieces) {
    const [x, , z] = piece.position;
    expect(inBox(FIGHT_ZONE, x, z, piece.footprint)).toBe(false);
    expect(inBox(CAMERA_ZONE, x, z, piece.footprint)).toBe(false);
    expect(Math.hypot(x - WHIRL.x, z - WHIRL.z)).toBeGreaterThan(6);
    expect(Math.abs(x - RAFT.x) > RAFT.halfWidth || Math.abs(z - RAFT.z) > RAFT.halfLength).toBe(true);
  }
});

test("debris circling the whirlpool stays on its far side and fades in and out", () => {
  for (let index = 0; index < 5; index++) {
    for (let seconds = 0; seconds < 120; seconds += 3) {
      const d = circlingDebris(index, seconds);
      expect(d.z).toBeLessThan(WHIRL.z + 0.5);
      expect(d.fade).toBeGreaterThanOrEqual(0);
      expect(d.fade).toBeLessThanOrEqual(1);
    }
  }
});

test("the solid geometry builds with finite positions and vertex colours", () => {
  for (const geometry of [raftGeometry(), rockGeometry(), treeGeometry(), cliffGeometry(), funnelGeometry(), waveGeometry(), columnGeometry(), fangGeometry()]) {
    const position = geometry.getAttribute("position");
    expect(position.count).toBeGreaterThan(10);
    expect(Array.from(position.array).every(Number.isFinite)).toBe(true);
  }
  expect(raftGeometry().getAttribute("color").count).toBeGreaterThan(100);
});

test("each attack in her data winds up in its own way, and the counter matches the part that moves", () => {
  const looks = new Map(enemy.attacks.map((attack) => [attack.id, lookFor(attack.id, 1, false, 0)]));
  expect(looks.get("surge_left")?.wallLeft).toBeGreaterThan(0.9);
  expect(looks.get("surge_left")?.wallRight).toBe(0);
  expect(looks.get("surge_right")?.wallRight).toBeGreaterThan(0.9);
  expect(looks.get("surge_right")?.wallLeft).toBe(0);
  expect(looks.get("spout")?.spout).toBeGreaterThan(0.9);
  expect(looks.get("spout")?.crestLift).toBeGreaterThan(1);
  expect(looks.get("undertow")?.pull).toBeGreaterThan(0.9);
  expect(looks.get("undertow")?.mouth).toBeGreaterThan(1.1);
  // The dodge sides are the opposite of the side the water comes from; the spout is answered by ducking.
  expect(enemy.attacks.find((a) => a.id === "surge_left")?.counter).toBe("dodge_right");
  expect(enemy.attacks.find((a) => a.id === "spout")?.counter).toBe("duck");
  expect(lookFor("spout", 0, false, 0)).toEqual(lookFor(null, 0, false, 0));
});

test("the windup grows with time, phases change her look and defeat collapses her", () => {
  expect(lookFor("surge_left", 0.3, false, 0).wallLeft).toBeLessThan(lookFor("surge_left", 0.8, false, 0).wallLeft);
  expect(lookFor(null, 0, false, 2).fangs).toBeGreaterThan(lookFor(null, 0, false, 0).fangs);
  expect(lookFor(null, 0, false, 2).spin).toBeGreaterThan(lookFor(null, 0, false, 0).spin);
  const dead = lookFor("spout", 1, true, 1);
  expect(dead.collapse).toBe(1);
  expect(dead.spout).toBe(0);
  expect(IDLE.collapse).toBe(0);
});

test("the weak spots sit on the body parts their labels name", () => {
  const maw = enemy.weakSpots.find((spot) => spot.id === "maw");
  const crest = enemy.weakSpots.find((spot) => spot.id === "crest");
  expect(maw?.label).toBe("the throat of the whirlpool");
  expect(crest?.label).toBe("the crest of the wave");
  const [mx = 0, my = 0, mz = 0] = maw?.position ?? [];
  // The throat is the funnel's mouth: about 1.4 m up, in line with the funnel's axis and inside its opening.
  expect(my).toBeCloseTo(THROAT_Y, 1);
  expect(Math.abs(mx)).toBeLessThan(MOUTH_RX);
  expect(mz).toBeGreaterThan(-1);
  const [cx = 0, cy = 0, cz = 0] = crest?.position ?? [];
  // The crest arches over the mouth, about 3 m up and within its width, toward the player.
  expect(cy).toBeGreaterThan(2.7);
  expect(cy).toBeLessThan(THROAT_Y + MOUTH_RY);
  expect(Math.abs(cx)).toBeLessThan(MOUTH_RX);
  expect(cz).toBeGreaterThan(0);
});

test("the stop is registered: a monster model and an arena for charybdis", () => {
  expect(model.enemyId).toBe("charybdis");
  expect(ARENAS.has("charybdis")).toBe(true);
});
