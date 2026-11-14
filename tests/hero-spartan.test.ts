import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { candidate } from "../src/render/hero/defs/spartan";
import { THRUST_TIMING } from "../src/render/hero/gear/spartanGear";

/** Names of the animations in a .glb, read from its JSON chunk. */
function clipNames(path: string): string[] {
  const buf = readFileSync(path);
  const jsonLength = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLength).toString("utf8")) as { animations?: { name: string }[] };
  return (json.animations ?? []).map((a) => a.name);
}

describe("spartan hero", () => {
  const names = new Set(clipNames("public/models/hero/spartan.glb"));
  const rig = candidate.rig;

  test("every clip the rig names is in the shipped file", () => {
    const wanted = [rig.idle, ...Object.values(rig.poses).flat(), ...Object.values(rig.byMove ?? {})];
    for (const name of wanted) expect(names.has(name), name).toBe(true);
  });

  test("the shipped file holds nothing the rig does not use", () => {
    const used = new Set([rig.idle, ...Object.values(rig.poses).flat(), ...Object.values(rig.byMove ?? {})]);
    for (const name of names) expect(used.has(name), name).toBe(true);
  });

  test("the thrust lands inside its clip", () => {
    expect(THRUST_TIMING.hit).toBeLessThanOrEqual(THRUST_TIMING.seconds);
    expect(rig.thrust).toBe(THRUST_TIMING);
  });
});
