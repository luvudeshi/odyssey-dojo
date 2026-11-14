// Records a canvas, and the game's audio when given, into a short replay video with MediaRecorder.
// Nothing here throws: a browser that cannot record gets null, and the fight carries on.
import { log } from "../core/log";
import { attachAudio } from "./audioFeed";
import type { AttachedAudio } from "./audioFeed";

const MIME_TYPES = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"] as const;
const DEFAULT_FPS = 30;
const DEFAULT_MAX_SECONDS = 120;
const DEFAULT_BITS_PER_SECOND = 2_500_000;
/** Data is handed over in chunks this long rather than in one piece at the end. */
const CHUNK_MS = 1000;
/** How long stop() waits for the recorder's last chunk before giving back what it has. */
const STOP_GRACE_MS = 2000;
/** With audio attached, how long to wait for the first chunk before carrying on without the audio. A last resort. */
const AUDIO_WAIT_MS = 2500;

export interface RecordingOptions {
  readonly fps?: number;
  /**
   * The game's sound, typically a MediaStreamAudioDestinationNode's stream. It is recorded through a private
   * AudioContext that keeps the sound track fed while the game is quiet, so it may fall silent for as long as it
   * likes. The stream itself is left running. Where that context cannot run (no Web Audio, or no click or key yet)
   * the tracks are copied as they are, and a stream that delivers nothing in the first seconds is then dropped
   * from the replay ("replay.audioSilent" in the log) so that the picture is still kept.
   */
  readonly audio?: MediaStream | null;
  readonly maxSeconds?: number;
  readonly videoBitsPerSecond?: number;
}

export interface Recording {
  /** Ends the recording and resolves with the video, or null if nothing was recorded. Safe to call more than once. */
  stop(): Promise<Blob | null>;
}

/** The best video type this browser can record, or null if it supports none of the ones we know. */
export function pickMimeType(isSupported: (type: string) => boolean): string | null {
  for (const type of MIME_TYPES) {
    try {
      if (isSupported(type)) return type;
    } catch {
      // A browser that throws on a type it does not know simply does not support it.
    }
  }
  return null;
}

function positive(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

function stopTracks(tracks: readonly MediaStreamTrack[]): void {
  for (const track of tracks) {
    try {
      track.stop();
    } catch (error) {
      log("warn", "replay.trackStopFailed", error);
    }
  }
}

/**
 * Runs the recording. `create` builds a recorder over the stream as it stands; `dropAudio`, when there is audio,
 * takes the audio tracks back out of the stream so that a second recorder can carry on with the picture alone.
 */
function run(create: () => MediaRecorder, dropAudio: (() => void) | null, maxSeconds: number, release: () => void): Recording {
  const chunks: Blob[] = [];
  const timers: ReturnType<typeof setTimeout>[] = [];
  let settle: (blob: Blob | null) => void = () => undefined;
  const result = new Promise<Blob | null>((resolve) => {
    settle = resolve;
  });
  let current: MediaRecorder | null = null;
  let type = "video/webm";
  let stopping = false;
  let ended = false;

  const end = (): void => {
    if (ended) return;
    ended = true;
    timers.forEach(clearTimeout);
    release();
    settle(chunks.length > 0 ? new Blob(chunks, { type }) : null);
  };
  const stop = (): Promise<Blob | null> => {
    if (stopping || ended) return result;
    stopping = true;
    // The recorder's own "stop" event ends things; the timer is for a browser that never sends it.
    timers.push(setTimeout(end, STOP_GRACE_MS));
    try {
      if (current && current.state !== "inactive") current.stop();
    } catch (error) {
      log("warn", "replay.stopFailed", error);
      end();
    }
    return result;
  };
  // Events from a recorder that has since been replaced are ignored.
  const begin = (): void => {
    const recorder = create();
    recorder.addEventListener("dataavailable", (event) => {
      if (recorder === current && event.data.size > 0) chunks.push(event.data);
    });
    recorder.addEventListener("stop", () => {
      if (recorder === current) end();
    });
    recorder.addEventListener("error", () => {
      if (recorder !== current) return;
      log("warn", "replay.recorderError");
      void stop();
    });
    recorder.start(CHUNK_MS);
    current = recorder;
    type = recorder.mimeType || type;
  };

  begin();
  timers.push(
    setTimeout(() => {
      void stop();
    }, maxSeconds * 1000),
  );
  if (dropAudio) {
    // Chrome writes nothing at all while an audio track delivers no data. The audio feed prevents that; this is for
    // when there is no feed or its context is suspended. Better a silent replay missing its first seconds than none.
    timers.push(
      setTimeout(() => {
        if (chunks.length > 0 || stopping || ended) return;
        log("warn", "replay.audioSilent");
        const stale = current;
        current = null;
        try {
          if (stale && stale.state !== "inactive") stale.stop();
          dropAudio();
          begin();
        } catch (error) {
          log("warn", "replay.restartFailed", error);
          end();
        }
      }, AUDIO_WAIT_MS),
    );
  }
  return { stop };
}

/** Starts recording `canvas`. Null when this browser cannot record a canvas. */
export function startRecording(canvas: HTMLCanvasElement, options: RecordingOptions = {}): Recording | null {
  const owned: MediaStreamTrack[] = [];
  let sound: AttachedAudio | null = null;
  const release = (): void => {
    stopTracks(owned);
    sound?.close();
  };
  try {
    if (typeof MediaRecorder === "undefined" || !("captureStream" in canvas)) return null;
    const stream = canvas.captureStream(positive(options.fps, DEFAULT_FPS));
    owned.push(...stream.getTracks());
    sound = options.audio ? attachAudio(stream, options.audio, owned) : null;
    const audioTracks = sound?.tracks ?? [];
    const mimeType = pickMimeType((type) => MediaRecorder.isTypeSupported(type));
    // With no type we know, the browser is left to pick its own default.
    const settings: MediaRecorderOptions = {
      videoBitsPerSecond: positive(options.videoBitsPerSecond, DEFAULT_BITS_PER_SECOND),
      ...(mimeType === null ? {} : { mimeType }),
    };
    const dropAudio = (): void => {
      for (const track of audioTracks) stream.removeTrack(track);
      stopTracks(audioTracks);
      sound?.close();
    };
    return run(
      () => new MediaRecorder(stream, settings),
      audioTracks.length > 0 ? dropAudio : null,
      positive(options.maxSeconds, DEFAULT_MAX_SECONDS),
      release,
    );
  } catch (error) {
    release();
    log("warn", "replay.recorderUnavailable", error);
    return null;
  }
}
