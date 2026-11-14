// The Polyphemus candidates the owner can compare with ?model=<id>. Imported only when asked for, so default play loads nothing extra.
import type { ComponentType } from "react";
import type { MonsterProps } from "../../core/types";

type Loader = () => Promise<ComponentType<MonsterProps>>;

export const CANDIDATES: Readonly<Record<string, Loader>> = {
  dev: () => import("./devModel").then((m) => m.DEV_MODEL),
  giant: () => import("./giantPolyphemus").then((m) => m.GiantPolyphemus),
  classic: () => import("./classicPolyphemus").then((m) => m.ClassicPolyphemus),
};
