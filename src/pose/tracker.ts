// Webcam + MediaPipe pose tracking. Runs fully in the browser from files in public/mediapipe.
// The tracker hands out raw poses (the recorder stores them as test traces); smoothing lives downstream.
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { PoseLandmarkerResult } from "@mediapipe/tasks-vision";
import { log } from "../core/log";
import type { Landmark, PoseFrame } from "../core/types";
import { duoCamera } from "../duo/duoCamera";
import { createFreshFrame, createRateMeter, tooSlow, watchCameraFrames } from "./freshFrame";

export interface PoseTracker {
  readonly video: HTMLVideoElement;
  /** The newest frame, or null when the camera has no new picture or sees nobody. */
  read(): PoseFrame | null;
  stop(): void;
}

/** Delivery counters for ?debug runs (window.__trackerStats). Plain numbers, no effect on the game. */
export interface TrackerStats {
  reads: number; noFrame: number; noPerson: number; poses: number; errors: number; pauses: number; restarts: number; marks: number;
  detectMs: number[]; poseTimes: number[]; events: string[]; delegate: string; model: string;
}

// Best first: the GPU, then the CPU if the GPU will not start or keeps failing. Only the lite model is vendored.
const PLANS = [
  { model: "lite", delegate: "GPU" },
  { model: "lite", delegate: "CPU" },
] as const;
type Plan = (typeof PLANS)[number];

const STALL_MS = 1500;
const REVIVE_EVERY_MS = 3000;
const MAX_KEPT = 4000;

function mirrored(points: readonly { x: number; y: number; z: number; visibility?: number }[], flip: (x: number) => number): Landmark[] {
  return points.map((p) => ({ x: flip(p.x), y: p.y, z: p.z, visibility: p.visibility ?? 0 }));
}

function openCamera(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, frameRate: { ideal: 30 }, facingMode: "user" } });
}

