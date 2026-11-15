// The session's one camera: it outlives every fight and restarts once when pictures stop for good.
import { expect, test } from "vitest";
import type { PoseFrame } from "../src/core/types";
import { STALL_MS, createCameraSession } from "../src/pose/cameraSession";
import type { PoseTracker } from "../src/pose/tracker";
import { frameAt } from "./poseFixture";

interface Fake {
  readonly tracker: PoseTracker;
  /** The camera puts one new picture on the video. */
  readonly picture: () => void;
  stops: number;
}

function fakeCamera(pose: PoseFrame): Fake {
  let next: VideoFrameRequestCallback | undefined;
  const video = {
    requestVideoFrameCallback: (callback: VideoFrameRequestCallback): number => { next = callback; return 1; },
    cancelVideoFrameCallback: (): void => { next = undefined; },
  };
  const fake: Fake = {
    tracker: { video: video as unknown as HTMLVideoElement, read: () => pose, stop: () => { fake.stops += 1; } },
    picture: () => {
      const callback = next;
      next = undefined;
      callback?.(0, { captureTime: 0 } as VideoFrameCallbackMetadata);
    },
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

test("one camera for the session: a second start, fight after fight and long gaps with pictures never open or stop another", async () => {
  const first = fakeCamera(frameAt(1));
  const cameras = opener([first]);
  const session = createCameraSession(cameras.open);
  const shared = await session.start();
  // The title's button pressed again, "Use camera" on a live panel, a retry or the next stop all ask again.
  expect(await session.start()).toBe(shared);
  for (let t = 0; t < 20 * STALL_MS; t += 250) {
    first.picture();
    session.check(t);
  }
  expect(cameras.opened()).toBe(1);
  expect(first.stops).toBe(0);
  expect(session.status()).toBe("live");
  expect(shared.read()).toEqual(frameAt(1));
});

test("no picture past the tracker's own recovery restarts the camera once, under the same shared tracker", async () => {
  const first = fakeCamera(frameAt(1));
  const second = fakeCamera(frameAt(2));
  const cameras = opener([first, second]);
  const session = createCameraSession(cameras.open);
  const shared = await session.start();
  first.picture();
  session.check(1000);
  session.check(1000 + STALL_MS - 100);
  expect(session.status()).toBe("live");
  session.check(1000 + STALL_MS + 100);
  expect(session.status()).toBe("restarting");
  expect(first.stops).toBe(1);
  expect(shared.read()).toBeNull();
  await flush();
  expect(session.status()).toBe("live");
  expect(cameras.opened()).toBe(2);
  expect(shared.read()).toEqual(frameAt(2));
  expect(shared.video).toBe(second.tracker.video);
});

test("a restart that fails, or a second stall before any picture, leaves it failed; the player can start it again", async () => {
  const first = fakeCamera(frameAt(1));
  const cameras = opener([first, null, fakeCamera(frameAt(3))]);
  const session = createCameraSession(cameras.open);
  const shared = await session.start();
  session.check(0);
  session.check(STALL_MS + 1);
  await flush();
  expect(session.status()).toBe("failed");
  expect(shared.read()).toBeNull();
  expect(await session.start()).toBe(shared);
  expect(session.status()).toBe("live");
  expect(shared.read()).toEqual(frameAt(3));

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
