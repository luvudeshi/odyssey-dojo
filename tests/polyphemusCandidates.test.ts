// The giant candidate's clip names must exist in the shipped file, and the clip rules must pick them for each fight moment.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decideMonsterClip, newDecision } from "../src/render/models/clipMap";
import { GIANT_CLIPS, GIANT_URL } from "../src/render/models/giantClips";

function glbClipNames(path: string): Set<string> {
  const bytes = readFileSync(path);
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8")) as { animations: { name: string }[] };
  return new Set(json.animations.map((a) => a.name));
}

const available = glbClipNames(`public${GIANT_URL}`);
interface Moment { windup: number; attackId: string | null; defeated: boolean; hitFlash: number }
const base: Moment = { windup: 0, attackId: null, defeated: false, hitFlash: 0 };

function decide(phase: number, props: Partial<Moment>) {
  const config = GIANT_CLIPS[phase];
  if (!config) throw new Error(`no clip config for phase ${String(phase)}`);
  return decideMonsterClip(config, { ...base, phaseIndex: phase, ...props }, available, newDecision());
}

describe("giant candidate clips", () => {
  it("names only clips that exist in giant.glb", () => {
    for (const config of GIANT_CLIPS) {
      const names = [config.idle, config.windup.default, config.hit, config.death, config.byPhase?.[2]?.idle ?? config.idle];
      for (const name of names) expect(available.has(name)).toBe(true);
    }
  });

  it("idles, scrubs the swing by windup for every attack, flinches on a hit and dies on defeat", () => {
    expect(decide(0, {}).clip).toMatch(/Idle$/);
    for (const attackId of ["club_left", "club_right", "grab", "boulder"]) {
      const d = decide(1, { windup: 0.6, attackId });
      expect(d.clip).toMatch(/Attack$/);
      expect(d.scrub).toBeCloseTo(0.6);
    }
    expect(decide(0, { hitFlash: 1 }).clip).toMatch(/HitRecieve$/);
    expect(decide(2, { defeated: true }).clip).toMatch(/Death$/);
  });

  it("looks different when Blinded: a wild walk, faster", () => {
    const blinded = decide(2, {});
    expect(blinded.clip).toMatch(/Walk$/);
    expect(blinded.timeScale).toBeGreaterThan(decide(0, {}).timeScale);
  });
});
