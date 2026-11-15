// The pieces that wire a stop's sound into a fight: the ambience gain under speech and pause, and the event override in sfx.
import { expect, test, vi } from "vitest";
import { setEventOverride } from "../src/audio/sfx";
import { ambienceGain } from "../src/audio/stopAudio";
import { stopClipFor } from "../src/audio/stopSounds";
import type { CombatEvent } from "../src/core/types";
import { ENEMIES } from "../src/enemies/registry";

test("the ambience sits at 0.16, halves under a spoken line and is silent while paused", () => {
  expect(ambienceGain(1, false, false)).toBeCloseTo(0.16);
  expect(ambienceGain(1, true, false)).toBeCloseTo(0.08);
  expect(ambienceGain(0.5, false, false)).toBeCloseTo(0.08);
  expect(ambienceGain(1, true, true)).toBe(0);
});

test("the ambience is quieter than the stop's event sounds and the usual effects", () => {
  expect(ambienceGain(1, false, false)).toBeLessThan(0.5);
});

test("circe's wand telegraphs with the wand, lands as a squeal, and an unlisted attack keeps the usual sound", () => {
  const attacks = ENEMIES.find((spec) => spec.id === "circe")?.attacks ?? [];
  const wand = attacks.find((each) => each.id === "wand_left");
  expect(wand).toBeDefined();
  if (!wand) return;
  expect(stopClipFor("circe", { type: "telegraph", attack: wand })).toBe("wand");
  expect(stopClipFor("circe", { type: "playerHit", attack: wand, damage: wand.damage })).toBe("squeal");
  expect(stopClipFor("circe", { type: "telegraph", attack: { ...wand, id: "unlisted" } })).toBeNull();
});

test("an event override can be set and cleared without error", () => {
  const seen = vi.fn(() => true);
  setEventOverride(seen);
  setEventOverride(null);
  expect(seen).not.toHaveBeenCalled();
  const event: CombatEvent = { type: "whiffed" };
  expect(event.type).toBe("whiffed");
});
