// What the AI layer passes between the browser and the server. Pure data and zod schemas: no DOM, no Node.
import { z } from "zod";

export const GOD_IDS = ["zeus", "poseidon", "athena", "hermes", "artemis", "apollo"] as const;
export type GodId = (typeof GOD_IDS)[number];

export const WEATHERS = ["clear", "rain", "storm", "fog", "embers", "snow"] as const;
export const LIGHTINGS = ["dawn", "noon", "dusk", "night", "underworld"] as const;
export const MONSTER_BASES = ["cyclops", "scylla", "charybdis", "sirens", "laestrygonian", "suitor_horde"] as const;
export const ATTACK_TYPES = ["strike", "sweep", "slam", "projectile", "grab", "feint"] as const;
export const DIRECTIONS = ["left", "right", "center", "high", "low"] as const;

/** The safe range of every number in a level. Anything the model returns is clamped into these. */
export const LIMITS = {
  speed: [0.3, 1.5],
  aggression: [0.2, 1],
  erratic: [0, 1],
  telegraphMs: [350, 1500],
  combo: [1, 4],
  weight: [0, 1],
  tempoBpm: [60, 170],
  phaseSeconds: [15, 40],
  intensity: [0, 1],
  fightSeconds: [60, 90],
  attacks: [6, 12],
  phases: [2, 4],
  taunts: [4, 8],
  palette: [3, 5],
} as const;

const hex = z.string().regex(/^#[0-9a-f]{6}$/);
const between = ([low, high]: readonly [number, number]) => z.number().min(low).max(high);

export const AttackSchema = z.object({
  type: z.enum(ATTACK_TYPES),
  direction: z.enum(DIRECTIONS),
  telegraph_ms: between(LIMITS.telegraphMs),
  combo: between(LIMITS.combo).int(),
  weight: between(LIMITS.weight),
});

export const PhaseSchema = z.object({
  name: z.string().min(1).max(40),
  duration_s: between(LIMITS.phaseSeconds),
  intensity: between(LIMITS.intensity),
});

/** One generated fight: arena, monster, attack mix, pacing and Homer's lines. */
export const LevelSpecSchema = z.object({
  title: z.string().min(1).max(90),
  interpretation: z.string().min(1).max(160),
  arena: z.object({
    setting: z.string().min(1).max(160),
    palette: z.array(hex).min(LIMITS.palette[0]).max(LIMITS.palette[1]),
    weather: z.enum(WEATHERS),
    lighting: z.enum(LIGHTINGS),
  }),
  monster: z.object({
    base: z.enum(MONSTER_BASES),
    name: z.string().min(1).max(60),
    speed: between(LIMITS.speed),
    aggression: between(LIMITS.aggression),
    erratic: between(LIMITS.erratic),
  }),
  attack_pool: z.array(AttackSchema).min(LIMITS.attacks[0]).max(LIMITS.attacks[1]),
  tempo_bpm: between(LIMITS.tempoBpm),
  phases: z.array(PhaseSchema).min(LIMITS.phases[0]).max(LIMITS.phases[1]),
  taunts: z.array(z.string().min(1).max(120)).min(LIMITS.taunts[0]).max(LIMITS.taunts[1]),
  narration_intro: z.string().min(1).max(400),
  narration_outro_win: z.string().min(1).max(300),
  narration_outro_lose: z.string().min(1).max(300),
});
export type LevelSpec = z.infer<typeof LevelSpecSchema>;
export type LevelAttack = z.infer<typeof AttackSchema>;
export type LevelPhase = z.infer<typeof PhaseSchema>;

/** What the browser sends to POST /api/level. */
export const LevelRequestSchema = z.object({
  phrase: z.string().trim().min(1).max(200),
  god: z.enum(GOD_IDS),
  rival_god: z.enum(GOD_IDS),
  epithet: z.string().trim().max(80).optional(),
});
export type LevelRequest = z.infer<typeof LevelRequestSchema>;

export const LevelResponseSchema = z.object({
  level: LevelSpecSchema,
  source: z.enum(["ai", "fallback"]),
});
export type LevelResponse = z.infer<typeof LevelResponseSchema>;

/** Which Olympian the player is, as the vision model answers it. */
export const RevealSchema = z.object({
  god: z.enum(GOD_IDS),
  epithet: z.string().min(1).max(80),
  reason: z.string().min(1).max(240),
  rival_god: z.enum(GOD_IDS),
});
export type RevealWire = z.infer<typeof RevealSchema>;

/** What the browser sends to POST /api/reveal: the webcam snapshot as a JPEG data URL. */
export const RevealRequestSchema = z.object({
  image: z.string().startsWith("data:image/jpeg;base64,").max(4_000_000),
});

export const RevealResponseSchema = RevealSchema.extend({
  /** Poll GET /api/portrait/<id> for the stylised portrait; null when none is being made. */
  portrait_id: z.string().nullable(),
});
export type RevealResponse = z.infer<typeof RevealResponseSchema>;
