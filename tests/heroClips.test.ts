import { describe, expect, test } from "vitest";
import { candidate as spartan } from "../src/render/hero/defs/spartan";
import { CONTACT_LEAD, chooseHeroPose, decideHeroPose, strikeStart, strikeWindow } from "../src/render/hero/heroClips";
import type { HeroInput, HeroRig } from "../src/render/hero/heroClips";
import { newDecision } from "../src/render/models/clipMap";

const rig: HeroRig = {
  idle: "Idle",
  poses: { block: ["Guard", "Block"], duck: ["Crouch"], punch: ["Chop"], thrust: ["Stab"], hurt: ["Hit"], victory: ["Cheer"], defeat: ["Die"], dodgeLeft: ["Left"] },
  byMove: { hook: "Sweep" },
  punch: { seconds: 0.5, hit: 0.5 },
  thrust: { seconds: 0.5, hit: 0.4 },
  hurt: { seconds: 0.4 },
};
const all = new Set(["Idle", "Guard", "Crouch", "Chop", "Stab", "Hit", "Cheer", "Die", "Left", "Sweep"]);
const calm: HeroInput = { held: new Set(), struckMove: "", sinceStrike: Infinity, sinceHurt: Infinity, won: false, lost: false, finisherMove: null };

describe("chooseHeroPose", () => {
  test("idles when nothing happens", () => {
    expect(chooseHeroPose(rig, calm)).toBe("idle");
  });
  test("held defends map to their poses", () => {
    expect(chooseHeroPose(rig, { ...calm, held: new Set(["block"]) })).toBe("block");
    expect(chooseHeroPose(rig, { ...calm, held: new Set(["duck"]) })).toBe("duck");
    expect(chooseHeroPose(rig, { ...calm, held: new Set(["dodge_left"]) })).toBe("dodgeLeft");
    expect(chooseHeroPose(rig, { ...calm, held: new Set(["dodge_right"]) })).toBe("dodgeRight");
  });
  test("a strike lasts its window, thrust for two-handed moves and the finisher", () => {
    const strike = { ...calm, struckMove: "jab", sinceStrike: 0.1 };
    expect(chooseHeroPose(rig, strike)).toBe("punch");
    expect(chooseHeroPose(rig, { ...strike, struckMove: "spear_thrust" })).toBe("thrust");
    expect(chooseHeroPose(rig, { ...strike, struckMove: "uppercut", finisherMove: "uppercut" })).toBe("thrust");
    expect(chooseHeroPose(rig, { ...strike, sinceStrike: strikeWindow(rig.punch) + 0.01 })).toBe("idle");
  });
  test("hurt beats a defend, defeat beats everything, victory waits for the killing blow to play", () => {
    expect(chooseHeroPose(rig, { ...calm, held: new Set(["block"]), sinceHurt: 0.1 })).toBe("hurt");
    expect(chooseHeroPose(rig, { ...calm, sinceHurt: 0.1, lost: true })).toBe("defeat");
    const won = { ...calm, won: true, struckMove: "jab" };
    expect(chooseHeroPose(rig, { ...won, sinceStrike: 0.1 })).toBe("punch");
    expect(chooseHeroPose(rig, { ...won, sinceStrike: 5 })).toBe("victory");
  });
});

describe("decideHeroPose", () => {
  const decide = (pose: Parameters<typeof decideHeroPose>[1], input: HeroInput = calm, available: ReadonlySet<string> = all) =>
    decideHeroPose(rig, pose, input, available, newDecision());

  test("loops idle, block and duck; one-shots the rest", () => {
    expect(decide("idle")).toMatchObject({ clip: "Idle", loop: true, scrub: null });
    expect(decide("block")).toMatchObject({ clip: "Guard", loop: true });
    expect(decide("duck")).toMatchObject({ clip: "Crouch", loop: true });
    expect(decide("victory")).toMatchObject({ clip: "Cheer", loop: false });
    expect(decide("defeat")).toMatchObject({ clip: "Die", loop: false });
  });
  test("duck can freeze a clip on its crouch frame instead of looping it", () => {
    const held = { ...rig, duck: { hold: 0.3 } };
    expect(decideHeroPose(held, "duck", calm, new Set(["Idle", "Crouch"]))).toMatchObject({ clip: "Crouch", scrub: 0.3 });
  });
  test("uses the next clip in the list when the first is missing", () => {
    expect(decide("block", calm, new Set(["Idle", "Block"])).clip).toBe("Block");
  });
  test("a pose with no clips shows idle, and no idle clip means the bind pose", () => {
    expect(decide("duck", calm, new Set(["Idle"]))).toMatchObject({ clip: "Idle", loop: true, scrub: null });
    expect(decide("duck", calm, new Set())).toMatchObject({ clip: null });
  });
  test("a specific move picks its own clip, else the pose's", () => {
    expect(decide("punch", { ...calm, struckMove: "hook", sinceStrike: 0 }).clip).toBe("Sweep");
    expect(decide("punch", { ...calm, struckMove: "jab", sinceStrike: 0 }).clip).toBe("Chop");
    expect(decide("punch", { ...calm, struckMove: "hook", sinceStrike: 0 }, new Set(["Idle", "Chop"])).clip).toBe("Chop");
  });
  test("the hit frame lands CONTACT_LEAD seconds after the engine reports the strike", () => {
    const at = (sinceStrike: number) => decide("punch", { ...calm, struckMove: "jab", sinceStrike }).scrub ?? NaN;
    expect(at(0)).toBeCloseTo(strikeStart(rig.punch));
    expect(at(CONTACT_LEAD)).toBeCloseTo(rig.punch.hit ?? 0, 5);
    expect(at(10)).toBe(1);
    expect(strikeStart({ seconds: 0.05, hit: 0.1 })).toBe(0);
  });
  test("hurt scrubs by time since the hit", () => {
    expect(decide("hurt", { ...calm, sinceHurt: 0.2 })).toMatchObject({ clip: "Hit", scrub: 0.5, loop: false });
  });
});

describe("the hero", () => {
  test("it has an idle clip and a clip for every pose or an explicit stand-in", () => {
    for (const candidate of [spartan]) {
      expect(candidate.rig.idle).toBeTruthy();
      for (const pose of ["block", "duck", "dodgeLeft", "dodgeRight", "punch", "thrust", "hurt", "victory", "defeat"] as const) {
        expect(candidate.rig.poses[pose]?.length, `${candidate.id} ${pose}`).toBeGreaterThan(0);
      }
      expect(candidate.url.startsWith("/models/")).toBe(true);
    }
  });
});
