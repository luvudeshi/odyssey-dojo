// Guards Homer's and the monsters' lines: ids are unique, taunts match the enemy's own, and the picker is safe.
import { expect, test } from "vitest";
import { ATHENA_LINES } from "../src/audio/athenaLines";
import { STORY_LINES, tauntFor } from "../src/audio/storyLines";
import { ENEMIES } from "../src/enemies/registry";

test("story line ids are unique, never clash with Athena's, and every line has words", () => {
  const ids = STORY_LINES.map((line) => line.id);
  expect(new Set(ids).size).toBe(ids.length);
  const athena = new Set(ATHENA_LINES.map((line) => line.id));
  for (const line of STORY_LINES) {
    expect(athena.has(line.id), line.id).toBe(false);
    expect(line.text.trim().length, line.id).toBeGreaterThan(10);
    expect(line.id.startsWith(line.speaker === "homer" ? "homer_" : "taunt_"), line.id).toBe(true);
  }
});

test("every recorded taunt is one of that enemy's own taunts", () => {
  for (const line of STORY_LINES.filter((each) => each.speaker === "monster")) {
    const enemyId = line.id.split("_")[1] ?? "";
    const enemy = ENEMIES.find((each) => each.id === enemyId);
    expect(enemy?.taunts, line.id).toContain(line.text);
  }
});

test("a taunt is picked for an enemy that has one, and none for one that has not", () => {
  expect(tauntFor("polyphemus", () => 0)).toBe("taunt_polyphemus_1");
  expect(tauntFor("polyphemus", () => 0.999)).toBe("taunt_polyphemus_4");
  expect(tauntFor("nobody", () => 0.5)).toBeNull();
});
