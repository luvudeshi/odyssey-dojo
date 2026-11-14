// Every file in ./models that exports `model` is picked up here.
// An enemy with no model gets the placeholder, so data and art can land in separate PRs.
import type { ComponentType } from "react";
import type { MonsterProps } from "../../core/types";
import { candidateLoader } from "../models/candidates";

export interface MonsterModel {
  readonly enemyId: string;
  readonly Component: ComponentType<MonsterProps>;
}

const modules = import.meta.glob<{ model: MonsterModel }>("./models/*.tsx", { eager: true });

export const MONSTER_MODELS: ReadonlyMap<string, ComponentType<MonsterProps>> = new Map(
  Object.values(modules).map((module) => [module.model.enemyId, module.model.Component]),
);

// ?model=<id> swaps Polyphemus for a candidate (dev, giant, classic; see ../models/candidates).
const load = candidateLoader(new URLSearchParams(window.location.search).get("model"));
if (load) void load().then((component) => (MONSTER_MODELS as Map<string, ComponentType<MonsterProps>>).set("polyphemus", component));
