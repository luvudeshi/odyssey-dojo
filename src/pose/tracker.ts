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

  const camera = createFreshFrame();
  const byCallback = watchCameraFrames(video, () => { camera.mark(); });
  let lastVideoTime = -1;
  return {
    video,
    read() {
      if (byCallback) {
        if (!camera.take()) return null;
      } else {
        // Older browsers: currentTime still changes more often than the camera sends pictures, but it is all there is.
        if (video.currentTime === lastVideoTime) return null;
        lastVideoTime = video.currentTime;
      }
      const t = performance.now();
      const result = landmarker.detectForVideo(video, t);
      const image = result.landmarks[0];
      const world = result.worldLandmarks[0];
      if (!image || !world) return null;
      return { t, image: mirrored(image, (x) => 1 - x), world: mirrored(world, (x) => -x) };
    },
    stop() {
      for (const track of stream.getTracks()) track.stop();
      landmarker.close();
    },
  };
}
