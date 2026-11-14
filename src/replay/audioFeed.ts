// Keeps a replay's sound track fed. Chrome's MediaRecorder writes nothing, picture included, while an audio track
// delivers no data, and a game that only plays short tones delivers none between them.
import { log } from "../core/log";

export interface AttachedAudio {
  /** The audio tracks that were added to the recorded stream. */
  readonly tracks: readonly MediaStreamTrack[];
  /** Takes the private audio graph down, if there is one. Safe to call more than once. */
  close(): void;
}

/**
 * Routes `audio` through a private AudioContext next to a constant signal at zero gain, so the track that comes out
 * always carries data, silence included. Null when this browser cannot do that. `audio` itself is left running.
 */
function feedAudio(audio: MediaStream): AttachedAudio | null {
  if (typeof AudioContext === "undefined") return null;
  let context: AudioContext | null = null;
  const close = (): void => {
    const closing = context;
    context = null;
    try {
      if (closing && closing.state !== "closed") void closing.close().catch(() => undefined);
    } catch (error) {
      log("warn", "replay.audioFeedCloseFailed", error);
    }
  };
  try {
    if (audio.getAudioTracks().length === 0) return null;
    context = new AudioContext();
    const output = context.createMediaStreamDestination();
    context.createMediaStreamSource(audio).connect(output);
    const hush = context.createGain();
    hush.gain.value = 0;
    const carrier = context.createConstantSource();
    carrier.connect(hush).connect(output);
    carrier.start();
    // A context made before the player's first click or key starts suspended; this lets it run as soon as it may.
    void context.resume().catch(() => undefined);
    return { tracks: output.stream.getAudioTracks(), close };
  } catch (error) {
    log("warn", "replay.audioFeedFailed", error);
    close();
    return null;
  }
}

/**
 * Adds the game's sound to `stream`: through a feed that never falls silent where the browser allows one, and
 * otherwise as copies of the tracks, so that stopping ours later leaves the game's own sound alone.
 * Every track it makes is also pushed onto `owned`, for the caller to stop.
 */
export function attachAudio(stream: MediaStream, audio: MediaStream, owned: MediaStreamTrack[]): AttachedAudio {
  const feed = feedAudio(audio);
  const tracks: MediaStreamTrack[] = [];
  try {
    for (const source of feed ? feed.tracks : audio.getAudioTracks()) {
      const track = feed ? source : source.clone();
      owned.push(track);
      tracks.push(track);
      stream.addTrack(track);
    }
  } catch (error) {
    log("warn", "replay.audioSkipped", error);
  }
  return { tracks, close: () => feed?.close() };
}
