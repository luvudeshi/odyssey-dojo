// Picks the arena for an enemy, or shows the fallback when that enemy has none yet. An arena with a `-classic`
// twin (the old Polyphemus cave) falls back to it if the new one fails to build or load.
import { createElement } from "react";
import type { ReactNode } from "react";
import { ErrorBoundary } from "../ErrorBoundary";
import { ARENAS } from "./registry";

export function ArenaFor({ enemyId, fallback }: { enemyId: string; fallback: ReactNode }) {
  const arena = ARENAS.get(enemyId);
  if (!arena) return <>{fallback}</>;
  const classic = ARENAS.get(`${enemyId}-classic`);
  const shown = createElement(arena);
  return classic ? (
    <ErrorBoundary label="arena-classic" fallback={createElement(classic)}>{shown}</ErrorBoundary>
  ) : shown;
}
