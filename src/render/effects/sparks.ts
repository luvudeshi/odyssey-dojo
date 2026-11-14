// A fixed pool of spark particles. Pure number-crunching on typed arrays: no graphics, so it can be tested.
import type { Vec3 } from "./events";

export interface SparkPool {
  readonly size: number;
  /** x, y, z per spark. Dead sparks are parked far below the floor. */
  readonly positions: Float32Array;
  /** r, g, b per spark, already dimmed by remaining life (the sparks are drawn additively). */
  readonly colors: Float32Array;
  readonly velocities: Float32Array;
  /** Seconds left per spark; 0 means dead. */
  readonly life: Float32Array;
  readonly maxLife: Float32Array;
  /** Where the next spark is written. Old sparks are overwritten when the pool is full. */
  cursor: number;
}

const GRAVITY = 7;
const PARKED_Y = -50;
const GOLD: Vec3 = [1, 0.78, 0.25];

export function createPool(size: number): SparkPool {
  const positions = new Float32Array(size * 3);
  for (let i = 0; i < size; i++) positions[i * 3 + 1] = PARKED_Y;
  return {
    size,
    positions,
    colors: new Float32Array(size * 3),
    velocities: new Float32Array(size * 3),
    life: new Float32Array(size),
    maxLife: new Float32Array(size),
    cursor: 0,
  };
}

/** Throws `count` sparks outward from `at`, biased up and towards the player (+z). */
export function emit(pool: SparkPool, at: Vec3, count: number, speed: number, random: () => number = Math.random): void {
  for (let n = 0; n < count; n++) {
    const i = pool.cursor;
    pool.cursor = (pool.cursor + 1) % pool.size;
    const turn = random() * Math.PI * 2;
    const lift = random() * 2 - 1;
    const flat = Math.sqrt(1 - lift * lift);
    const pace = speed * (0.35 + random() * 0.65);
    pool.positions.set(at, i * 3);
    pool.velocities[i * 3] = Math.cos(turn) * flat * pace;
    pool.velocities[i * 3 + 1] = lift * pace + speed * 0.35;
    pool.velocities[i * 3 + 2] = Math.abs(Math.sin(turn) * flat) * pace;
    const life = 0.35 + random() * 0.45;
    pool.life[i] = life;
    pool.maxLife[i] = life;
  }
}

/** Moves every live spark on by `dt` seconds. Returns how many are still alive. */
export function stepPool(pool: SparkPool, dt: number): number {
  let alive = 0;
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
    pool.velocities[x + 1] = (pool.velocities[x + 1] ?? 0) - GRAVITY * dt;
    for (let axis = 0; axis < 3; axis++) {
      pool.positions[x + axis] = (pool.positions[x + axis] ?? 0) + (pool.velocities[x + axis] ?? 0) * dt;
    }
    const whole = pool.maxLife[i] ?? 0;
    const glow = whole > 0 ? left / whole : 0;
    for (let axis = 0; axis < 3; axis++) pool.colors[x + axis] = (GOLD[axis] ?? 0) * glow;
  }
  return alive;
}
