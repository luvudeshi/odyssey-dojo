// Turns the friend's FaceTime camera into the frames the move detectors read, the same frames the webcam tracker
// hands out. The webcam tracker (src/pose/tracker.ts) opens its own camera with getUserMedia and cannot be given
// another video, so this is a second, smaller reader built the same way: a parked <video> playing the remote
// track, and a pose model run on each new picture.
//
// A phone held upright sends a tall picture and the detectors were tuned on a 4:3 webcam, where a distance across
// the picture and the same distance down it are different shares of it. So each picture is first drawn, whole, into
// the middle of a 640 x 480 canvas with bars at the sides, and the model reads that canvas: the body then has the
// proportions it would have in front of a webcam.
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { log } from "../core/log";
import type { Landmark, PoseFrame } from "../core/types";
import { containFit } from "./frameLayout";

export const READ_WIDTH = 640;
export const READ_HEIGHT = 480;

/** Finds the body in one picture. The real one is MediaPipe; the loopback demo page passes its own. */
export interface PoseDetector {
  detect(picture: HTMLCanvasElement, t: number): PoseFrame | null;
  close(): void;
}

export interface RemotePlayer {
  /** The friend's picture, for a preview box. */
  readonly video: HTMLVideoElement;
  /** The newest frame, or null when there is no new picture or nobody is in it. */
  read(): PoseFrame | null;
  /** Pictures read and bodies found so far, for the card ("We can see your friend"). */
  stats(): { readonly pictures: number; readonly poses: number };
  stop(): void;
}

interface FrameCallbacks {
  requestVideoFrameCallback?: (callback: () => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
}

export function createRemotePlayer(track: MediaStreamTrack, detector: PoseDetector): RemotePlayer {
  const video = document.createElement("video");
  video.srcObject = new MediaStream([track]);
  video.muted = true;
  video.playsInline = true;
  // A video outside the page is paused by the browser: park it in a hidden box, as the webcam tracker does.
  const park = document.createElement("div");
  park.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;overflow:hidden;opacity:0;pointer-events:none";
  document.body.append(park);
  park.append(video);
  let stopped = false;
  const play = (): void => { void video.play().catch((error: unknown) => { log("warn", "facetime_video_play_refused", error); }); };
  video.addEventListener("pause", () => {
    if (stopped) return;
    if (!video.isConnected) park.append(video);
    play();
  });
  play();

  const canvas = document.createElement("canvas");
  canvas.width = READ_WIDTH;
  canvas.height = READ_HEIGHT;
  const ctx = canvas.getContext("2d");

  // requestVideoFrameCallback says exactly when a new picture is there; without it the playback clock is watched.
  const callbacks = video as HTMLVideoElement & FrameCallbacks;
  let fresh = false;
  let handle = 0;
  const exact = typeof callbacks.requestVideoFrameCallback === "function";
  const arm = (): void => {
    handle = callbacks.requestVideoFrameCallback?.(() => {
      fresh = true;
      if (!stopped) arm();
    }) ?? 0;
  };
  if (exact) arm();
  let lastTime = -1;
  let lastT = 0;
  let pictures = 0;
  let poses = 0;

  return {
    video,
    read() {
      if (stopped || !ctx || video.videoWidth === 0) return null;
      const moved = exact ? fresh : video.currentTime !== lastTime;
      if (!moved) return null;
      fresh = false;
      lastTime = video.currentTime;
      pictures += 1;
      const to = containFit(video.videoWidth, video.videoHeight, READ_WIDTH, READ_HEIGHT);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, READ_WIDTH, READ_HEIGHT);
      ctx.drawImage(video, to.x, to.y, to.w, to.h);
      // The model wants times that only go up.
      const t = Math.max(performance.now(), lastT + 1);
      lastT = t;
      let frame: PoseFrame | null = null;
      try {
        frame = detector.detect(canvas, t);
      } catch (error) {
        log("warn", "facetime_pose_failed", error);
      }
      if (frame) poses += 1;
      return frame;
    },
    stats: () => ({ pictures, poses }),
    stop() {
      stopped = true;
      if (handle !== 0) callbacks.cancelVideoFrameCallback?.(handle);
      video.srcObject = null;
      park.remove();
      detector.close();
    },
  };
}

function mirrored(points: readonly { x: number; y: number; z: number; visibility?: number }[], flip: (x: number) => number): Landmark[] {
  return points.map((p) => ({ x: flip(p.x), y: p.y, z: p.z, visibility: p.visibility ?? 0 }));
}

/**
 * The same model and files as the webcam tracker (public/mediapipe), on the GPU and then the CPU. The picture is
 * mirrored like the webcam's, so the friend's left hand is at the left, as the detectors expect.
 */
export async function mediapipeDetector(): Promise<PoseDetector> {
  const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
  let landmarker: PoseLandmarker | null = null;
  for (const delegate of ["GPU", "CPU"] as const) {
    try {
      landmarker = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: "/mediapipe/pose_landmarker_lite.task", delegate },
        runningMode: "VIDEO",
        numPoses: 1,
      });
      break;
    } catch (error) {
      log("warn", "facetime_pose_model_failed", error);
    }
  }
  if (!landmarker) throw new Error("No pose model could start");
  const model = landmarker;
  return {
    detect(picture, t) {
      const result = model.detectForVideo(picture, t);
      const image = result.landmarks[0];
      const world = result.worldLandmarks[0];
      if (!image || !world) return null;
      return { t, image: mirrored(image, (x) => 1 - x), world: mirrored(world, (x) => -x) };
    },
    close() { model.close(); },
  };
}
