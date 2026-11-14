// Picks the arena for an enemy, or shows the fallback when that enemy has none yet.
import { createElement } from "react";
import type { ReactNode } from "react";
import { ARENAS } from "./registry";

export function ArenaFor({ enemyId, fallback }: { enemyId: string; fallback: ReactNode }) {
  const arena = ARENAS.get(enemyId);
  return arena ? createElement(arena) : <>{fallback}</>;
}
