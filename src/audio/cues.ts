// The sounds in public/audio/sfx that are not a combat event's own: the chime for an unlocked achievement, and one
// sound for each kind of defend, played in place of the single "defended" clip. This file says which they are, which
// defend gets which, and how loud each is. sfx.ts loads and plays them. Each is a file named in index.json there, made
// with "genClips.ts sfx". Pure: no audio context and no network, so the tests run it. Nothing here throws.

/** The chime for an unlocked achievement. */
export const UNLOCK_CLIP = "unlock";

export type DefendKind = "block" | "dodge" | "duck" | "jump";

/** The clip for each kind of defend. */
export const DEFEND_CLIPS: Readonly<Record<DefendKind, string>> = {
  block: "defendBlock",
  dodge: "defendDodge",
  duck: "defendDuck",
  jump: "defendJump",
};

/** Every clip this file knows, in a fixed order. */
export const CUE_CLIPS: readonly string[] = [UNLOCK_CLIP, ...Object.values(DEFEND_CLIPS)];

/**
 * Each clip is brought to this RMS level without its loudest sample passing CUE_PEAK, the way the stop events are
 * (stopAudio.ts). The files come back from the sound model at very different levels. docs/audio-levels.md has what this gives.
 */
export const CUE_LOUDNESS = 0.12;
export const CUE_PEAK = 0.9;
/**
 * A defend sound goes to the output through this. It lands them around the "defended" clip they replace and under the
 * hit the player lands; no sample passes 0.54 at the output.
 */
export const DEFEND_GAIN = 0.6;
/** The chime plays over the result screen's music and Homer's line: about as loud as his voice, and under Athena's. */
export const UNLOCK_GAIN = 0.45;

/** Samples under this are the padding an MP3 carries at each end, left out of the loudness (music.ts measures the same way). */
const PADDING = 0.0002;
/** No clip is raised by more than this (music.ts: MAX_LEVEL). */
const MAX_LEVEL = 12;
/** Samples under this (-50 dBFS) count as the silence a clip starts with, which is skipped so the sound comes at once. */
const SILENCE = 10 ** (-50 / 20);
/** Never skip more than this. */
const MAX_SKIP_SECONDS = 0.5;

/** What this file reads of a decoded clip. An AudioBuffer has it; named here so the level tool can read this file with no browser types. */
export interface DecodedClip {
  readonly numberOfChannels: number;
  readonly sampleRate: number;
  readonly duration: number;
  getChannelData(channel: number): Float32Array;
}

/** A clip ready to play. */
export interface Cue<Buffer extends DecodedClip = DecodedClip> {
  readonly buffer: Buffer;
  /** The gain that brings the clip to CUE_LOUDNESS. */
  readonly level: number;
  /** Seconds of silence at the start of the clip, skipped when it plays. */
  readonly offset: number;
}

/**
 * Which kind of defend a move is, by the id the engine gives it (an attack's `counter`). Null for anything else. The
 * same split as the burst drawn round the hero (burstKind in src/render/effects/defendTiming.ts).
 */
export function defendKind(move: string): DefendKind | null {
  if (move === "block" || move === "duck" || move === "jump") return move;
  if (move === "dodge_left" || move === "dodge_right") return "dodge";
  return null;
}

/** The clip for a defend move, or null for a move that keeps the usual "defended" sound. */
export function defendClip(move: string): string | null {
  const kind = defendKind(move);
  return kind === null ? null : DEFEND_CLIPS[kind];
}

/** The clips of this file that an index.json lists. Anything malformed gives an empty list. */
export function listedCues(index: unknown): readonly string[] {
  if (!Array.isArray(index)) return [];
  const listed = new Set<unknown>(index);
  return CUE_CLIPS.filter((name) => listed.has(name));
}

/**
 * The gain that brings a clip to the RMS level CUE_LOUDNESS, measured between the padding at its ends, without its
 * loudest sample passing CUE_PEAK and never more than MAX_LEVEL. A silent or empty clip gives 1.
 */
export function cueLevel(channels: readonly Float32Array[]): number {
  const length = Math.min(...channels.map((channel) => channel.length));
  if (!Number.isFinite(length)) return 1;
  const loud = (index: number): boolean => channels.some((channel) => Math.abs(channel[index] ?? 0) > PADDING);
  let first = 0;
  while (first < length && !loud(first)) first++;
  if (first === length) return 1;
  let end = length;
  while (end > first + 1 && !loud(end - 1)) end--;
  let squares = 0;
  let peak = 0;
  for (const channel of channels) {
    for (let i = first; i < end; i++) {
      const value = channel[i] ?? 0;
      squares += value * value;
    }
    for (const value of channel) peak = Math.max(peak, Math.abs(value));
  }
  const rms = Math.sqrt(squares / ((end - first) * channels.length));
  if (!(rms > 0) || !Number.isFinite(rms)) return 1;
  const level = Math.min(MAX_LEVEL, CUE_LOUDNESS / rms);
  return peak > 0 ? Math.min(level, CUE_PEAK / peak) : level;
}

/** Seconds of silence before the first sound of a clip, in any channel. Never more than MAX_SKIP_SECONDS, and 0 for a silent clip. */
export function leadSilence(channels: readonly Float32Array[], sampleRate: number): number {
  if (!(sampleRate > 0) || !Number.isFinite(sampleRate)) return 0;
  const limit = Math.floor(MAX_SKIP_SECONDS * sampleRate);
  let first = Number.POSITIVE_INFINITY;
  for (const channel of channels) {
    const end = Math.min(channel.length, first, limit + 1);
    for (let i = 0; i < end; i++) {
      if (Math.abs(channel[i] ?? 0) > SILENCE) {
        first = i;
        break;
      }
    }
  }
  if (!Number.isFinite(first)) return channels.some((channel) => channel.length > limit) ? MAX_SKIP_SECONDS : 0;
  return first / sampleRate;
}

/** A decoded clip with its level and the silence to skip. A buffer that cannot be read plays as it is. */
export function prepareCue<Buffer extends DecodedClip>(buffer: Buffer): Cue<Buffer> {
  try {
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, channel) => buffer.getChannelData(channel));
    const offset = leadSilence(channels, buffer.sampleRate);
    return { buffer, level: cueLevel(channels), offset: offset < buffer.duration ? offset : 0 };
  } catch {
    return { buffer, level: 1, offset: 0 };
  }
}
