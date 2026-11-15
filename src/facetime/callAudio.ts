// The sound that goes back to the phone: everything the game plays, plus Athena's greeting and goodbye.
//
// The game has no single output to tap. Effects, music, ambience and power sounds each connect their own nodes
// straight to the audio context's destination (src/audio/sfx.ts, music.ts, stopAudio.ts, powerSound.ts), and the
// spoken lines are plain <audio> elements (src/audio/voice.ts, narration.ts). Those files are not this folder's to
// change, so this listens from outside:
//  - AudioNode.connect is wrapped once, when this file loads: a node that connects to a destination is remembered
//    (weakly), and while a call is on it is also connected to the call's stream.
//  - HTMLMediaElement.play is wrapped the same way: while a call is on, an <audio> element that starts to play is
//    routed through the audio context, so it is heard here and on the phone.
// Outside a call both wrappers only pass the call on. When src/audio has one stream for all game sound, pass it as
// `gameSound` to startCallAudio (see browserSession.ts) and neither wrapper is used.
import { clipUrl } from "../audio/athenaLines";
import { prepareLine } from "../audio/narration";
import { sharedAudioContext } from "../audio/sfx";
import { log } from "../core/log";

export const GREETING = "Welcome to the Odyssey Dojo. I am Athena. Step back until I can see all of you, then strike when your card says strike.";
export const GOODBYE = "Our time is almost up. You fought well. Farewell, hero.";
/** The spoken greeting is waited for this long; the chime has already played, and a bundled line is used after it. */
export const GREETING_WAIT_MS = 4000;

export interface CallAudio {
  /** The one audio track published to the call. */
  readonly track: MediaStreamTrack;
  /** Plays the chime at once and then Athena's greeting. Resolves when sound has started to go out. */
  greet(): Promise<void>;
  goodbye(): Promise<void>;
  /** Plays the friend's microphone on this computer. */
  hear(track: MediaStreamTrack | null): void;
  /** 0..1: how loud the outgoing sound is right now, for the demo page's meter. */
  level(): number;
  stop(): void;
}

interface Tap {
  readonly context: AudioContext;
  /** Where sound meant for the phone is sent. */
  readonly out: AudioNode;
}

const toSpeakers: WeakRef<AudioNode>[] = [];
const routed = new WeakSet<HTMLMediaElement>();
let tap: Tap | null = null;
let installed = false;

function install(): void {
  if (installed || typeof AudioNode === "undefined" || typeof HTMLMediaElement === "undefined") return;
  installed = true;
  const connect = AudioNode.prototype.connect as (this: AudioNode, ...args: unknown[]) => unknown;
  AudioNode.prototype.connect = function patched(this: AudioNode, ...args: unknown[]): unknown {
    const result = connect.apply(this, args);
    const target = args[0];
    if (target instanceof AudioDestinationNode) {
      if (toSpeakers.length > 512) toSpeakers.splice(0, toSpeakers.length, ...toSpeakers.filter((ref) => ref.deref() !== undefined));
      toSpeakers.push(new WeakRef(this));
      if (tap && tap.context === this.context) connect.call(this, tap.out);
    }
    return result;
  } as typeof AudioNode.prototype.connect;

  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function patched(this: HTMLMediaElement): Promise<void> {
    // Only sound-only elements with a file to play: the camera previews are <video> with a stream.
    if (tap && this instanceof HTMLAudioElement && this.srcObject === null && !routed.has(this)) {
      try {
        const source = tap.context.createMediaElementSource(this);
        routed.add(this);
        connect.call(source, tap.context.destination);
        connect.call(source, tap.out);
      } catch (error) {
        log("warn", "facetime_voice_not_routed", error);
      }
    }
    return play.call(this);
  };
}
install();

function chime(context: AudioContext, outs: readonly AudioNode[]): void {
  // Three rising notes, about a second: heard at once, while the spoken line is still loading.
  const start = context.currentTime + 0.02;
  [523.25, 659.25, 783.99].forEach((pitch, index) => {
    const tone = context.createOscillator();
    const level = context.createGain();
    tone.type = "triangle";
    tone.frequency.value = pitch;
    const at = start + index * 0.22;
    level.gain.setValueAtTime(0, at);
    level.gain.linearRampToValueAtTime(0.25, at + 0.03);
    level.gain.exponentialRampToValueAtTime(0.001, at + 0.5);
    tone.connect(level);
    outs.forEach((out) => { level.connect(out); });
    tone.start(at);
    tone.stop(at + 0.55);
  });
}

