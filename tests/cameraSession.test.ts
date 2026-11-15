// The session's one camera: it outlives every fight, plays again after leaving the page, and restarts once when it stops.
import { expect, test } from "vitest";
import type { PoseFrame } from "../src/core/types";
import { STALL_MS, createCameraSession } from "../src/pose/cameraSession";
import type { PoseTracker } from "../src/pose/tracker";
import { frameAt } from "./poseFixture";

interface Fake {
  readonly tracker: PoseTracker;
  readonly video: { paused: boolean; isConnected: boolean; plays: number };
  readonly track: { readyState: MediaStreamTrackState };
  /** The camera puts one new picture on the video. */
  readonly picture: () => void;
  stops: number;
}

function fakeCamera(pose: PoseFrame): Fake {
  let next: (() => void) | undefined;
  const track: { readyState: MediaStreamTrackState } = { readyState: "live" };
  const video = {
    paused: false,
    isConnected: true,
    plays: 0,
    srcObject: { getVideoTracks: () => [track] },
    play: (): Promise<void> => { video.paused = false; video.plays += 1; return Promise.resolve(); },
    requestVideoFrameCallback: (callback: () => void): number => { next = callback; return 1; },
    cancelVideoFrameCallback: (): void => { next = undefined; },
  };
  const fake: Fake = {
    tracker: { video: video as unknown as HTMLVideoElement, read: () => pose, stop: () => { fake.stops += 1; } },
    video,
    track,
    picture: () => { const callback = next; next = undefined; callback?.(); },
    stops: 0,
  };
  return fake;
}

/** Hands out the given cameras one per start; a missing one is a failed start. */
function opener(cameras: readonly (Fake | null)[]): { open: () => Promise<PoseTracker>; opened: () => number } {
  let n = 0;
  return {
    open: () => {
      const camera = cameras[n];
      n += 1;
      return camera ? Promise.resolve(camera.tracker) : Promise.reject(new Error("NotReadableError"));
    },
    opened: () => n,
  };
}

const flush = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 0); });

test("one camera for the session: a second start, a fight's end, the map, the next stop, a retry or a pause never open or stop another", async () => {
  const first = fakeCamera(frameAt(1));
  const cameras = opener([first]);
  const session = createCameraSession(cameras.open);
  const shared = await session.start();
  expect(await session.start()).toBe(shared);
  expect(session.status()).toBe("live");
  first.picture();
  session.check(0);

  // Fight over, back to the map: the panel goes and the browser pauses the video it held.
  first.video.isConnected = false;
  first.video.paused = true;
  session.check(250);
  expect(first.video.plays).toBe(1);
  expect(first.video.paused).toBe(false);
  // Minutes on the map and the intro with no pictures counted: off the page that is no stall.
  session.check(250 + 10 * STALL_MS);
  // The next stop's calibration puts the video back; pictures come again.
  first.video.isConnected = true;
  session.check(300 + 10 * STALL_MS);
  first.picture();
  session.check(400 + 10 * STALL_MS);

  expect(cameras.opened()).toBe(1);
  expect(first.stops).toBe(0);
  expect(session.status()).toBe("live");
  expect(shared.read()).toEqual(frameAt(1));
});

test("a stream that ends is restarted once, under the same shared tracker", async () => {
  const first = fakeCamera(frameAt(1));
  const second = fakeCamera(frameAt(2));
  const cameras = opener([first, second]);
  const session = createCameraSession(cameras.open);
  const shared = await session.start();
  first.track.readyState = "ended";
  session.check(0);
  expect(session.status()).toBe("restarting");
  expect(first.stops).toBe(1);
  expect(shared.read()).toBeNull();
  await flush();
  expect(session.status()).toBe("live");
  expect(cameras.opened()).toBe(2);
  expect(shared.read()).toEqual(frameAt(2));
  expect(shared.video).toBe(second.tracker.video);
});

test("no picture for over 2 s while the video is on screen restarts the camera; under 2 s does not", async () => {
  const first = fakeCamera(frameAt(1));
  const cameras = opener([first, fakeCamera(frameAt(2))]);
  const session = createCameraSession(cameras.open);
  await session.start();
  first.picture();
  session.check(1000);
  session.check(1000 + STALL_MS - 100);
  expect(session.status()).toBe("live");
  session.check(1000 + STALL_MS + 100);
  expect(session.status()).toBe("restarting");
  await flush();
  expect(session.status()).toBe("live");
  expect(cameras.opened()).toBe(2);
});

test("a restart that fails, or a second failure before any picture, leaves it failed; the player can start it again", async () => {
  const first = fakeCamera(frameAt(1));
  const third = fakeCamera(frameAt(3));
  const cameras = opener([first, null, third]);
  const session = createCameraSession(cameras.open);
  const shared = await session.start();
  first.track.readyState = "ended";
  session.check(0);
  await flush();
  expect(session.status()).toBe("failed");
  expect(shared.read()).toBeNull();
  expect(await session.start()).toBe(shared);
  expect(session.status()).toBe("live");
  expect(shared.read()).toEqual(frameAt(3));

  // Restarted once and never sent a picture: the next failure is not retried.
  const cams = opener([fakeCamera(frameAt(1)), fakeCamera(frameAt(2)), fakeCamera(frameAt(4))]);
  const again = createCameraSession(cams.open);
  await again.start();
  again.check(0);
  again.check(STALL_MS + 1);
  await flush();
  again.check(STALL_MS + 2);
  again.check(2 * STALL_MS + 3);
  expect(again.status()).toBe("failed");
  expect(cams.opened()).toBe(2);
});

test("a first start that fails stays off; stop() stops the camera", async () => {
  const none = createCameraSession(opener([null]).open);
  await expect(none.start()).rejects.toThrow("NotReadableError");
  expect(none.status()).toBe("off");

  const only = fakeCamera(frameAt(1));
  const session = createCameraSession(opener([only]).open);
  const changes: string[] = [];
  session.subscribe(() => { changes.push(session.status()); });
  const shared = await session.start();
  session.stop();
  expect(only.stops).toBe(1);
  expect(shared.read()).toBeNull();
  expect(changes).toEqual(["starting", "live", "off"]);
});
