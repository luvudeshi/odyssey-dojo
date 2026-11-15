// Webcam + MediaPipe pose tracking. Runs fully in the browser from files in public/mediapipe.
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { Landmark, PoseFrame } from "../core/types";
import { createFreshFrame, watchCameraFrames } from "./freshFrame";

export interface PoseTracker {
  readonly video: HTMLVideoElement;
  /** The newest frame, or null when the camera has no new picture or sees nobody. */
  read(): PoseFrame | null;
  stop(): void;
}

function mirrored(points: readonly { x: number; y: number; z: number; visibility?: number }[], flip: (x: number) => number): Landmark[] {
  return points.map((p) => ({ x: flip(p.x), y: p.y, z: p.z, visibility: p.visibility ?? 0 }));
}

/** Delivery counters for ?debug runs (window.__trackerStats). Plain numbers, no effect on the game. */
export interface TrackerStats {
  reads: number; noFrame: number; noPerson: number; poses: number; errors: number; pauses: number; restarts: number;
  detectMs: number[]; poseTimes: number[]; events: string[]; delegate: string; model: string;
}

export async function startTracker(): Promise<PoseTracker> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, facingMode: "user" },
  });
  const video = document.createElement("video");
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();

  const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
  const landmarker = await PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: "/mediapipe/pose_landmarker_lite.task", delegate: "GPU" },
    runningMode: "VIDEO",
    numPoses: 1,
  });

  const stats: TrackerStats = { reads: 0, noFrame: 0, noPerson: 0, poses: 0, errors: 0, pauses: 0, restarts: 0, detectMs: [], poseTimes: [], events: [], delegate: "GPU", model: "lite" };
  if (new URLSearchParams(location.search).has("debug")) (window as unknown as { __trackerStats: TrackerStats }).__trackerStats = stats;
  video.addEventListener("pause", () => { stats.pauses++; stats.events.push(`pause@${String(Math.round(performance.now()))}`); });
  const camera = createFreshFrame();
  const stopWatching = watchCameraFrames(video, () => { camera.mark(); });
  let lastFrameCount = -1;
  return {
    video,
    read() {
      stats.reads++;
      if (stopWatching) {
        if (!camera.take()) { stats.noFrame++; return null; }
      } else {
        // No frame callback: the decoder's frame count goes up once per real picture, unlike currentTime.
        const count = video.getVideoPlaybackQuality().totalVideoFrames;
        if (count === lastFrameCount) { stats.noFrame++; return null; }
        lastFrameCount = count;
      }
      const t = performance.now();
      const result = landmarker.detectForVideo(video, t);
      stats.detectMs.push(performance.now() - t);
      const image = result.landmarks[0];
      const world = result.worldLandmarks[0];
      if (!image || !world) { stats.noPerson++; return null; }
      stats.poses++; stats.poseTimes.push(t);
      return { t, image: mirrored(image, (x) => 1 - x), world: mirrored(world, (x) => -x) };
    },
    stop() {
      stopWatching?.();
      for (const track of stream.getTracks()) track.stop();
      landmarker.close();
    },
  };
}
