// Turns a GLB plus a clip config into a component with the MonsterModel signature.
// A missing or broken file shows the primitive model instead, so the fight never blanks.
import { Suspense } from "react";
import type { ComponentType, ReactNode } from "react";
import type { MonsterProps } from "../../core/types";
import { ErrorBoundary } from "../ErrorBoundary";
import { decideHeroClip, decideMonsterClip } from "./clipMap";
import type { HeroAction, HeroClipConfig, MonsterClipConfig } from "./clipMap";
import { RiggedModel } from "./RiggedModel";
import type { ModelFit } from "./RiggedModel";

export interface MonsterGlbConfig {
  /** Path under public/, for example "/models/cyclops.glb". Never a CDN. */
  readonly url: string;
  readonly fit: ModelFit;
  readonly clips: MonsterClipConfig;
  readonly anchors?: Readonly<Record<string, ReactNode>>;
}

export function monsterFromGlb(config: MonsterGlbConfig, Fallback: ComponentType<MonsterProps>): ComponentType<MonsterProps> {
  return function GlbMonster(props: MonsterProps) {
    return (
      <ErrorBoundary label={`monster-glb:${config.url}`} fallback={<Fallback {...props} />}>
        <Suspense fallback={<Fallback {...props} />}>
          <RiggedModel
            url={config.url}
            fit={config.fit}
            hitFlash={props.hitFlash}
            decide={(available, out) => decideMonsterClip(config.clips, props, available, out)}
            {...(config.anchors ? { anchors: config.anchors } : {})}
          />
        </Suspense>
      </ErrorBoundary>
    );
  };
}

export interface HeroGlbConfig {
  readonly url: string;
  readonly fit: ModelFit;
  readonly clips: HeroClipConfig;
  readonly anchors?: Readonly<Record<string, ReactNode>>;
}

export interface HeroProps {
  readonly action: HeroAction;
}

/** Same idea for the player character, driven by an action name. Not wired into the scene yet. */
export function heroFromGlb(config: HeroGlbConfig, Fallback: ComponentType<HeroProps>): ComponentType<HeroProps> {
  return function GlbHero(props: HeroProps) {
    return (
      <ErrorBoundary label={`hero-glb:${config.url}`} fallback={<Fallback {...props} />}>
        <Suspense fallback={<Fallback {...props} />}>
          <RiggedModel
            url={config.url}
            fit={config.fit}
            decide={(available, out) => decideHeroClip(config.clips, props.action, available, out)}
            {...(config.anchors ? { anchors: config.anchors } : {})}
          />
        </Suspense>
      </ErrorBoundary>
    );
  };
}