export async function startTracker(): Promise<PoseTracker> {
  let stream = await openCamera();
  const video = document.createElement("video");
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  // A video that leaves the page is paused by the browser and stays paused when a screen puts it back, so it
  // would hand out no pictures for the rest of the session. Park it in a hidden box and press play again.
  const park = document.createElement("div");
  park.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;overflow:hidden;opacity:0;pointer-events:none";
  document.body.append(park);
  park.append(video);
  const stats: TrackerStats = { reads: 0, noFrame: 0, noPerson: 0, poses: 0, errors: 0, pauses: 0, restarts: 0, marks: 0, detectMs: [], poseTimes: [], events: [], delegate: "GPU", model: "lite" };
  const note = (what: string): void => { if (stats.events.length < 60) stats.events.push(`${what}@${String(Math.round(performance.now()))}`); };
  if (new URLSearchParams(location.search).has("debug")) (window as unknown as { __trackerStats: TrackerStats }).__trackerStats = stats;
  let stopped = false;
  video.addEventListener("pause", () => {
    if (stopped) return;
    stats.pauses++;
    note("pause");
    if (!video.isConnected) park.append(video);
    void video.play().catch(() => { note("play-refused"); });
  });
  await video.play();

  const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
  const build = (plan: Plan): Promise<PoseLandmarker> => PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: `/mediapipe/pose_landmarker_${plan.model}.task`, delegate: plan.delegate },
    runningMode: "VIDEO",
    numPoses: duoCamera.wanted(),
  });
  // Two players on one camera (src/duo): how many bodies the model in use was last told to look for.
  let looking = duoCamera.wanted();
  let lastT = 0;
  // The first call on a new landmarker compiles GPU programs (0.6 to 2 s). Do it now, off the fight.
  const warm = (made: PoseLandmarker): void => {
    lastT = Math.max(performance.now(), lastT + 1);
    try { made.detectForVideo(video, lastT); } catch { /* the first real read reports it */ }
  };
  const wanted = new URLSearchParams(location.search).get("pose");
  let level = wanted === "cpu" ? 1 : 0;
  let landmarker: PoseLandmarker | null = null;
  while (!landmarker && level < PLANS.length) {
    try { landmarker = await build(PLANS[level] ?? PLANS[0]); } catch (error) { log("warn", "pose_model_failed", error); level++; }
  }
  if (!landmarker) throw new Error("No pose model could start");
  warm(landmarker);
  const announce = (): void => {
    const plan = PLANS[level] ?? PLANS[0];
    stats.model = plan.model;
    stats.delegate = plan.delegate;
    note(`${plan.model}/${plan.delegate}`);
  };
  announce();

  // Builds the landmarker at `next` in the background and swaps it in; the old one keeps serving until then.
  let building = false;
  const swapTo = (next: number): void => {
    if (building || next >= PLANS.length || stopped) return;
    building = true;
    build(PLANS[next] ?? PLANS[0]).then(
      (made) => {
        building = false;
        if (stopped) { made.close(); return; }
        warm(made);
        landmarker?.close();
        landmarker = made;
        level = next;
        stats.restarts++;
        announce();
      },
      (error: unknown) => {
        building = false;
        log("warn", "pose_model_failed", error);
        swapTo(next + 1);
      },
    );
  };

  let camera = createFreshFrame();
  let stopWatching = watchCameraFrames(video, (captured) => { stats.marks++; camera.mark(performance.now(), captured); });
  let lastCount = video.getVideoPlaybackQuality().totalVideoFrames;
  let lastFreshAt = performance.now();
  let lastRevive = 0;
  let consecutiveErrors = 0;
  let revivesInARow = 0;
  let slowSince = 0;
  let lastCaptured = -Infinity;
  const posesMeter = createRateMeter(3000);
  const cameraMeter = createRateMeter(3000);

  // The camera stopped sending pictures: press play and re-arm the frame callback; if that did not help twice, or the track ended, open the camera again.
  const revive = (): void => {
    stats.restarts++;
    revivesInARow++;
    note("revive");
    void video.play().catch(() => { note("play-refused"); });
    stopWatching?.();
    camera = createFreshFrame();
    stopWatching = watchCameraFrames(video, (captured) => { stats.marks++; camera.mark(performance.now(), captured); });
    if (revivesInARow >= 2 || stream.getVideoTracks().every((track) => track.readyState === "ended")) {
      note("reopen-camera");
      for (const track of stream.getTracks()) track.stop();
      openCamera().then(
        (next) => {
          if (stopped) { for (const track of next.getTracks()) track.stop(); return; }
          stream = next;
          video.srcObject = next;
          void video.play().catch(() => { note("play-refused"); });
        },
        (error: unknown) => { log("warn", "camera_reopen_failed", error); },
      );
    }
  };

  const keep = (list: number[], value: number): void => { list.push(value); if (list.length > MAX_KEPT) list.shift(); };

  return {
    video,
    read() {
      stats.reads++;
      const now = performance.now();
      const count = video.getVideoPlaybackQuality().totalVideoFrames;
      const moved = count !== lastCount;
      if (moved) cameraMeter.hit(now, count - lastCount);
      lastCount = count;
      const marked = camera.take();
      // requestVideoFrameCallback is exact while it works. When it goes quiet (the browser can drop it), the decoder's picture count takes over.
      // A pose is stamped with the time its picture was taken, so the move reads and the hero see the real age of the frame.
      const captured = marked ? camera.captured() : now;
      // A late callback for a picture the decoder count already sent is not news: never detect or deliver it twice.
      const fresh = (stopWatching ? marked || (moved && camera.silentFor(now) > 200) : moved) && captured > lastCaptured;
      if (!fresh || !landmarker) {
        stats.noFrame++;
        if (now - lastFreshAt > STALL_MS && now - lastRevive > REVIVE_EVERY_MS && !document.hidden) { lastRevive = now; revive(); }
        return null;
      }
      lastFreshAt = now;
      revivesInARow = 0;
      lastCaptured = captured;
      const t = Math.max(captured, lastT + 1);
      lastT = t;
      if (looking !== duoCamera.wanted()) {
        looking = duoCamera.wanted();
        void landmarker.setOptions({ numPoses: looking }).catch((error: unknown) => { log("warn", "pose_options_failed", error); });
      }
      let result: PoseLandmarkerResult;
      try {
        result = landmarker.detectForVideo(video, t);
        consecutiveErrors = 0;
      } catch (error) {
        // One bad frame (or a landmarker that broke) must not end tracking: rebuild it, and step down a level if it keeps failing.
        stats.errors++;
        consecutiveErrors++;
        note("detect-error");
        log("warn", "pose_detect_failed", error);
        swapTo(consecutiveErrors >= 3 ? level + 1 : level);
        return null;
      }
      keep(stats.detectMs, performance.now() - now);
      posesMeter.hit(now);
      // Only a debug note: with one model left there is nothing faster to step down to (the CPU is slower).
      if (tooSlow(cameraMeter.perSecond(now), posesMeter.perSecond(now))) {
        slowSince ||= now;
        if (now - slowSince > 3000) { note("too-slow"); slowSince = 0; }
      } else slowSince = 0;
      if (duoCamera.on()) {
        // Every body goes to the seats; player one's frame comes back and is handed out as the one pose always was.
        const bodies = result.landmarks.map((image, i) => ({ image: mirrored(image, (x) => 1 - x), world: mirrored(result.worldLandmarks[i] ?? [], (x) => -x) }));
        const first = duoCamera.take(bodies, t);
        if (!first) { stats.noPerson++; return null; }
        stats.poses++;
        keep(stats.poseTimes, t);
        return first;
      }
      const image = result.landmarks[0];
      const world = result.worldLandmarks[0];
      if (!image || !world) { stats.noPerson++; return null; }
      stats.poses++;
      keep(stats.poseTimes, t);
      return { t, image: mirrored(image, (x) => 1 - x), world: mirrored(world, (x) => -x) };
    },
    stop() {
      stopped = true;
      stopWatching?.();
      for (const track of stream.getTracks()) track.stop();
      landmarker?.close();
      park.remove();
    },
  };
}
