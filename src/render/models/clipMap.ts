// Pure rules for which animation clip a rigged model plays. No three.js here, so it is unit-tested alone.
import type { MonsterProps } from "../../core/types";

export interface MonsterClips {
  readonly idle: string;
  /** Scrubbed by `windup`, so the swing lands exactly when the engine says the attack lands. */
  readonly windup: { readonly default: string; readonly byAttackId?: Readonly<Record<string, string>> };
  /** Used instead of `windup` when the model has no windup clip. Also scrubbed by `windup`. */
  readonly attack?: string;
  readonly hit: string;
  readonly death: string;
  readonly victory?: string;
}

export type MonsterClipOverride = Partial<MonsterClips>;

export interface MonsterClipConfig extends MonsterClips {
  /** Per-phase overrides, keyed by phaseIndex. */
  readonly byPhase?: Readonly<Record<number, MonsterClipOverride>>;
  readonly timeScale?: number;
}

export interface ClipDecision {
  /** Null means "no usable clip": the model stays in its bind pose. */
  clip: string | null;
  loop: boolean;
  /** 0..1 when the clip is driven by props instead of the clock; null when it plays freely. */
  scrub: number | null;
  timeScale: number;
}

export function newDecision(): ClipDecision {
  return { clip: null, loop: true, scrub: null, timeScale: 1 };
}

export type HeroAction = "idle" | "block" | "duck" | "dodgeLeft" | "dodgeRight" | "strike" | "hurt" | "victory" | "defeat";

export type HeroClipConfig = Readonly<Partial<Record<HeroAction, string>>> & { readonly idle: string; readonly timeScale?: number };

const HIT_THRESHOLD = 0.3;
const HERO_LOOPING: ReadonlySet<HeroAction> = new Set<HeroAction>(["idle", "block", "duck"]);

function set(out: ClipDecision, clip: string | null, loop: boolean, scrub: number | null, timeScale: number): ClipDecision {
  out.clip = clip;
  out.loop = loop;
  out.scrub = scrub;
  out.timeScale = timeScale;
  return out;
}

/** Writes the decision into `out` (no allocation per frame). A name that is not in `available` falls back to idle, never throws. */
export function decideMonsterClip(
  config: MonsterClipConfig,
  props: Pick<MonsterProps, "windup" | "attackId" | "defeated" | "phaseIndex" | "hitFlash">,
  available: ReadonlySet<string>,
  out: ClipDecision,
): ClipDecision {
  const phase = config.byPhase?.[props.phaseIndex];
  const scale = config.timeScale ?? 1;
  const idle = phase?.idle ?? config.idle;
  const has = (name: string | undefined): name is string => name !== undefined && available.has(name);
  const pick = (name: string | undefined, loop: boolean, scrub: number | null): ClipDecision =>
    has(name) ? set(out, name, loop, scrub, scale) : set(out, has(idle) ? idle : null, true, null, scale);

  if (props.defeated) return pick(phase?.death ?? config.death, false, null);
  if (props.hitFlash > HIT_THRESHOLD) return pick(phase?.hit ?? config.hit, false, null);
  if (props.windup > 0 && props.attackId !== null) {
    const windup = phase?.windup ?? config.windup;
    const named = windup.byAttackId?.[props.attackId] ?? windup.default;
    const clip = has(named) ? named : (phase?.attack ?? config.attack);
    return pick(clip, false, Math.min(1, props.windup));
  }
  return pick(idle, true, null);
}

export function decideHeroClip(config: HeroClipConfig, action: HeroAction, available: ReadonlySet<string>, out: ClipDecision): ClipDecision {
  const scale = config.timeScale ?? 1;
  const named = config[action];
  if (named !== undefined && available.has(named)) return set(out, named, HERO_LOOPING.has(action), null, scale);
  return set(out, available.has(config.idle) ? config.idle : null, true, null, scale);
}
