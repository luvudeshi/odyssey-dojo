// The quest's stops are data: check the route is whole, in the Odyssey's order, and fair to fight.
import { expect, test } from "vitest";
import { ENEMIES } from "../src/enemies/registry";
import { STYLES } from "../src/styles/registry";

const ROUTE = ["polyphemus", "circe", "sirens", "scylla", "charybdis", "suitors"];
const NEW_STOPS = ["circe", "sirens", "charybdis", "suitors"];

test("the route runs Cyclops, Circe, Sirens, Scylla, Charybdis, suitors", () => {
  expect(ENEMIES.map((enemy) => enemy.id)).toEqual(ROUTE);
  expect(new Set(ENEMIES.map((enemy) => enemy.order)).size).toBe(ENEMIES.length);
});

test("every stop has a place and a book, and the books never run backwards", () => {
  const books = ENEMIES.map((enemy) => enemy.book ?? 0);
  for (const enemy of ENEMIES) {
    expect(enemy.place?.length ?? 0, enemy.id).toBeGreaterThan(3);
    expect(enemy.book, enemy.id).toBeGreaterThanOrEqual(9);
    expect(enemy.book, enemy.id).toBeLessThanOrEqual(22);
  }
  expect(books).toEqual([...books].sort((a, b) => a - b));
  expect(books).toEqual([9, 10, 12, 12, 12, 22]);
});

test("each new stop has three phases that speed up, and uses every one of its attacks", () => {
  for (const id of NEW_STOPS) {
    const enemy = ENEMIES.find((candidate) => candidate.id === id);
    const phases = enemy?.phases ?? [];
    expect(phases.length, id).toBe(3);
    expect(phases[0]?.belowHp, id).toBe(1);
    const scales = phases.map((phase) => phase.telegraphScale);
    expect(scales, id).toEqual([...scales].sort((a, b) => b - a));
    const used = new Set(phases.flatMap((phase) => [...phase.attackIds]));
    for (const attack of enemy?.attacks ?? []) expect(used.has(attack.id), `${id}/${attack.id}`).toBe(true);
    expect(new Set(enemy?.attacks.map((attack) => attack.id)).size, id).toBe(enemy?.attacks.length);
    expect(enemy?.taunts.length ?? 0, id).toBeGreaterThanOrEqual(3);
    expect(enemy?.name.length ?? 0, id).toBeGreaterThan(0);
    expect(enemy?.title.length ?? 0, id).toBeGreaterThan(0);
  }
});

test("each new stop asks for all four defenses, and never faster than a body can answer", () => {
  for (const id of NEW_STOPS) {
    const enemy = ENEMIES.find((candidate) => candidate.id === id);
    const counters = new Set(enemy?.attacks.map((attack) => attack.counter));
    expect([...counters].sort(), id).toEqual(["block", "dodge_left", "dodge_right", "duck"]);
    for (const phase of enemy?.phases ?? []) {
      for (const attackId of phase.attackIds) {
        const attack = enemy?.attacks.find((candidate) => candidate.id === attackId);
        expect((attack?.telegraphMs ?? 0) * phase.telegraphScale, `${id}/${phase.name}/${attackId}`).toBeGreaterThanOrEqual(1000);
      }
    }
    for (const attack of enemy?.attacks ?? []) {
      expect(attack.damage, `${id}/${attack.id}`).toBeGreaterThan(0);
      expect(attack.damage, `${id}/${attack.id}`).toBeLessThanOrEqual(15);
      if (attack.weight !== undefined) expect(attack.weight, `${id}/${attack.id}`).toBeGreaterThan(0);
    }
  }
});

test("every weak spot at every stop can be hit by every fighting style", () => {
  for (const enemy of ENEMIES) {
    expect(new Set(enemy.weakSpots.map((spot) => spot.id)).size, enemy.id).toBe(enemy.weakSpots.length);
    for (const spot of enemy.weakSpots) {
      for (const style of STYLES) {
        const usable = spot.moves.filter((move) => style.strikes.includes(move));
        expect(usable.length, `${enemy.id}/${spot.id} for ${style.id}`).toBeGreaterThan(0);
      }
    }
  }
});

test("the fights get longer along the route, and the suitors are the hardest", () => {
  const stops = NEW_STOPS.map((id) => ENEMIES.find((enemy) => enemy.id === id));
  const suitors = stops.at(-1);
  for (const stop of stops) {
    expect(stop?.hp ?? 0).toBeGreaterThanOrEqual(300);
    expect(stop?.hp ?? 0).toBeLessThanOrEqual(suitors?.hp ?? 0);
    expect(stop?.strikeWindowMs ?? 0).toBeGreaterThanOrEqual(suitors?.strikeWindowMs ?? 0);
  }
});
