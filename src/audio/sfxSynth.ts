// Sound design for combat events: one synthesised mono clip per event type. Pure maths, no Web Audio objects.
import type { CombatEvent } from "../core/types";

type SfxType = CombatEvent["type"];

/** A clip being rendered a slice at a time, so that a long one never holds up a frame of the fight. */
export interface ClipRender {
  /** The clip. Only complete, and only at its final level, once advance has returned true. */
  readonly samples: Float32Array;
  /** Renders up to `count` more samples and says whether the whole clip is now done. */
  readonly advance: (count: number) => boolean;
}

/** `voice` sets up one render and returns its per-sample function; t is seconds from the start of the clip. */
interface Design {
  readonly seconds: number;
  readonly voice: (rate: number, seconds: number) => (t: number) => number;
}

const TAU = Math.PI * 2;
const PEAK = 0.9;
const CLICK_PEAK = 0.2;
const FADE_SECONDS = 0.003;
const DEFAULT_RATE = 44100;
const MIN_RATE = 3000;

/** Seeded white noise in -1..1 (mulberry32), so two renders are identical. */
function noise(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let z = Math.imul(state ^ (state >>> 15), state | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 2147483648 - 1;
  };
}

/** A sine whose pitch may change every sample without clicking. */
function sine(rate: number): (hz: number) => number {
  let phase = 0;
  return (hz) => {
    phase += (TAU * hz) / rate;
    return Math.sin(phase);
  };
}

/** Brass-like additive tone: harmonic k is k^-rolloff loud, so a smaller rolloff is brighter. */
function brass(rate: number): (hz: number, rolloff: number) => number {
  let phase = 0;
  return (hz, rolloff) => {
    phase += (TAU * hz) / rate;
    let sum = 0;
    for (let k = 1; k <= 8 && k * hz < rate * 0.45; k++) sum += Math.sin(k * phase) * k ** -rolloff;
    return sum;
  };
}

/** One-pole low-pass. Input minus its output is the matching high-pass. */
function lowpass(rate: number): (input: number, hz: number) => number {
  let held = 0;
  return (input, hz) => {
    held += (1 - Math.exp((-TAU * hz) / rate)) * (input - held);
    return held;
  };
}

/** Two low-passes in a row, for rumble with no hiss left in it. */
function rumble(rate: number): (input: number, hz: number) => number {
  const first = lowpass(rate);
  const second = lowpass(rate);
  return (input, hz) => second(first(input, hz), hz);
}

/** Resonant band-pass (state-variable filter). A smaller damping rings more. */
function bandpass(rate: number, damping: number): (input: number, hz: number) => number {
  let low = 0;
  let band = 0;
  return (input, hz) => {
    const f = 2 * Math.sin((Math.PI * Math.min(hz, rate / 6.5)) / rate);
    low += f * band;
    band += f * (input - low - damping * band);
    return band;
  };
}

function decay(t: number, seconds: number): number {
  return Math.exp(-t / seconds);
}

function attack(t: number, seconds: number): number {
  return 1 - Math.exp(-t / seconds);
}

/** Exponential pitch slide from one frequency to another as x goes 0..1. */
function glide(from: number, to: number, x: number): number {
  return from * (to / from) ** Math.min(1, Math.max(0, x));
}

// The monster winding up: a low growl with a tritone in it that rises, flutters faster and swells.
const telegraph: Design = {
  seconds: 0.55,
  voice: (rate, seconds) => {
    const growl = brass(rate);
    const tritone = brass(rate);
    const hiss = noise(11);
    const quake = rumble(rate);
    return (t) => {
      const x = t / seconds;
      const hz = glide(82, 147, x);
      const swell = (Math.expm1(3.5 * x) / Math.expm1(3.5)) * Math.min(1, (1 - x) / 0.1);
      const flutter = 0.75 + 0.25 * Math.sin(TAU * (12 + 20 * x) * t);
      const voices = growl(hz, 0.9 - 0.4 * x) + 0.5 * tritone(hz * Math.SQRT2, 1);
      return swell * (flutter * voices + 2 * quake(hiss(), 200 + 400 * x));
    };
  },
};

const CLANG_HZ = 640;
/** Bronze shield partials: frequency ratio, level, ring time. The ratios are deliberately not whole numbers. */
const CLANG: readonly (readonly [ratio: number, level: number, ring: number])[] = [
  [1, 1, 0.1],
  [1.52, 0.8, 0.085],
  [2.11, 0.7, 0.07],
  [2.83, 0.55, 0.058],
  [3.59, 0.45, 0.046],
  [4.71, 0.3, 0.036],
  [5.93, 0.22, 0.028],
];

