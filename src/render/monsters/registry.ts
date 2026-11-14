// Every file in ./models that exports `model` is picked up here.
// An enemy with no model gets the placeholder, so data and art can land in separate PRs.
import type { ComponentType } from "react";
import type { MonsterProps } from "../../core/types";
import { DEV_MODEL } from "../models/devModel";

export interface MonsterModel {
  readonly enemyId: string;
  readonly Component: ComponentType<MonsterProps>;
}

const modules = import.meta.glob<{ model: MonsterModel }>("./models/*.tsx", { eager: true });

export const MONSTER_MODELS: ReadonlyMap<string, ComponentType<MonsterProps>> = new Map(
  Object.values(modules).map((module) => [module.model.enemyId, module.model.Component]),
);

// ?model=dev swaps Polyphemus for the CC0 test GLB to prove the pipeline.
if (new URLSearchParams(window.location.search).get("model") === "dev") (MONSTER_MODELS as Map<string, ComponentType<MonsterProps>>).set("polyphemus", DEV_MODEL);
