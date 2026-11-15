import { describe, expect, it } from "vitest";
import { COUNTDOWN_MS, GATE_START, GRACE_MS, LOST_MS, checkPresence, countdownStep, gateStep, presenceAt } from "../src/pose/presence";
import { JOINT } from "../src/pose/signals";
import { frameAt } from "./poseFixture";

const hidden = (index: number) => {
  const frame = frameAt(0);
  const image = frame.image.map((p, i) => (i === index ? { ...p, visibility: 0.1 } : p));
  return { ...frame, image };
};

describe("checkPresence", () => {
  it("accepts a person standing arms down", () => {
    expect(checkPresence(frameAt(0))).toEqual({ ok: true });
  });
  it.each([JOINT.leftShoulder, JOINT.rightShoulder])("needs shoulder %i visible", (index) => {
    expect(checkPresence(hidden(index))).toEqual({ ok: false, reason: "I can't see you" });
  });
  it("accepts a player seen from the waist up: hips and resting hands out of the picture", () => {
    const waistUp = [JOINT.leftHip, JOINT.rightHip, JOINT.leftWrist, JOINT.rightWrist].reduce(
      (frame, index) => ({ ...frame, image: frame.image.map((p, i) => (i === index ? { ...p, visibility: 0.05 } : p)) }),
      frameAt(0),
    );
    expect(checkPresence(waistUp)).toEqual({ ok: true });
  });
  it("accepts shoulders that fill 0.6 of the picture, as at a table", () => {
    const atTable = frameAt(0, { [JOINT.leftShoulder]: [0.2, 0.35], [JOINT.rightShoulder]: [0.8, 0.35] });
    expect(checkPresence(atTable)).toEqual({ ok: true });
  });
  it("says step back when too close", () => {
    const close = frameAt(0, { [JOINT.leftShoulder]: [0.1, 0.35], [JOINT.rightShoulder]: [0.9, 0.35] });
    expect(checkPresence(close)).toEqual({ ok: false, reason: "step back" });
  });
  it("says step closer when too far", () => {
    const far = frameAt(0, { [JOINT.leftShoulder]: [0.48, 0.35], [JOINT.rightShoulder]: [0.52, 0.35] });
    expect(checkPresence(far)).toEqual({ ok: false, reason: "step closer" });
  });
  it("says move into view when off centre", () => {
    const off = frameAt(0, { [JOINT.leftShoulder]: [0.05, 0.35], [JOINT.rightShoulder]: [0.21, 0.35] });
    expect(checkPresence(off)).toEqual({ ok: false, reason: "move into view" });
  });
});

describe("presenceAt", () => {
  it("treats no frame and stale frames as not seen", () => {
    expect(presenceAt({ frames: [], baseline: null }, 0).ok).toBe(false);
    expect(presenceAt({ frames: [frameAt(0)], baseline: null }, 1000).ok).toBe(false);
    expect(presenceAt({ frames: [frameAt(900)], baseline: null }, 1000).ok).toBe(true);
  });
});

describe("countdownStep", () => {
  it("counts while ok, caps, and resets when lost", () => {
    expect(countdownStep(1000, true, 500)).toBe(1500);
    expect(countdownStep(2900, true, 500)).toBe(COUNTDOWN_MS);
    expect(countdownStep(2000, false, 16)).toBe(0);
  });
});

describe("gateStep", () => {
  it("pauses only after the body is lost longer than LOST_MS", () => {
    let gate = gateStep(GATE_START, false, LOST_MS);
    expect(gate.paused).toBe(false);
    gate = gateStep(gate, false, 1);
    expect(gate.paused).toBe(true);
  });
  it("a short loss that recovers never pauses", () => {
    const gate = gateStep(gateStep(GATE_START, false, 500), true, 16);
    expect(gate).toEqual(GATE_START);
  });
  it("resumes after GRACE_MS of presence, and flicker restarts the grace", () => {
    let gate = gateStep(GATE_START, false, LOST_MS + 1);
    gate = gateStep(gate, true, GRACE_MS - 1);
    expect(gate.paused).toBe(true);
    gate = gateStep(gate, false, 16);
    gate = gateStep(gate, true, GRACE_MS - 1);
    expect(gate.paused).toBe(true);
    expect(gateStep(gate, true, 1)).toEqual(GATE_START);
  });
});
