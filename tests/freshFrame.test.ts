import { describe, expect, it } from "vitest";
import { createFreshFrame } from "../src/pose/freshFrame";

describe("createFreshFrame", () => {
  it("is not fresh before the camera has sent anything", () => {
    expect(createFreshFrame().take()).toBe(false);
  });
  it("is fresh once per camera picture, however often it is asked", () => {
    const frame = createFreshFrame();
    frame.mark();
    expect([frame.take(), frame.take(), frame.take()]).toEqual([true, false, false]);
    frame.mark();
    expect(frame.take()).toBe(true);
  });
  it("two pictures between reads count as one fresh read", () => {
    const frame = createFreshFrame();
    frame.mark();
    frame.mark();
    expect([frame.take(), frame.take()]).toEqual([true, false]);
  });
});
