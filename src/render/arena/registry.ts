// Every file in ./arenas that exports `arena` is picked up here.
// An enemy with no arena gets the scene's plain default, so data and art can land in separate PRs.
import type { ComponentType } from "react";

export interface ArenaDef {
  readonly enemyId: string;
  /** Draws the whole setting: background, fog, lights, floor and walls. Takes no props. */
  readonly Component: ComponentType;
  /** An HDRI to show as the sky and light the scene with, turned by `yaw` radians. Applied by Atmosphere. */
  readonly sky?: { readonly hdri: string; readonly yaw: number };
}

const modules = import.meta.glob<{ arena: ArenaDef }>("./arenas/*.tsx", { eager: true });

export const ARENAS: ReadonlyMap<string, ComponentType> = new Map(
  Object.values(modules).map((module) => [module.arena.enemyId, module.arena.Component]),
);

export const ARENA_SKIES: ReadonlyMap<string, { readonly hdri: string; readonly yaw: number }> = new Map(
  Object.values(modules).flatMap((module) => (module.arena.sky ? [[module.arena.enemyId, module.arena.sky] as const] : [])),
);
