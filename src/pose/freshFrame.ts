// Tells the tracker when the camera has delivered a new picture.
// video.currentTime of a live camera advances with the clock, so it changes on every animation frame (60 per
// second) while the camera sends 30: comparing it runs the model twice per picture and feeds duplicate frames to
// the move detectors. requestVideoFrameCallback fires once per real picture.

export interface FreshFrame {
  /** Call from the camera's frame callback. */
  mark(): void;
  /** True once after each mark. */
  take(): boolean;
}

export function createFreshFrame(): FreshFrame {
  let fresh = false;
  return {
    mark() { fresh = true; },
    take() {
      const was = fresh;
      fresh = false;
      return was;
    },
  };
}

/** Starts the per-picture callback. Returns a function that stops it, or null when the browser has no such callback. */
export function watchCameraFrames(video: HTMLVideoElement, onFrame: () => void): (() => void) | null {
  if (typeof video.requestVideoFrameCallback !== "function") return null;
  let handle = 0;
  let stopped = false;
  const again = (): void => {
    if (stopped) return;
    onFrame();
    handle = video.requestVideoFrameCallback(again);
  };
  handle = video.requestVideoFrameCallback(again);
  return () => {
    stopped = true;
    video.cancelVideoFrameCallback(handle);
  };
}
