// The accounts of one app, handed from routes/account.ts to the other route files that need them (routes/heroes.ts).
// There is one pool of four connections and one memory of known sessions, so nothing else may make a second set.
// The app's `deps` object is the key: every route file of one app is given the same one (../app).
import type { AccountLimits, Gate } from "./accountLimits";
import type { Accounts } from "./accounts";

export interface SharedAccounts {
  readonly accounts: Accounts;
  /** The gate strangers' database work waits at (STRANGERS_AT_ONCE in ./accountLimits), so the laptop always finds a connection free. */
  readonly strangers: Gate;
  /** The counts of routes/account.ts. One set for the whole app, so an address gets one budget of unknown tokens, not one a route file. */
  readonly limits: AccountLimits;
}

const shared = new WeakMap<object, SharedAccounts>();

export function shareAccounts(deps: object, accounts: SharedAccounts): void {
  shared.set(deps, accounts);
}

/** The accounts of the app these `deps` belong to, or null when routes/account.ts has not been registered for it. */
export function sharedAccounts(deps: object): SharedAccounts | null {
  return shared.get(deps) ?? null;
}