const defended: Design = {
  seconds: 0.35,
  voice: (rate) => {
    const hiss = noise(23);
    const dull = lowpass(rate);
    const partials = CLANG.filter(([ratio]) => ratio * CLANG_HZ < rate * 0.45);
    return (t) => {
      const white = hiss();
      let sum = 1.4 * (white - dull(white, 2500)) * decay(t, 0.005);
      for (const [ratio, level, ring] of partials) {
        const phase = TAU * CLANG_HZ * ratio * t;
        // The slightly detuned twin makes each partial beat, like struck metal.
        sum += level * decay(t, ring) * (Math.sin(phase) + 0.5 * Math.sin(phase * 1.006));
      }
      return sum;
    };
  },
};

// Taking a blow: dull, heavy and slow to die, so it cannot be mistaken for landing one. A deep falling sine and
// low crunch are driven into soft clipping, with a muffled thud above them that small speakers can still play.
const playerHit: Design = {
  seconds: 0.4,
  voice: (rate) => {
    const body = sine(rate);
    const hiss = noise(37);
    const muffle = rumble(rate);
    const thud = bandpass(rate, 0.7);
    return (t) => {
      // Every bit of noise in this clip is low-passed first, which is what keeps it dull.
      const low = muffle(hiss(), 600);
      const hit = 1.1 * body(glide(120, 40, t / 0.3)) * decay(t, 0.16) + 4 * low * decay(t, 0.07);
      return 0.6 * Math.tanh(2.4 * hit) + 15 * thud(low, glide(520, 300, t / 0.2)) * decay(t, 0.1);
    };
  },
};

/** A rising major arpeggio: start time, frequency, level. */
const SHIMMER: readonly (readonly [start: number, hz: number, level: number])[] = [
  [0, 880, 0.6],
  [0.04, 1108.73, 0.75],
  [0.08, 1318.51, 0.9],
  [0.12, 1760, 1],
];

const opening: Design = {
  seconds: 0.32,
  voice: (rate, seconds) => {
    const hiss = noise(41);
    const air = bandpass(rate, 0.5);
    return (t) => {
      let sum = 0;
      for (const [start, hz, level] of SHIMMER) {
        const u = t - start;
        if (u < 0 || hz * 2 > rate * 0.45) continue;
        const phase = TAU * hz * u;
        const bell = Math.sin(phase) + 0.6 * Math.sin(phase * 1.005) + 0.3 * Math.sin(phase * 2);
        sum += level * attack(u, 0.006) * decay(u, 0.07) * bell;
      }
      const x = t / seconds;
      const sparkle = air(hiss(), glide(3000, 7000, x)) * x * (1 - x);
      return sum * (0.8 + 0.2 * Math.sin(TAU * 22 * t)) + 0.5 * sparkle;
    };
  },
};

// Landing a strike: bright, sharp and short, the opposite of taking one. A quick low thump is soft clipped, and
// the snap, the knock and a band of high noise sit on top of it unclipped so that they stay crisp.
const enemyHit: Design = {
  seconds: 0.3,
  voice: (rate) => {
    const thump = sine(rate);
    const knock = sine(rate);
    const hiss = noise(47);
    const dull = lowpass(rate);
    const tail = bandpass(rate, 0.9);
    return (t) => {
      const white = hiss();
      return (
        0.8 * Math.tanh(2.2 * thump(glide(190, 55, t / 0.14)) * decay(t, 0.05)) +
        1.4 * (white - dull(white, 1800)) * decay(t, 0.015) +
        0.7 * knock(glide(560, 320, t / 0.06)) * decay(t, 0.035) +
        3 * tail(white, 2200) * decay(t, 0.06)
      );
    };
  },
};

// A miss: filtered noise whose pitch sweeps up and back down as it swells and dies.
const whiffed: Design = {
  seconds: 0.3,
  voice: (rate, seconds) => {
    const hiss = noise(53);
    const body = bandpass(rate, 0.4);
    const dull = lowpass(rate);
    return (t) => {
      const arc = Math.sin(Math.PI * (t / seconds) ** 0.8);
      const white = hiss();
      return arc * arc * (body(white, 500 * 5 ** arc) + 0.03 * (white - dull(white, 3000)));
    };
  },
};

/** Four rising notes, then a C major chord: start time, frequency, length, level. */
const FANFARE: readonly (readonly [start: number, hz: number, length: number, level: number])[] = [
  [0, 392, 0.13, 0.8],
  [0.14, 523.25, 0.13, 0.85],
  [0.28, 659.25, 0.13, 0.9],
  [0.42, 783.99, 0.19, 1],
  [0.62, 261.63, 0.78, 0.25],
  [0.62, 523.25, 0.78, 0.33],
  [0.62, 659.25, 0.78, 0.3],
  [0.62, 783.99, 0.78, 0.3],
  [0.62, 1046.5, 0.78, 0.25],
];

