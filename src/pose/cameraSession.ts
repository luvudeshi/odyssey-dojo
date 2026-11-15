// One camera for the whole session: started once when the player picks the webcam, then shared by every calibration
// and fight, so nothing between fights can lose it. The tracker mends its own stalls (it presses play again and
// reopens the camera within about 5 s); if pictures still have not come back after STALL_MS, this restarts the whole
// tracker once, and failing again leaves it "failed" until the player asks for the camera.
import { log } from "../core/log";
import { watchCameraFrames } from "./freshFrame";
import type { PoseTracker } from "./tracker";

export type CameraStatus = "off" | "starting" | "live" | "restarting" | "failed";

/** Past the tracker's own recovery (a revive at 1.5 s, a camera reopen at the second revive 3 s later). */
export const STALL_MS = 8000;

export interface CameraSession {
  /** Starts the camera, or starts it again after a failure. Resolves to the one tracker every screen shares. */
  readonly start: () => Promise<PoseTracker>;
  readonly stop: () => void;
  readonly status: () => CameraStatus;
  readonly subscribe: (listener: () => void) => () => void;
  /** The watchdog: App calls it a few times a second. */
  readonly check: (now: number) => void;
}

const hidden = (): boolean => typeof document !== "undefined" && document.hidden;

export function createCameraSession(open: () => Promise<PoseTracker>): CameraSession {
  let state: CameraStatus = "off";
  let current: PoseTracker | null = null;
  let video: HTMLVideoElement | null = null;
  let pending: Promise<PoseTracker> | null = null;
  let uncount: (() => void) | null = null;
  let frames = 0;
  let seen = 0;
  let since: number | null = null;
  let retried = false;
  const listeners = new Set<() => void>();
  const set = (next: CameraStatus): void => {
    if (state === next) return;
    state = next;
    listeners.forEach((listener) => { listener(); });
  };

  // The same object for the whole session, so a restart swaps the camera under a fight without restarting the fight.
  const shared: PoseTracker = {
    get video(): HTMLVideoElement {
      if (!video) throw new Error("camera not started");
      return video;
    },
    read: () => (state === "live" ? (current?.read() ?? null) : null),
    stop: () => { session.stop(); },
  };

  const release = (): void => {
    uncount?.();
    uncount = null;
    current?.stop();
    current = null;
  };

  const launch = (next: "starting" | "restarting"): Promise<PoseTracker> => {
    set(next);
    const attempt: Promise<PoseTracker> = open().then(
      (tracker) => {
        if (pending !== attempt) {
          tracker.stop();
          throw new Error("camera stopped while starting");
        }
        pending = null;
        current = tracker;
        video = tracker.video;
        frames = 0;
        seen = 0;
        since = null;
        uncount = watchCameraFrames(tracker.video, () => { frames += 1; });
        set("live");
        return shared;
      },
      (error: unknown) => {
        if (pending === attempt) {
          pending = null;
          set(video ? "failed" : "off");
        }
        throw error;
      },
    );
    pending = attempt;
    return attempt;
  };

  const session: CameraSession = {
    start() {
      if (pending) return pending;
      if (state === "live") return Promise.resolve(shared);
      retried = false;
      return launch("starting");
    },
    stop() {
      pending = null;
      release();
      set("off");
    },
    status: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    check(now) {
      if (state !== "live") return;
      if (frames !== seen) {
        // A new picture: the camera works, and a later failure may be restarted again.
        seen = frames;
        since = now;
        retried = false;
        return;
      }
      // Without a frame counter, or in a hidden tab, pictures are not expected: the clock does not run.
      if (!uncount || hidden() || since === null) { since = now; return; }
      if (now - since <= STALL_MS) return;
      log("warn", "camera_restart", "no picture");
      release();
      if (retried) { set("failed"); return; }
      retried = true;
      launch("restarting").catch((error: unknown) => { log("warn", "camera_restart_failed", error); });
    },
  };
  return session;
}
