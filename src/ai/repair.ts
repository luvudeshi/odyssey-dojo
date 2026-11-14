// Turns whatever the model returned into a level the game can trust: parse loosely, clamp every number, fill gaps.
import { z } from "zod";
import { ATTACK_TYPES, DIRECTIONS, LIGHTINGS, LIMITS, LevelSpecSchema, MONSTER_BASES, WEATHERS } from "./contracts";
import type { LevelAttack, LevelPhase, LevelSpec } from "./contracts";

const LooseAttack = z.object({
  type: z.enum(ATTACK_TYPES),
  direction: z.enum(DIRECTIONS),
  telegraph_ms: z.number(),
  combo: z.number(),
  weight: z.number(),
});
const LoosePhase = z.object({ name: z.string(), duration_s: z.number(), intensity: z.number() });

/** The right shape, but no limits on lengths or ranges, and list items are checked one by one later. */
const LooseLevel = z.object({
  title: z.string(),
  interpretation: z.string(),
  arena: z.object({ setting: z.string(), palette: z.array(z.unknown()), weather: z.string(), lighting: z.string() }),
  monster: z.object({
    base: z.string(),
    name: z.string(),
    speed: z.number(),
    aggression: z.number(),
    erratic: z.number(),
  }),
  attack_pool: z.array(z.unknown()),
  tempo_bpm: z.number(),
  phases: z.array(z.unknown()),
  taunts: z.array(z.unknown()),
  narration_intro: z.string(),
  narration_outro_win: z.string(),
  narration_outro_lose: z.string(),
});

type Range = readonly [number, number];

export function clamp(value: number, [low, high]: Range): number {
  return Math.min(high, Math.max(low, value));
}

function text(value: string, max: number, fallback: string): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean === "" ? fallback : clean.slice(0, max);
}

function oneOf<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return allowed.find((item) => item === value.trim().toLowerCase()) ?? fallback;
}

function hexColour(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value.trim());
  if (short) return `#${short.slice(1).map((c) => c + c).join("")}`.toLowerCase();
  return /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim().toLowerCase() : null;
}

/** Keep the good items, cut to the maximum, and top up from the fallback until the minimum is met. */
function fill<T>(good: readonly T[], [min, max]: Range, spare: readonly T[]): T[] {
  const result = good.slice(0, max);
  for (let i = 0; result.length < min && spare.length > 0; i++) {
    const item = spare[i % spare.length];
    if (item !== undefined) result.push(item);
  }
  return result;
}

/** Stretch or squeeze phase lengths so the whole fight lasts 60 to 90 seconds, each phase staying in range. */
export function fitFightLength(phases: readonly LevelPhase[]): LevelPhase[] {
  const [low, high] = LIMITS.phaseSeconds;
  const lengths = phases.map((phase) => Math.round(clamp(phase.duration_s, LIMITS.phaseSeconds)));
  const total = (): number => lengths.reduce((sum, length) => sum + length, 0);
  const target = clamp(total(), LIMITS.fightSeconds);
  for (let guard = 0; guard < 200 && total() !== target; guard++) {
    const step = total() < target ? 1 : -1;
    // Grow the shortest phase or shrink the longest, so the fight keeps its shape.
    const order = lengths.map((length, index) => ({ length, index })).sort((a, b) => step * (a.length - b.length));
    const pick = order.find(({ length }) => (step > 0 ? length < high : length > low));
    if (!pick) break;
    lengths[pick.index] = pick.length + step;
  }
  return phases.map((phase, index) => ({ ...phase, duration_s: lengths[index] ?? low }));
}

/**
 * Returns a valid level built from `raw`, borrowing from `base` wherever `raw` is missing or out of range.
 * Returns null when `raw` is not level-shaped at all, so the caller can use `base` as is.
 */
export function repairLevel(raw: unknown, base: LevelSpec): LevelSpec | null {
  const loose = LooseLevel.safeParse(raw);
  if (!loose.success) return null;
  const level = loose.data;

  const attacks = level.attack_pool.flatMap((item): LevelAttack[] => {
    const parsed = LooseAttack.safeParse(item);
    if (!parsed.success) return [];
    return [{
      type: parsed.data.type,
      direction: parsed.data.direction,
      telegraph_ms: Math.round(clamp(parsed.data.telegraph_ms, LIMITS.telegraphMs)),
      combo: Math.round(clamp(parsed.data.combo, LIMITS.combo)),
      weight: clamp(parsed.data.weight, LIMITS.weight),
    }];
  });
  // With no usable attack of its own the model's level is not worth keeping.
  if (attacks.length === 0) return null;
  const weighted = attacks.some((attack) => attack.weight > 0)
    ? attacks
    : attacks.map((attack) => ({ ...attack, weight: 0.5 }));

  const phases = level.phases.flatMap((item): LevelPhase[] => {
    const parsed = LoosePhase.safeParse(item);
    if (!parsed.success) return [];
    return [{
      name: text(parsed.data.name, 40, "The Clash"),
      duration_s: clamp(parsed.data.duration_s, LIMITS.phaseSeconds),
      intensity: clamp(parsed.data.intensity, LIMITS.intensity),
    }];
  });

  const taunts = level.taunts.flatMap((item) => {
    const line = typeof item === "string" ? text(item, 120, "") : "";
    return line === "" ? [] : [line];
  });
  const palette = level.arena.palette.flatMap((item) => hexColour(item) ?? []);

  const repaired: LevelSpec = {
    title: text(level.title, 90, base.title),
    interpretation: text(level.interpretation, 160, base.interpretation),
    arena: {
      setting: text(level.arena.setting, 160, base.arena.setting),
      palette: fill(palette, LIMITS.palette, base.arena.palette),
      weather: oneOf(level.arena.weather, WEATHERS, base.arena.weather),
      lighting: oneOf(level.arena.lighting, LIGHTINGS, base.arena.lighting),
    },
    monster: {
      base: oneOf(level.monster.base, MONSTER_BASES, base.monster.base),
      name: text(level.monster.name, 60, base.monster.name),
      speed: clamp(level.monster.speed, LIMITS.speed),
      aggression: clamp(level.monster.aggression, LIMITS.aggression),
      erratic: clamp(level.monster.erratic, LIMITS.erratic),
    },
    attack_pool: fill(weighted, LIMITS.attacks, base.attack_pool),
    tempo_bpm: Math.round(clamp(level.tempo_bpm, LIMITS.tempoBpm)),
    phases: fitFightLength(fill(phases, LIMITS.phases, base.phases)),
    taunts: fill(taunts, LIMITS.taunts, base.taunts),
    narration_intro: text(level.narration_intro, 400, base.narration_intro),
    narration_outro_win: text(level.narration_outro_win, 300, base.narration_outro_win),
    narration_outro_lose: text(level.narration_outro_lose, 300, base.narration_outro_lose),
  };
  const checked = LevelSpecSchema.safeParse(repaired);
  return checked.success ? checked.data : null;
}
