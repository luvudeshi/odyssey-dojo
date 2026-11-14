// Placeholder sound: one synth tone per combat event, so the game has feedback with no audio files.
// To use real clips, replace playEvent's body; nothing else depends on how sound is made.
import type { CombatEvent } from "../core/types";

const TONES: Record<CombatEvent["type"], readonly [frequency: number, seconds: number]> = {
  telegraph: [220, 0.15],
  defended: [520, 0.12],
  playerHit: [90, 0.3],
  opening: [660, 0.1],
  enemyHit: [330, 0.2],
  whiffed: [160, 0.15],
  won: [880, 0.6],
  lost: [70, 0.8],
};

let context: AudioContext | null = null;

export function playEvent(event: CombatEvent): void {
  context ??= new AudioContext();
  const [frequency, seconds] = TONES[event.type];
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = frequency;
  oscillator.type = "triangle";
  gain.gain.setValueAtTime(0.2, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + seconds);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + seconds);
}