const won: Design = {
  seconds: 1.4,
  voice: (rate) => {
    const horns = FANFARE.map((note) => ({ note, horn: brass(rate) }));
    return (t) => {
      let sum = 0;
      for (const { note, horn } of horns) {
        const [start, hz, length, level] = note;
        const u = t - start;
        if (u < 0 || u >= length) continue;
        const vibrato = 1 + 0.004 * Math.sin(TAU * 5.5 * u) * Math.min(1, u / 0.25);
        const release = Math.min(1, (length - u) / Math.min(0.25, length * 0.3));
        // Brass opens up just after the attack, then mellows as the note is held.
        const rolloff = 1 + 1.3 * decay(u, 0.03) + 0.7 * (u / length);
        sum += level * attack(u, 0.012) * decay(u, 0.6) * release * horn(hz * vibrato, rolloff);
      }
      return sum;
    };
  },
};

// Defeat: a drone with a minor third in it that sinks an octave, darkens and dies away.
const lost: Design = {
  seconds: 1.6,
  voice: (rate, seconds) => {
    const drone = brass(rate);
    const third = brass(rate);
    const beat = sine(rate);
    const wail = sine(rate);
    const hiss = noise(67);
    const quake = rumble(rate);
    return (t) => {
      const x = t / seconds;
      const hz = glide(147, 73, x);
      const voices =
        drone(hz, 0.6 + 0.6 * x) +
        0.6 * third(hz * 1.189, 0.8 + 0.6 * x) +
        0.4 * beat(hz * 1.015) +
        0.7 * wail(hz * 4) * decay(t, 1.2) +
        3 * quake(hiss(), 220);
      // Held through the fall, then faded over the second half, so the whole octave drop is heard.
      return attack(t, 0.03) * decay(t, 1.4) * Math.min(1, (1 - x) / 0.5) * voices;
    };
  },
};

/** What an event type with no design gets: quiet enough to pass unnoticed. */
const click: Design = {
  seconds: 0.03,
  voice: () => (t) => Math.sin(TAU * 700 * t) * decay(t, 0.006),
};

const DESIGNS: readonly (readonly [SfxType, Design])[] = [
  ["telegraph", telegraph],
  ["defended", defended],
  ["playerHit", playerHit],
  ["opening", opening],
  ["enemyHit", enemyHit],
  ["whiffed", whiffed],
  ["won", won],
  ["lost", lost],
];
const BY_TYPE: ReadonlyMap<string, Design> = new Map(DESIGNS);

/** Every event type that has a designed sound. */
export const SFX_TYPES: readonly SfxType[] = DESIGNS.map(([type]) => type);

function render(design: Design, rate: number, peak: number): ClipRender {
  const length = Math.max(2, Math.round(design.seconds * rate));
  const fade = Math.max(1, Math.round(FADE_SECONDS * rate));
  const sample = design.voice(rate, design.seconds);
  const samples = new Float32Array(length);
  let next = 0;
  let loudest = 0;
  const advance = (count: number): boolean => {
    if (next >= length) return true;
    const end = Math.min(length, next + (count >= 1 ? Math.floor(count) : 1));
    for (; next < end; next++) {
      // Ramp both ends to silence so the clip never starts or stops with a click.
      const value = sample(next / rate) * Math.min(1, next / fade, (length - 1 - next) / fade);
      if (!Number.isFinite(value)) continue;
      samples[next] = value;
      loudest = Math.max(loudest, Math.abs(value));
    }
    if (next < length) return false;
    // The loudest sample is only known at the end, so the level is set on the last slice.
    if (loudest > 0) {
      samples.forEach((value, index) => {
        samples[index] = (value * peak) / loudest;
      });
    }
    return true;
  };
  return { samples, advance };
}

/** Starts a clip without rendering any of it: call advance until it returns true. Slices give the same samples as synthClip. */
export function startClip(type: CombatEvent["type"], sampleRate: number): ClipRender {
  const rate = Number.isFinite(sampleRate) && sampleRate >= MIN_RATE ? sampleRate : DEFAULT_RATE;
  const design = BY_TYPE.get(type);
  return design ? render(design, rate, PEAK) : render(click, rate, CLICK_PEAK);
}

/** The synthesised clip for an event type, peaking near 0.9. Types without a design get a short soft click. */
export function synthClip(type: CombatEvent["type"], sampleRate: number): Float32Array {
  const clip = startClip(type, sampleRate);
  clip.advance(Number.POSITIVE_INFINITY);
  return clip.samples;
}
