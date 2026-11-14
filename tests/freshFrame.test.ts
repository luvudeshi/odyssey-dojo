import { describe, expect, it } from "vitest";
import { createFreshFrame, watchCameraFrames } from "../src/pose/freshFrame";

describe("watchCameraFrames", () => {
  function fakeVideo(): { video: HTMLVideoElement; fire: () => void; cancelled: number[] } {
    let next: (() => void) | undefined;
    let id = 0;
    const cancelled: number[] = [];
    const video = {
      requestVideoFrameCallback(cb: () => void) { next = cb; return ++id; },
      cancelVideoFrameCallback(h: number) { cancelled.push(h); next = undefined; },
    } as unknown as HTMLVideoElement;
    return { video, fire: () => { const cb = next; next = undefined; cb?.(); }, cancelled };
  }
  it("returns null without the callback", () => {
    expect(watchCameraFrames({} as HTMLVideoElement, () => undefined)).toBeNull();
  });
  it("calls back per picture and stops when asked", () => {
    const { video, fire, cancelled } = fakeVideo();
    let n = 0;
    const stop = watchCameraFrames(video, () => { n++; });
    fire(); fire();
    expect(n).toBe(2);
    stop?.();
    fire();
    expect(n).toBe(2);
    expect(cancelled).toEqual([3]);
  });
});

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
