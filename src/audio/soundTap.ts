// Where the game's sound can be listened in on, for a call that sends it to someone else (soundOut.ts opens and
// closes the tap). Every sound path says here where it ends, and nothing more happens until a tap is open: no node is
// made, nothing is connected, and each path still goes to the speakers by the connection it made itself.
// While a tap is open each of those ends is connected to the tap as well, beside its way to the speakers, which is
// never touched. So the player hears the game exactly as before, and the tap carries the same sound at the same levels.
// A spoken clip plays through an audio element, outside the audio graph: the tap listens to a copy of what the element
// plays (captureStream) and applies the element's own volume to it. The microphone and a call's incoming sound are not
// in the game's graph and are never added here.
// One thing differs from the speakers: a voice line and an effect together can add up to more than full scale (measured:
// 1.5 dB over, for a few samples), and a call's encoder would clip that. So the tap has a ceiling: sound under
// CEILING_DB passes at the level it came in, and a louder peak is held just above it. Nothing here throws.
import { log } from "../core/log";

/** The part of an audio element the tap uses. `captureStream` is Chrome's and Edge's; lib.dom does not list it. */
interface VoiceElement {
  volume: number;
  muted?: boolean;
  captureStream?: () => MediaStream;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

interface Tap {
  readonly context: AudioContext;
  /** Where every sound path and spoken clip is connected: the ceiling, or the stream node itself without one. */
  readonly input: AudioNode;
  readonly output: MediaStreamAudioDestinationNode;
  /** How to stop listening to each spoken clip that is being listened to. */
  readonly heard: Map<object, () => void>;
}

/** The nodes that stay for the whole session and end a sound path: the effects' master, the buses of the music and of a stop. */
const ends = new Set<AudioNode>();
/** The audio elements of the spoken clips that are playing or about to. Each is taken out when its clip is let go of. */
const voices = new Set<object>();
let tap: Tap | null = null;
let voicesMissed = false;

/** Peaks louder than this, in dB of full scale, are held down on the stream. Sound under it is not changed. */
export const CEILING_DB = -2;
/** How hard: a peak this many times over the ceiling leaves one step over it. */
export const CEILING_RATIO = 20;
/**
 * A compressor adds a fixed gain of its own (Web Audio: what it takes off a full-scale sound, to the power 0.6).
 * This takes that off again, so sound under the ceiling leaves at the level it came in.
 */
export const CEILING_TRIM = 10 ** (((CEILING_DB - CEILING_DB / CEILING_RATIO) * 0.6) / 20);

/** A volume as a number from 0 to 1. Anything that is not a number counts as full. */
function unit(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
}

/**
 * The node the sound joins on its way to `output`: a compressor set as a ceiling, then its trim. Measured in Chrome,
 * a tone under the ceiling leaves at exactly its own level and one 6 dB over full scale leaves at -1.3 dB.
 * Where the browser has no compressor the sound joins `output` itself.
 */
function ceiling(context: AudioContext, output: AudioNode): AudioNode {
  try {
    if (typeof context.createDynamicsCompressor !== "function") return output;
    const limit = context.createDynamicsCompressor();
    limit.threshold.value = CEILING_DB;
    limit.knee.value = 0;
    limit.ratio.value = CEILING_RATIO;
    limit.attack.value = 0.003;
    limit.release.value = 0.25;
    const trim = context.createGain();
    trim.gain.value = CEILING_TRIM;
    limit.connect(trim).connect(output);
    return limit;
  } catch (error) {
    log("warn", "sound_out.noCeiling", error);
    return output;
  }
}

function join(active: Tap, node: AudioNode): void {
  try {
    node.connect(active.input);
  } catch (error) {
    log("warn", "sound_out.joinFailed", error);
  }
}

/**
 * Says that `node` is where a sound path ends: a node kept for the whole session that connects to the speakers
 * itself. Call it once, next to that connection. It is added to the tap when one is open or is opened later.
 */
export function tapSound(node: AudioNode): void {
  ends.add(node);
  if (tap) join(tap, node);
}

/**
 * The same for the last node of one short sound that connects to the speakers itself (a cue, a god's power). It is
 * not kept: it joins the tap if one is open now, and otherwise this does nothing at all.
 */
export function tapClip(node: AudioNode): void {
  if (tap) join(tap, node);
}

/** Listens to one spoken clip: a copy of what its element plays, at the element's volume. The element plays on untouched. */
function hear(active: Tap, audio: object): void {
  if (active.heard.has(audio)) return;
  const element = audio as Partial<VoiceElement>;
  if (typeof element.captureStream !== "function" || typeof element.addEventListener !== "function" || typeof element.removeEventListener !== "function") {
    // Firefox and Safari cannot copy an element's sound without taking it from the speakers, so there the voices stay off the tap.
    if (!voicesMissed) log("warn", "sound_out.voicesUnsupported", "this browser cannot copy a spoken clip into the stream");
    voicesMissed = true;
    return;
  }
  try {
    const voice = element as VoiceElement;
    const copy = element.captureStream();
    let source: MediaStreamAudioSourceNode | null = null;
    let level: GainNode | null = null;
    // The copy is taken before the element's volume, so the voice setting (and a taunt's lower level) is applied here.
    const follow = (): void => {
      if (level) level.gain.value = voice.muted === true ? 0 : unit(voice.volume);
    };
    // The copy has no track until the clip's file has been read. A stream with no track cannot be a source.
    const start = (): void => {
      try {
        if (source || tap !== active || copy.getAudioTracks().length === 0) return;
        source = active.context.createMediaStreamSource(copy);
        level = active.context.createGain();
        follow();
        source.connect(level).connect(active.input);
      } catch (error) {
        log("warn", "sound_out.voiceFailed", error);
      }
    };
    copy.addEventListener("addtrack", start);
    voice.addEventListener("playing", start);
    voice.addEventListener("volumechange", follow);
    active.heard.set(audio, () => {
      try {
        copy.removeEventListener("addtrack", start);
        voice.removeEventListener("playing", start);
        voice.removeEventListener("volumechange", follow);
        source?.disconnect();
        level?.disconnect();
      } catch (error) {
        log("warn", "sound_out.voiceLeaveFailed", error);
      }
    });
    start();
  } catch (error) {
    log("warn", "sound_out.voiceFailed", error);
  }
}

/** Says that `audio` is the element of a spoken clip that is about to play. Returns it, so it can wrap the element where it is made. */
export function tapVoice<T extends object>(audio: T): T {
  voices.add(audio);
  if (tap) hear(tap, audio);
  return audio;
}

/** The clip is over or was cut off: its element is forgotten, and the tap stops listening to it. */
export function untapVoice(audio: object): void {
  voices.delete(audio);
  const leave = tap?.heard.get(audio);
  if (!leave) return;
  tap?.heard.delete(audio);
  leave();
}

/** True while the tap's stream can still carry sound. Whoever was given the stream may have stopped its track. */
function live(active: Tap): boolean {
  try {
    return active.output.stream.getAudioTracks().some((track) => track.readyState === "live");
  } catch {
    return false;
  }
}

/**
 * Opens the tap on this context and gives its stream: one audio track with everything that plays through the ends
 * and the spoken clips named above, the ones playing now and the ones that start later. Asked again while that stream
 * is live, it gives the same one. Null when the browser cannot make such a stream.
 */
export function openTap(context: AudioContext): MediaStream | null {
  const open = tap;
  if (open?.context === context && live(open)) return open.output.stream;
  closeTap();
  try {
    if (typeof context.createMediaStreamDestination !== "function") return null;
    const output = context.createMediaStreamDestination();
    const active: Tap = { context, input: ceiling(context, output), output, heard: new Map() };
    tap = active;
    for (const node of ends) join(active, node);
    for (const audio of voices) hear(active, audio);
    return active.output.stream;
  } catch (error) {
    log("warn", "sound_out.unavailable", error);
    closeTap();
    return null;
  }
}

/** Closes the tap: every end and every spoken clip is taken off it and its track is stopped. The game's own sound is not touched. */
export function closeTap(): void {
  const closing = tap;
  if (!closing) return;
  tap = null;
  for (const node of ends) {
    try {
      node.disconnect(closing.input);
    } catch {
      // An end that never joined (it was made on another context, or its connection failed) has nothing to take off.
    }
  }
  for (const leave of closing.heard.values()) leave();
  closing.heard.clear();
  try {
    // The ceiling is let go of with the stream it led to.
    if (closing.input !== closing.output) closing.input.disconnect();
  } catch (error) {
    log("warn", "sound_out.closeFailed", error);
  }
  try {
    for (const track of closing.output.stream.getTracks()) track.stop();
  } catch (error) {
    log("warn", "sound_out.closeFailed", error);
  }
}
