// The defence history: one small record per fight, kept in this browser's localStorage under its own key.
// It is separate from the profile (src/account/store.ts) and changes nothing the profile saves. Every field read back is checked.
import { useSyncExternalStore } from "react";
import { log } from "../core/log";
import type { CombatEvent } from "../core/types";
import { browserStorage } from "../settings/store";
import type { SettingsStorage } from "../settings/store";
import { HISTORY_MAX, recordFight } from "./defense";
import type { FightDefense, KindCount } from "./defense";

export const DEFENSE_KEY = "odyssey-dojo.defense";

const count = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);
const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value);

function parseFight(raw: unknown): FightDefense | null {
  if (!isRecord(raw) || typeof raw.enemyId !== "string") return null;
  const kinds: Record<string, KindCount> = {};
  let seen = 0;
  let defended = 0;
  for (const [id, value] of Object.entries(isRecord(raw.kinds) ? raw.kinds : {})) {
    if (!isRecord(value)) continue;
    const kindSeen = count(value.seen);
    if (kindSeen === 0) continue;
    const kind = { seen: kindSeen, defended: Math.min(count(value.defended), kindSeen) };
    kinds[id] = kind;
    seen += kind.seen;
    defended += kind.defended;
  }
  // The totals are worked out again from the kinds, so a record can never disagree with itself.
  if (seen === 0) return null;
  return { at: count(raw.at), enemyId: raw.enemyId, seen, defended, hits: seen - defended, longestRun: Math.min(count(raw.longestRun), defended), kinds };
}

/** Reads stored JSON of any shape: a record that is missing or wrong is dropped, the rest are kept, newest HISTORY_MAX. */
export function parseHistory(raw: unknown): readonly FightDefense[] {
  let list: readonly unknown[] = [];
  try {
    const parsed: unknown = typeof raw === "string" ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) list = parsed as readonly unknown[];
  } catch (error) {
    log("warn", "defense.corrupt", error);
  }
  return list.map(parseFight).filter((fight): fight is FightDefense => fight !== null).slice(-HISTORY_MAX);
}

export interface DefenseStore {
  readonly get: () => readonly FightDefense[];
  /** Adds one fight from its events. `at` is the time it ended; left out, it is now. */
  readonly record: (events: readonly CombatEvent[], enemyId: string, at?: number) => void;
  readonly subscribe: (listener: () => void) => () => void;
}

export function createDefenseStore(storage: SettingsStorage | null): DefenseStore {
  let current: readonly FightDefense[] = [];
  try {
    current = parseHistory(storage?.getItem(DEFENSE_KEY) ?? null);
  } catch (error) {
    log("warn", "defense.read", error);
  }
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    record(events, enemyId, at = Date.now()) {
      const next = recordFight(current, events, { enemyId, at });
      if (next === current) return;
      current = next;
      try {
        storage?.setItem(DEFENSE_KEY, JSON.stringify(current));
      } catch (error) {
        log("warn", "defense.save", error);
      }
      listeners.forEach((listener) => { listener(); });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

const shared = createDefenseStore(browserStorage());

export const getDefenseHistory = shared.get;
export const recordDefense = shared.record;

export function useDefenseHistory(): readonly FightDefense[] {
  return useSyncExternalStore(shared.subscribe, shared.get, shared.get);
}
