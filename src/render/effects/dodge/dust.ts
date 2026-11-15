// Dust and spray kicked up at his feet. Same typed-array pool as the sparks, but it drifts, slows and is tinted, and it is
// thrown along the floor instead of out from a point.
import type { SparkPool } from "../sparks";

const GRAVITY = 2.6;
const PARKED_Y = -50;

/** Throws `count` motes from `at`: `push` is the sideways speed they leave with (negative = the other way), `spread` the random scatter. */
export function emitDust(pool: SparkPool, at: readonly [number, number, number], count: number, push: number, spread: number, random: () => number = Math.random): void {
  for (let n = 0; n < count; n++) {
    const i = pool.cursor;
    pool.cursor = (pool.cursor + 1) % pool.size;
    pool.positions[i * 3] = at[0] + (random() - 0.5) * 0.25;
    pool.positions[i * 3 + 1] = at[1] + random() * 0.12;
    pool.positions[i * 3 + 2] = at[2] + (random() - 0.5) * 0.3;
    pool.velocities[i * 3] = push * (0.4 + random() * 0.8) + (random() - 0.5) * spread;
    pool.velocities[i * 3 + 1] = 0.5 + random() * 1.4;
    pool.velocities[i * 3 + 2] = (random() - 0.4) * spread;
    const life = 0.35 + random() * 0.45;
    pool.life[i] = life;
    pool.maxLife[i] = life;
  }
}

/** Moves every live mote on and dims it with its life. Returns how many are alive. */
export function stepDust(pool: SparkPool, dt: number, tint: readonly [number, number, number]): number {
  let alive = 0;
  const drag = Math.exp(-2.2 * dt);
  for (let i = 0; i < pool.size; i++) {
    const left = (pool.life[i] ?? 0) - dt;
    const x = i * 3;
    if (left <= 0) {
      if ((pool.life[i] ?? 0) > 0) {
        pool.life[i] = 0;
        pool.positions[x + 1] = PARKED_Y;
        pool.colors.fill(0, x, x + 3);
      }
      continue;
    }
    alive++;
    pool.life[i] = left;
    pool.velocities[x] = (pool.velocities[x] ?? 0) * drag;
    pool.velocities[x + 1] = (pool.velocities[x + 1] ?? 0) * drag - GRAVITY * dt;
    pool.velocities[x + 2] = (pool.velocities[x + 2] ?? 0) * drag;
    for (let axis = 0; axis < 3; axis++) pool.positions[x + axis] = (pool.positions[x + axis] ?? 0) + (pool.velocities[x + axis] ?? 0) * dt;
    if ((pool.positions[x + 1] ?? 0) < 0.02) { pool.positions[x + 1] = 0.02; pool.velocities[x + 1] = 0; }
    const whole = pool.maxLife[i] ?? 0;
    const glow = whole > 0 ? (left / whole) ** 1.5 : 0;
    for (let axis = 0; axis < 3; axis++) pool.colors[x + axis] = (tint[axis] ?? 0) * glow;
  }
  return alive;
}
