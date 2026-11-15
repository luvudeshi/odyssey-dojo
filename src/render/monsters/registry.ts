// Every file in ./models that exports `model` is picked up here.
// An enemy with no model gets the placeholder, so data and art can land in separate PRs.
import type { ComponentType } from "react";
import type { MonsterProps } from "../../core/types";
import { polyphemusChoice, candidateLoader } from "../models/candidates";
import { GiantPolyphemus } from "../models/giantPolyphemus";
import { preloadGiant } from "../models/giantClips";

export interface MonsterModel {
  readonly enemyId: string;
  readonly Component: ComponentType<MonsterProps>;
}

const modules = import.meta.glob<{ model: MonsterModel }>("./models/*.tsx", { eager: true });

export const MONSTER_MODELS: ReadonlyMap<string, ComponentType<MonsterProps>> = new Map(
  Object.values(modules).map((module) => [module.model.enemyId, module.model.Component]),
);

// The Quaternius giant is the default Polyphemus (no flag). ?model=classic keeps the code-built one, ?model=dev the test robot.
// The GLB is requested at import, and the giant shows the code-built model until it has loaded or if it fails, so there is no blank or T-pose.
const choice = polyphemusChoice(new URLSearchParams(window.location.search).get("model"));
const table = MONSTER_MODELS as Map<string, ComponentType<MonsterProps>>;
if (choice === "giant") {
  preloadGiant();
  table.set("polyphemus", GiantPolyphemus);
} else if (choice === "dev") void candidateLoader("dev")?.().then((component) => table.set("polyphemus", component));
