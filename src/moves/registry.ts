// Every file in ./defs that exports `move` is picked up here. Add a move by adding a file.
import type { MoveDef } from "../core/types";

const modules = import.meta.glob<{ move: MoveDef }>("./defs/*.ts", { eager: true });

export const MOVES: ReadonlyMap<string, MoveDef> = new Map(
  Object.values(modules).map((module) => [module.move.id, module.move]),
);
