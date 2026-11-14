// A brief 1 -> 0 pulse after the monster is hit. It drives the bloom surge and the monster's hitFlash prop.
const PULSE_MS = 250;
let lastHit = -Infinity;

export function markHit(now: number = performance.now()): void {
  lastHit = now;
}

export function hitPulse(now: number = performance.now()): number {
  return Math.min(1, Math.max(0, 1 - (now - lastHit) / PULSE_MS));
}
