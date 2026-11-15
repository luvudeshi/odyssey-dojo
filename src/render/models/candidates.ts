// The Polyphemus candidates the owner can compare with ?model=<id>. Imported only when asked for, so default play loads nothing extra.
import type { ComponentType } from "react";
import type { MonsterProps } from "../../core/types";

type Loader = () => Promise<ComponentType<MonsterProps>>;

export const CANDIDATES: Readonly<Record<string, Loader>> = {
  dev: () => import("./devModel").then((m) => m.DEV_MODEL),
  giant: () => import("./giantPolyphemus").then((m) => m.GiantPolyphemus),
  classic: () => import("./classicPolyphemus").then((m) => m.ClassicPolyphemus),
};

/** Own keys only, so ?model=constructor or ?model=__proto__ finds nothing instead of an inherited function. */
export function candidateLoader(id: string | null): Loader | undefined {
  return id !== null && Object.hasOwn(CANDIDATES, id) ? CANDIDATES[id] : undefined;
}

/** What ?model= means for Polyphemus. The giant is the default; an unknown value gets it too. */
export function polyphemusChoice(id: string | null): "giant" | "classic" | "dev" {
  return id === "classic" || id === "dev" ? id : "giant";
}
