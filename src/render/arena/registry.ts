// Every file in ./arenas that exports `arena` is picked up here.
// An enemy with no arena gets the scene's plain default, so data and art can land in separate PRs.
import type { ComponentType } from "react";

export interface ArenaDef {
  readonly enemyId: string;
  /** Draws the whole setting: background, fog, lights, floor and walls. Takes no props. */
  readonly Component: ComponentType;
}

const modules = import.meta.glob<{ arena: ArenaDef }>("./arenas/*.tsx", { eager: true });

export const ARENAS: ReadonlyMap<string, ComponentType> = new Map(
  Object.values(modules).map((module) => [module.arena.enemyId, module.arena.Component]),
);
