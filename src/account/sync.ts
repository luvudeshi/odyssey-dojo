// The player's account in this browser: one shared session wired to the real stores and the real fetch.
// Importing this file starts it. With no stored session that sends nothing; the game plays from localStorage as before.
// Signed in, the save is fetched at start-up and whenever the Account page opens, and sent after every fight and every change (see ./session).
import { useSyncExternalStore } from "react";
import { loadCharacter, saveCharacter, subscribeCharacter } from "../characters/characters";
import { ENEMIES } from "../enemies/registry";
import { getSettings, setSettings, subscribeSettings } from "../settings/store";
import { achievements } from "./achievements";
import { createAccountClient } from "./client";
import { createAccountSync } from "./session";
import { SESSION_KEY } from "./session";
import type { AccountState, TokenStorage } from "./session";
import { getProfile, replaceProfile, subscribeProfile } from "./store";

export type { AccountState, SaveState } from "./session";
export { SESSION_KEY } from "./session";

function browserStorage(): TokenStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

const shared = createAccountSync({
  // Looked up at each call, so the game never holds on to one fetch.
  client: createAccountClient((url, init) => fetch(url, init)),
  storage: browserStorage(),
  stores: {
    profile: { get: getProfile, replace: replaceProfile, subscribe: subscribeProfile },
    settings: { get: getSettings, set: setSettings, subscribe: subscribeSettings },
    character: { get: () => loadCharacter(), set: (id) => { saveCharacter(id); }, subscribe: subscribeCharacter },
    earned: () => achievements(getProfile(), ENEMIES).filter((feat) => feat.done).map((feat) => feat.id),
  },
  // Another tab of this browser signed in or out: this one follows, and never writes its old session back.
  watch: (listener) => {
    if (typeof window === "undefined") return;
    window.addEventListener("storage", (event) => { if (event.key === SESSION_KEY || event.key === null) listener(); });
  },
});
shared.start();

export const getAccount = shared.get;
/** For the Account page: asks whether accounts are on (signed out), or fetches the account's save and sends what is waiting (signed in). */
export const accountStatus = shared.check;
export const signUp = shared.signUp;
export const signIn = shared.signIn;
export const signOut = shared.signOut;
export const rename = shared.rename;
export const changePassword = shared.changePassword;

export function useAccount(): AccountState {
  return useSyncExternalStore(shared.subscribe, shared.get, shared.get);
}
