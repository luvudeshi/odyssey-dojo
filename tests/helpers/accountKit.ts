// For the account tests: the three real stores over a made-up localStorage, and a made-up account server behind fetch.
import { createProfileStore } from "../../src/account/store";
import type { FightResult, ProfileStore } from "../../src/account/store";
import { newTally } from "../../src/account/tally";
import type { AccountFetch } from "../../src/account/client";
import type { LocalStores } from "../../src/account/snapshot";
import type { TokenStorage } from "../../src/account/session";
import { loadCharacter, saveCharacter } from "../../src/characters/characters";
import { createSettingsStore } from "../../src/settings/store";
import type { SettingsStore } from "../../src/settings/store";

/** One finished fight as the game records it: fought as the boxer, hit once, with nothing else to count. */
export function fight(enemyId: string, won: boolean, score: number, mastery: Readonly<Record<string, number>> = {}): FightResult {
  return { enemyId, won, score, mastery, styleId: "boxer", tally: { ...newTally(), hitsTaken: 1 } };
}

export interface Memory extends TokenStorage {
  readonly data: Map<string, string>;
}

export function memory(start: Readonly<Record<string, string>> = {}): Memory {
  const data = new Map(Object.entries(start));
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: (key) => { data.delete(key); } };
}

export interface Browser {
  readonly storage: Memory;
  readonly profile: ProfileStore;
  readonly settings: SettingsStore;
  readonly stores: LocalStores;
  /** Picks a character the way the picker would. */
  pick(id: string): void;
}

/** One browser: the real profile and settings stores and the real character functions, all on one storage. */
export function browser(storage: Memory = memory()): Browser {
  const profile = createProfileStore(storage);
  const settings = createSettingsStore(storage);
  const listeners = new Set<() => void>();
  const pick = (id: string): void => { saveCharacter(id, storage); listeners.forEach((listener) => { listener(); }); };
  const stores: LocalStores = {
    profile,
    settings,
    character: { get: () => loadCharacter(storage), set: pick, subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; } },
    earned: () => profile.get().cleared.map((id) => `beat_${id}`),
  };
  return { storage, profile, settings, stores, pick };
}

interface Row {
  readonly name: string;
  readonly password: string;
  save: unknown;
  updatedAt: string | null;
}

export interface FakeServer {
  readonly fetch: AccountFetch;
  /** Every request made, as "METHOD path". */
  readonly calls: string[];
  readonly accounts: Map<string, Row>;
  readonly sessions: Map<string, string>;
  available: boolean;
  /** When set, every account route but status answers this status. */
  fail: number | null;
  /** The error named in that answer. Left out: one no server ever says. */
  failAs?: string;
  /** When true, fetch rejects, as with no network. */
  offline: boolean;
  /** When set, a PUT waits for release() before it is answered. */
  hold: boolean;
  release(): void;
  saveOf(name: string): unknown;
}

/** Answers the routes of the account contract from memory. It checks nothing a real server would; it is not one. */
export function fakeServer(): FakeServer {
  const waiting: (() => void)[] = [];
  let tokens = 0;
  const answer = (status: number, body?: unknown) => ({ status, json: () => (body === undefined ? Promise.reject(new Error("no body")) : Promise.resolve(body)) });
  const server: FakeServer = {
    calls: [],
    accounts: new Map(),
    sessions: new Map(),
    available: true,
    fail: null,
    offline: false,
    hold: false,
    release() { waiting.splice(0).forEach((go) => { go(); }); },
    saveOf: (name) => server.accounts.get(name.toLowerCase())?.save ?? null,
    async fetch(url, init) {
      const route = `${init.method} ${url}`;
      server.calls.push(route);
      if (server.offline) throw new TypeError("Failed to fetch");
      const body: unknown = init.body === undefined ? null : JSON.parse(init.body);
      const field = (name: string): string => (typeof body === "object" && body !== null ? String((body as Record<string, unknown>)[name] ?? "") : "");
      const token = (init.headers?.Authorization ?? "").replace(/^Bearer /, "");
      if (route === "GET /api/account/status") return answer(200, { available: server.available });
      if (route === "POST /api/account/signout") { server.sessions.delete(token); return answer(204); }
      if (server.fail !== null) return answer(server.fail, { error: server.failAs ?? "made_up" });
      if (route === "POST /api/account/signup" || route === "POST /api/account/signin") {
        const key = field("name").toLowerCase();
        if (route === "POST /api/account/signup") {
          if (server.accounts.has(key)) return answer(409, { error: "name_taken" });
          server.accounts.set(key, { name: field("name"), password: field("password"), save: null, updatedAt: null });
        } else if (server.accounts.get(key)?.password !== field("password")) return answer(401, { error: "wrong_name_or_password" });
        tokens += 1;
        const made = `token-${String(tokens).padStart(4, "0")}-${"x".repeat(32)}`;
        server.sessions.set(made, key);
        return answer(route === "POST /api/account/signup" ? 201 : 200, { token: made, name: server.accounts.get(key)?.name });
      }
      const row = server.accounts.get(server.sessions.get(token) ?? "");
      if (!row) return answer(401, { error: "signed_out" });
      if (route === "GET /api/account/save") return answer(200, { save: row.save, updatedAt: row.updatedAt });
      if (route === "PUT /api/account/save") {
        if (server.hold) await new Promise<void>((go) => { waiting.push(go); });
        row.save = (body as { save: unknown }).save;
        row.updatedAt = `2026-11-15T00:00:${String(server.calls.length % 60).padStart(2, "0")}Z`;
        return answer(200, { updatedAt: row.updatedAt });
      }
      return answer(404, { error: "not_found" });
    },
  };
  return server;
}
