// The suitors' look and clips are plain data: every attack must have a windup the shipped GLB can play, each phase must
// look different, and the figures' sizes and falls must follow the fight.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ENEMIES } from "../src/enemies/registry";
import { decideMonsterClip, newDecision } from "../src/render/models/clipMap";
import {
  ANTINOUS_HEIGHT, ANTINOUS_PALETTE, CLIP_NAMES, EXTRAS, MESH_HEIGHT, SUITOR_URL, antinousClips, antinousLook, extraClips, fitFor, gearScale, handProp, isFallen, turnFor,
} from "../src/render/monsters/suitors/look";

function glbClipNames(path: string): Set<string> {
  const bytes = readFileSync(path);
  const parsed = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString("utf8")) as { animations: { name: string }[] };
  return new Set(parsed.animations.map((a) => a.name));
}

const available = glbClipNames(`public${SUITOR_URL}`);
const suitors = ENEMIES.find((e) => e.id === "suitors");
const base = { windup: 0, attackId: null as string | null, defeated: false, hitFlash: 0 };

describe("suitors clips", () => {
  it("only names clips that exist in suitor.glb", () => {
    for (const name of CLIP_NAMES) expect(available.has(name)).toBe(true);
  });

  it("winds up every attack, scrubbed by the windup, with the throw and the sword rush looking different", () => {
    expect(suitors).toBeDefined();
    const clips = new Set<string>();
    for (const attack of suitors?.attacks ?? []) {
      const d = decideMonsterClip(antinousClips(1), { ...base, phaseIndex: 1, attackId: attack.id, windup: 0.6 }, available, newDecision());
      expect(d.scrub).toBeCloseTo(0.6);
      clips.add(d.clip ?? "none");
    }
    expect(clips.size).toBeGreaterThanOrEqual(3);
  });

  it("flinches on a hit, falls on defeat and idles differently once armed", () => {
    const hit = decideMonsterClip(antinousClips(0), { ...base, phaseIndex: 0, hitFlash: 1 }, available, newDecision());
    const dead = decideMonsterClip(antinousClips(2), { ...base, phaseIndex: 2, defeated: true }, available, newDecision());
    expect(hit.clip).toBe("Hit_Knockback");
    expect(dead.clip).toBe("Hit_Knockback");
    expect(antinousClips(0).idle).not.toBe(antinousClips(1).idle);
    expect(antinousClips(2).timeScale ?? 1).toBeGreaterThan(antinousClips(0).timeScale ?? 1);
  });

  it("gives the flanking suitors a throw that exists in the file", () => {
    for (const extra of EXTRAS) expect(available.has(extraClips(extra).windup.default)).toBe(true);
  });
});

describe("suitors look", () => {
  it("dresses Antinous differently in each phase, in purple and gold", () => {
    const looks = [0, 1, 2].map((p) => JSON.stringify(antinousLook(p)));
    expect(new Set(looks).size).toBe(3);
    expect(antinousLook(0).cuirass).toBe(false);
    expect(antinousLook(2).guard).toBe("table");
    expect(ANTINOUS_PALETTE.cloth).toBe("#3a1c63");
  });

  it("holds the right thing for each attack and turns toward the thrown spear", () => {
    const look = antinousLook(1);
    expect(handProp("ox_hoof", look)).toBe("hoof");
    expect(handProp("spear_left", look)).toBe("spear");
    expect(handProp("sword_rush", look)).toBe("sword");
    expect(handProp(null, antinousLook(0))).toBe("none");
    expect(turnFor("spear_left")).toBeLessThan(0);
    expect(turnFor("spear_right")).toBeGreaterThan(0);
    expect(turnFor("sword_rush")).toBe(0);
  });

  it("makes men fall as phases pass, and everyone on defeat", () => {
    const rear = EXTRAS.find((e) => e.id === "rear") ?? null;
    const left = EXTRAS.find((e) => e.id === "left") ?? null;
    expect(isFallen(rear, 0, false)).toBe(false);
    expect(isFallen(rear, 1, false)).toBe(true);
    expect(isFallen(left, 2, false)).toBe(false);
    expect(isFallen(left, 2, true)).toBe(true);
  });

  it("scales gear and fit to the figure's height", () => {
    expect(gearScale(ANTINOUS_HEIGHT)).toBeCloseTo(ANTINOUS_HEIGHT / MESH_HEIGHT);
    expect(fitFor(ANTINOUS_HEIGHT).targetHeight).toBeGreaterThan(fitFor(1.8).targetHeight);
  });

  it("puts the weak spots on the body parts they name, inside Antinous's height", () => {
    const spots = new Map((suitors?.weakSpots ?? []).map((w) => [w.id, w.position]));
    const throat = spots.get("throat");
    const chest = spots.get("chest");
    const helm = spots.get("helm");
    expect(throat).toBeDefined();
    expect(chest).toBeDefined();
    expect(helm).toBeDefined();
    if (!throat || !chest || !helm) return;
    expect(helm[1]).toBeGreaterThan(throat[1]);
    expect(throat[1]).toBeGreaterThan(chest[1]);
    expect(helm[1]).toBeLessThanOrEqual(ANTINOUS_HEIGHT);
    expect(chest[1]).toBeGreaterThan(ANTINOUS_HEIGHT * 0.5);
  });
});