async function playUrl(context: AudioContext, url: string, outs: readonly AudioNode[]): Promise<boolean> {
  try {
    const response = await fetch(url);
    if (!response.ok) return false;
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    const source = context.createBufferSource();
    source.buffer = buffer;
    outs.forEach((out) => { source.connect(out); });
    source.start();
    return true;
  } catch (error) {
    log("warn", "facetime_line_failed", error);
    return false;
  }
}

/** Starts sending the game's sound. Call it from a click, so the browser lets the audio context run. */
export function startCallAudio(options: {
  readonly microphone?: boolean;
  /**
   * The game's own mixed sound, when src/audio has one stream for it (effects, voices and music). With it the two
   * wrappers above are not used for this call: the stream's first audio track is what goes to the phone.
   */
  readonly gameSound?: () => MediaStream | null;
} = {}): CallAudio {
  install();
  const context = sharedAudioContext() ?? new AudioContext();
  void context.resume().catch(() => undefined);
  // A hidden tab stops the game's audio clock (sfx.ts, quietWhileHidden), and the call service ends a call it hears
  // nothing from in the 10 s after its ready sign. So while a call is on, the clock keeps running. sfx.ts added its
  // own listener when sharedAudioContext() made the context, so this one runs after it and has the last word.
  const keepRunning = (): void => { void context.resume().catch(() => undefined); };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", keepRunning);
  // The greeting's words are asked for now, seconds before the ready sign, so they follow the chime at once.
  void prepareLine("athena", GREETING, fetch, GREETING_WAIT_MS);
  const out = context.createMediaStreamDestination();
  const meter = context.createAnalyser();
  meter.fftSize = 512;
  const samples = new Float32Array(meter.fftSize);
  // Everything meant for the phone goes through `send`, so the meter hears exactly what is sent.
  const send = context.createGain();
  send.connect(out);
  send.connect(meter);
  const mixed = options.gameSound?.() ?? null;
  const mixedTrack = mixed?.getAudioTracks()[0];
  if (mixedTrack) {
    // The game's one stream: nothing to listen for from outside.
    context.createMediaStreamSource(new MediaStream([mixedTrack])).connect(send);
  } else {
    tap = { context, out: send };
    const connect = AudioNode.prototype.connect as (this: AudioNode, target: AudioNode) => unknown;
    for (const ref of toSpeakers) {
      const node = ref.deref();
      if (node && node.context === context) {
        try { connect.call(node, send); } catch { /* a node that is gone */ }
      }
    }
  }
  const track = out.stream.getAudioTracks()[0];
  if (!track) throw new Error("no audio track for the call");
  const both: readonly AudioNode[] = [context.destination, send];

  // The host's voice, so the two can talk. Sent to the phone only, never to this computer's speakers.
  let microphone: MediaStream | null = null;
  let stopped = false;
  if (options.microphone !== false && typeof navigator !== "undefined" && navigator.mediaDevices) {
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then(
      (stream) => {
        if (stopped) { stream.getTracks().forEach((each) => { each.stop(); }); return; }
        microphone = stream;
        context.createMediaStreamSource(stream).connect(send);
      },
      (error: unknown) => { log("warn", "facetime_no_microphone", error); },
    );
  }

  let friend: HTMLAudioElement | null = null;
  const say = async (text: string, fallbackClip: string | null): Promise<void> => {
    const spoken = await prepareLine("athena", text, fetch, GREETING_WAIT_MS);
    if (stopped) return;
    if (spoken !== null && await playUrl(context, spoken, both)) return;
    if (fallbackClip !== null) await playUrl(context, clipUrl(fallbackClip), both);
  };

  return {
    track,
    greet() {
      chime(context, both);
      // The chime is already going out: the call is not silent. The words follow as soon as they are ready.
      void say(GREETING, "fight_start");
      return Promise.resolve();
    },
    async goodbye() {
      chime(context, both);
      await say(GOODBYE, null);
    },
    hear(next) {
      if (friend) { friend.pause(); friend.srcObject = null; friend = null; }
      if (!next || stopped) return;
      friend = new Audio();
      friend.srcObject = new MediaStream([next]);
      void friend.play().catch((error: unknown) => { log("warn", "facetime_friend_not_heard", error); });
    },
    level() {
      meter.getFloatTimeDomainData(samples);
      let peak = 0;
      for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
      return Math.min(1, peak);
    },
    stop() {
      stopped = true;
      tap = null;
      microphone?.getTracks().forEach((each) => { each.stop(); });
      if (friend) { friend.pause(); friend.srcObject = null; friend = null; }
      try { send.disconnect(); } catch { /* already gone */ }
      track.stop();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", keepRunning);
        // Back to the game's own rule: a hidden tab is silent.
        if (document.hidden) void context.suspend().catch(() => undefined);
      }
    },
  };
}
