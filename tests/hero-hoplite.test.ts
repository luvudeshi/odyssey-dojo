import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { HERO_CANDIDATES } from "../src/render/hero/candidates";
import { shieldRaised, spearMode } from "../src/render/hero/gear/hopliteState";
import type { GearInput } from "../src/render/hero/gear/hopliteState";

const punch = { seconds: 0.5, hit: 0.4 };
const thrust = { seconds: 0.6, hit: 0.4 };
const calm: GearInput = { held: new Set(), struckMove: "", sinceStrike: Infinity, finisherMove: null, lost: false };

describe("spearMode", () => {
  test("carried when nothing is thrown", () => {
    expect(spearMode(calm, punch, thrust)).toBe("carry");
  });
  test("leads a spear thrust, the stake thrust and the finisher, then goes back to carry", () => {
    expect(spearMode({ ...calm, struckMove: "spear_thrust", sinceStrike: 0.1 }, punch, thrust)).toBe("thrust");
    expect(spearMode({ ...calm, struckMove: "stake_thrust", sinceStrike: 0.1 }, punch, thrust)).toBe("thrust");
    expect(spearMode({ ...calm, struckMove: "jab", sinceStrike: 0.1, finisherMove: "jab" }, punch, thrust)).toBe("thrust");
    expect(spearMode({ ...calm, struckMove: "spear_thrust", sinceStrike: 5 }, punch, thrust)).toBe("carry");
  });
  test("is out of the hand while a fist is thrown, and once the hero has fallen", () => {
    expect(spearMode({ ...calm, struckMove: "jab", sinceStrike: 0.1 }, punch, thrust)).toBe("away");
    expect(spearMode({ ...calm, lost: true }, punch, thrust)).toBe("away");
  });
});

describe("shieldRaised", () => {
  test("only while block is held", () => {
    expect(shieldRaised(new Set(["block"]))).toBe(true);
    expect(shieldRaised(new Set(["duck"]))).toBe(false);
  });
});

describe("hoplite candidate", () => {
  const candidate = HERO_CANDIDATES.get("hoplite");
  const file = readFileSync("public/models/hero/hoplite.glb");
  const json = JSON.parse(file.subarray(20, 20 + file.readUInt32LE(12)).toString()) as { animations: { name: string }[]; nodes: { name?: string }[] };
  const clips = new Set(json.animations.map((a) => a.name));

  test("is registered", () => {
    expect(candidate?.url).toBe("/models/hero/hoplite.glb");
  });
  test("every clip it names is in the shipped file", () => {
    const rig = candidate?.rig;
    if (!rig) throw new Error("hoplite missing");
    const named = [rig.idle, ...Object.values(rig.poses).flat(), ...Object.values(rig.byMove ?? {})];
    for (const name of named) expect(clips.has(name), name).toBe(true);
  });
  test("every gear anchor is a bone of the rig, and the backpack is gone", () => {
    const names = new Set(json.nodes.map((n) => n.name?.replace(".", "")));
    for (const bone of Object.keys(candidate?.anchors ?? {})) expect(names.has(bone), bone).toBe(true);
    expect(names.has("Backpack")).toBe(false);
  });
  test("ships under 3 MB", () => {
    expect(file.length).toBeLessThan(3 * 1024 * 1024);
  });
});
