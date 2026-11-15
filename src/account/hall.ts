// The hall of heroes in this browser: one shared client (./heroes) wired to the real fetch, the stored session and
// the profile. Importing this file starts it: from then on each fight given to recordFight is sent when a player is
// signed in. Signed out that sends nothing, and the hall itself is only read when the Account page shows it.
import { createHeroesClient } from "./heroes";
import type { SessionReader } from "./heroes";
import { getProfile, onFight } from "./store";

function browserStorage(): SessionReader | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

const shared = createHeroesClient({
  // Looked up at each call, so the game never holds on to one fetch.
  fetch: (url, init) => fetch(url, init),
  storage: browserStorage(),
  heroName: () => getProfile().name,
});

// In the background: the result screen never waits for this, and whatever the server answers is forgotten.
onFight((fight) => { void shared.record(fight); });

export const loadHall = shared.hall;
