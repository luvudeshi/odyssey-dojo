// The screen flow as a pure reducer: title -> style -> map -> intro -> fight -> result -> map.
import type { EnemySpec, FightingStyle } from "../core/types";

export type Screen = "title" | "style" | "map" | "intro" | "fight" | "result";

export interface Flow {
  readonly screen: Screen;
  readonly style: FightingStyle | null;
  /** Index into the enemy list of the fight being played or about to be. */
  readonly index: number;
  readonly seed: number;
  /** Ids of the enemies beaten so far. */
  readonly cleared: readonly string[];
}

export type FlowAction =
  | { readonly type: "ready" }
  | { readonly type: "pickStyle"; readonly style: FightingStyle }
  | { readonly type: "changeStyle" }
  | { readonly type: "enter"; readonly index: number }
  | { readonly type: "begin"; readonly seed: number }
  | { readonly type: "ended"; readonly enemyId: string; readonly won: boolean }
  | { readonly type: "retry"; readonly seed: number }
  | { readonly type: "restart"; readonly seed: number }
  | { readonly type: "quit" }
  | { readonly type: "toMap" };

export const START: Flow = { screen: "title", style: null, index: 0, seed: 0, cleared: [] };

/** Where the game opens. `?stop=<enemy id>` marks every earlier stop as beaten, to reach a later fight for a demo or a check. */
export function startAt(enemies: readonly EnemySpec[], stopId: string | null): Flow {
  const index = enemies.findIndex((enemy) => enemy.id === stopId);
  return index < 0 ? START : { ...START, cleared: enemies.slice(0, index).map((enemy) => enemy.id) };
}

export function flowReducer(flow: Flow, action: FlowAction): Flow {
  switch (action.type) {
    case "ready":
      return flow.screen === "title" ? { ...flow, screen: "style" } : flow;
    case "pickStyle":
      return flow.screen === "style" ? { ...flow, style: action.style, screen: "map" } : flow;
    case "changeStyle":
      return flow.screen === "map" || flow.screen === "result" ? { ...flow, screen: "style" } : flow;
    case "enter":
      return flow.screen === "map" && flow.style ? { ...flow, index: action.index, screen: "intro" } : flow;
    case "begin":
      return flow.screen === "intro" ? { ...flow, seed: action.seed, screen: "fight" } : flow;
    case "ended":
      if (flow.screen !== "fight") return flow;
      return {
        ...flow,
        screen: "result",
        cleared: action.won && !flow.cleared.includes(action.enemyId) ? [...flow.cleared, action.enemyId] : flow.cleared,
      };
    case "retry":
      return flow.screen === "result" ? { ...flow, seed: action.seed, screen: "fight" } : flow;
    case "restart":
      return flow.screen === "fight" ? { ...flow, seed: action.seed } : flow;
    case "quit":
      return flow.screen === "fight" ? { ...flow, screen: "map" } : flow;
    case "toMap":
      return flow.screen === "result" || flow.screen === "intro" ? { ...flow, screen: "map" } : flow;
  }
}

/** A stop is playable when its 3D model exists; the rest are shown as still ahead on the route. */
export function playable(enemies: readonly EnemySpec[], models: ReadonlyMap<string, unknown>): readonly boolean[] {
  return enemies.map((enemy) => models.has(enemy.id));
}

/** A playable stop is open once every playable stop before it has been beaten. */
export function unlocked(
  enemies: readonly EnemySpec[],
  canPlay: readonly boolean[],
  cleared: readonly string[],
  index: number,
): boolean {
  if (!canPlay[index]) return false;
  return enemies.every((enemy, i) => i >= index || !canPlay[i] || cleared.includes(enemy.id));
}
