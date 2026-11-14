// Every file in ./defs that exports `enemy` is picked up here, in ladder order.
import type { EnemySpec } from "../core/types";

const modules = import.meta.glob<{ enemy: EnemySpec }>("./defs/*.ts", { eager: true });

export const ENEMIES: readonly EnemySpec[] = Object.values(modules)
  .map((module) => module.enemy)
  .sort((a, b) => a.order - b.order);
