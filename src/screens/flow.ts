// The screen flow as a pure reducer: main menu (title) -> style -> map -> fight -> result -> map.
// A stop on the map starts its fight at once. Training and Account are panels of the title screen, kept in App.
import type { Assessment } from "../coach/contract";
import { tuneFor } from "../coach/warmup";
import type { EnemySpec, FightingStyle } from "../core/types";

export type Screen = "title" | "host" | "join" | "guest" | "style" | "map" | "fight" | "result";

export interface Flow {
  readonly screen: Screen;
  readonly style: FightingStyle | null;
  /** Index into the enemy list of the fight being played or about to be. */
  readonly index: number;
  readonly seed: number;
  /** Ids of the enemies beaten so far. */
  readonly cleared: readonly string[];
  /** True while this player hosts an online room: the fight is shared with a guest. */
  readonly hosting: boolean;
  /** What the Training Dojo found out about the player; null until a session is finished. The monsters are tuned with it. */
  readonly assessment: Assessment | null;
}

export type FlowAction =
  | { readonly type: "ready" }
  | { readonly type: "pickStyle"; readonly style: FightingStyle }
  | { readonly type: "changeStyle" }
  | { readonly type: "enter"; readonly index: number; readonly seed: number }
  | { readonly type: "warmed"; readonly assessment: Assessment }
  | { readonly type: "ended"; readonly enemyId: string; readonly won: boolean }
  | { readonly type: "retry"; readonly seed: number }
  | { readonly type: "restart"; readonly seed: number }
  | { readonly type: "quit" }
  | { readonly type: "toMap" }
  | { readonly type: "hostRoom" }
  | { readonly type: "joinRoom" }
  | { readonly type: "joined" }
  | { readonly type: "hosted"; readonly together: boolean }
  | { readonly type: "toTitle" };

export const START: Flow = { screen: "title", style: null, index: 0, seed: 0, cleared: [], hosting: false, assessment: null };

/** Where the game opens. `?stop=<enemy id>` marks every earlier stop as beaten, to reach a later fight for a demo or a check. */
export function startAt(enemies: readonly EnemySpec[], stopId: string | null): Flow {
  const index = enemies.findIndex((enemy) => enemy.id === stopId);
  return index < 0 ? START : { ...START, cleared: enemies.slice(0, index).map((enemy) => enemy.id) };
}

/** `?room=CODE` opens the join screen; otherwise as `startAt`. */
export function openAt(enemies: readonly EnemySpec[], stopId: string | null, room: string | null): Flow {
  return room === null ? startAt(enemies, stopId) : { ...START, screen: "join" };
}

export function flowReducer(flow: Flow, action: FlowAction): Flow {
  switch (action.type) {
    case "hostRoom":
      return flow.screen === "title" ? { ...flow, screen: "host" } : flow;
    case "joinRoom":
      return flow.screen === "title" ? { ...flow, screen: "join" } : flow;
    case "joined":
      return flow.screen === "join" ? { ...flow, screen: "guest" } : flow;
    case "hosted":
      return flow.screen === "host" ? { ...flow, screen: "style", hosting: action.together } : flow;
    case "toTitle":
      return flow.screen === "host" || flow.screen === "join" || flow.screen === "guest" || flow.screen === "style" || flow.screen === "map"
        ? { ...flow, screen: "title", hosting: false }
        : flow;
    case "ready":
      // Back from the main menu with a style already chosen: straight to the map.
      return flow.screen === "title" ? { ...flow, screen: flow.style ? "map" : "style" } : flow;
    case "pickStyle":
      return flow.screen === "style" ? { ...flow, style: action.style, screen: "map" } : flow;
    case "changeStyle":
      return flow.screen === "map" || flow.screen === "result" ? { ...flow, screen: "style" } : flow;
    case "enter":
      return flow.screen === "map" && flow.style ? { ...flow, index: action.index, seed: action.seed, screen: "fight" } : flow;
    case "warmed":
      return { ...flow, assessment: action.assessment };
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
      return flow.screen === "result" ? { ...flow, screen: "map" } : flow;
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

/** The monster for this fight: tuned to the player when a training session was finished, the registry's own otherwise. */
export function enemyFor(enemy: EnemySpec, assessment: Assessment | null): EnemySpec {
  return assessment ? tuneFor(enemy, assessment) : enemy;
}
