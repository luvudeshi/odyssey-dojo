import { describe, expect, it } from "vitest";
import { createFreshFrame, createRateMeter, tooSlow, watchCameraFrames } from "../src/pose/freshFrame";

describe("watchCameraFrames", () => {
  type Callback = (now: number, metadata: VideoFrameCallbackMetadata) => void;
  function fakeVideo(): { video: HTMLVideoElement; fire: (now?: number, captureTime?: number) => void; cancelled: number[] } {
    let next: Callback | undefined;
    let id = 0;
    const cancelled: number[] = [];
    const video = {
      requestVideoFrameCallback(cb: Callback) { next = cb; return ++id; },
      cancelVideoFrameCallback(h: number) { cancelled.push(h); next = undefined; },
    } as unknown as HTMLVideoElement;
    const fire = (now = 1000, captureTime?: number): void => {
      const cb = next;
      next = undefined;
      cb?.(now, { captureTime } as VideoFrameCallbackMetadata);
    };
    return { video, fire, cancelled };
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
  it("hands on the camera's capture time, or the callback time when it is missing or on another clock", () => {
    const { video, fire } = fakeVideo();
    const seen: number[] = [];
    watchCameraFrames(video, (captured) => { seen.push(captured); });
    fire(1000, 960);
    fire(1033);
    fire(1066, 5000);
    fire(1100, 1);
    expect(seen).toEqual([960, 1033, 1066, 1100]);
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

describe("captured", () => {
  it("is the capture time of the last mark, or the mark time when none was given", () => {
    const frame = createFreshFrame(0);
    frame.mark(500, 460);
    expect(frame.captured()).toBe(460);
    frame.mark(533);
    expect(frame.captured()).toBe(533);
  });
});

describe("silentFor", () => {
  it("counts from the last mark", () => {
    const frame = createFreshFrame(100);
    expect(frame.silentFor(350)).toBe(250);
    frame.mark(300);
    expect(frame.silentFor(350)).toBe(50);
  });
});

describe("createRateMeter and tooSlow", () => {
  it("knows nothing until it has watched a full window, then counts per second", () => {
    const meter = createRateMeter(1000, 0);
    meter.hit(100, 5);
    expect(meter.perSecond(500)).toBeNull();
    meter.hit(1100);
    expect(meter.perSecond(1200)).toBe(1);
    expect(meter.perSecond(5000)).toBe(0);
  });
  it("flags a camera that sends 30 a second while the game gets under 15 poses", () => {
    expect(tooSlow(30, 10)).toBe(true);
    expect(tooSlow(30, 28)).toBe(false);
    expect(tooSlow(12, 10)).toBe(false);
    expect(tooSlow(null, 10)).toBe(false);
    expect(tooSlow(30, null)).toBe(false);
  });
});
