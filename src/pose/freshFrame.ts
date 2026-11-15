// Tells the tracker when the camera has delivered a new picture.
// video.currentTime of a live camera advances with the clock, so it changes on every animation frame (60 per
// second) while the camera sends 30: comparing it runs the model twice per picture and feeds duplicate frames to
// the move detectors. requestVideoFrameCallback fires once per real picture.

export interface FreshFrame {
  /** Call from the camera's frame callback, with the time the picture was taken when the browser knows it. */
  mark(now?: number, captured?: number): void;
  /** True once after each mark. */
  take(): boolean;
  /** When the last marked picture was taken (the mark time when the browser did not say). */
  captured(): number;
  /** Milliseconds since the last mark (since creation before the first one). */
  silentFor(now: number): number;
}

export function createFreshFrame(now: number = performance.now()): FreshFrame {
  let fresh = false;
  let markedAt = now;
  let capturedAt = now;
  return {
    mark(at: number = performance.now(), captured: number = at) { fresh = true; markedAt = at; capturedAt = captured; },
    captured() { return capturedAt; },
    silentFor(at) { return at - markedAt; },
    take() {
      const was = fresh;
      fresh = false;
      return was;
    },
  };
}

/** A capture time older than this, or later than the callback, is a different clock: use the callback time. */
const CAPTURE_SANE_MS = 500;

/**
 * Starts the per-picture callback, which gets the time the camera took the picture (captureTime) or, when the
 * browser does not say, the callback time. Returns a function that stops it, or null when the browser has no such callback.
 */
export function watchCameraFrames(video: HTMLVideoElement, onFrame: (captured: number) => void): (() => void) | null {
  if (typeof video.requestVideoFrameCallback !== "function") return null;
  let handle = 0;
  let stopped = false;
  const again = (now: number, metadata: VideoFrameCallbackMetadata): void => {
    if (stopped) return;
    const captured = metadata.captureTime;
    onFrame(captured !== undefined && captured <= now && now - captured < CAPTURE_SANE_MS ? captured : now);
    handle = video.requestVideoFrameCallback(again);
  };
  handle = video.requestVideoFrameCallback(again);
  return () => {
    stopped = true;
    video.cancelVideoFrameCallback(handle);
  };
}

/** Counts events in a sliding window, so the tracker can tell how many poses per second it really delivers. */
export interface RateMeter {
  hit(now: number, count?: number): void;
  /** Events per second over the last `windowMs`, or null until the meter has watched a full window. */
  perSecond(now: number): number | null;
}

export function createRateMeter(windowMs: number, start: number = performance.now()): RateMeter {
  const hits: number[] = [];
  return {
    hit(now, count = 1) { for (let i = 0; i < count; i++) hits.push(now); },
    perSecond(now) {
      while (hits.length > 0 && (hits[0] ?? now) < now - windowMs) hits.shift();
      return now - start < windowMs ? null : (hits.length * 1000) / windowMs;
    },
  };
}

/** The camera sends plenty of pictures but the game gets few poses: the model (or the main thread) is the bottleneck. */
export function tooSlow(cameraPerSecond: number | null, poseCallsPerSecond: number | null): boolean {
  return cameraPerSecond !== null && poseCallsPerSecond !== null && cameraPerSecond >= 24 && poseCallsPerSecond < 15;
}
