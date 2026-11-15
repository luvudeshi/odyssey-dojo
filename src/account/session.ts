// Signing in, and keeping the account's save and this browser's stores the same. The stores stay the truth for the
// game: it plays from localStorage whether or not anyone is signed in, and nothing here can throw into it.
// Signed out, this makes no request at all unless the Account page asks whether accounts are on.
import { log } from "../core/log";
import type { AccountClient, AccountError } from "./client";
import { ACCOUNT_NAME_MAX, ACCOUNT_NAME_MIN, PASSWORD_MAX, PASSWORD_MIN } from "./contracts";
import type { Save } from "./contracts";
import { mergeSaves } from "./merge";
import { applySave, readSave, sameSave, snapshot } from "./snapshot";
import type { LocalStores } from "./snapshot";
import { cleanName } from "./store";

/** Where the session is kept in localStorage, next to PROFILE_KEY, SETTINGS_KEY and CHARACTER_KEY. */
export const SESSION_KEY = "odyssey-dojo.session";
/** A change is sent this long after the last one, so a dragged volume slider is one request. */
export const PUSH_DELAY_MS = 1_500;

/** "saved": the account has everything. "saving": a change is on its way. "later": it could not be sent and waits for the next try. */
export type SaveState = "saved" | "saving" | "later";

export type AccountState =
  /** Nobody has asked the server yet. */
  | { readonly status: "unknown" }
  /** The server has no accounts (no database), or does not answer. */
  | { readonly status: "off" }
  | { readonly status: "signedOut"; readonly error: string }
  /** A sign-in or sign-up is on its way. */
  | { readonly status: "busy" }
  | { readonly status: "signedIn"; readonly name: string; readonly save: SaveState };

/** The part of localStorage used. Private windows may throw on any call. */
export interface TokenStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface StoredSession {
  readonly token: string;
  readonly name: string;
  /** The account's save has been joined with this browser's progress at least once. */
  readonly merged: boolean;
  /** This browser has changes made after that which the account does not have yet. */
  readonly unsent: boolean;
}

/** Reads the stored session. Anything that is not one reads as signed out. */
export function parseSession(raw: unknown): StoredSession | null {
  try {
    const data: unknown = typeof raw === "string" ? JSON.parse(raw) : null;
    if (typeof data !== "object" || data === null) return null;
    const { token, name, merged, unsent } = data as Record<string, unknown>;
    if (typeof token !== "string" || token.length < 20 || token.length > 200 || typeof name !== "string" || cleanName(name) === "") return null;
    return { token, name: cleanName(name), merged: merged === true, unsent: unsent === true };
  } catch {
    return null;
  }
}

/** What the form says for each failure, in plain words. */
export const ERROR_TEXT: Readonly<Record<AccountError, string>> = {
  invalid: "The server did not accept that name or password.",
  name_taken: "That hero name is taken. Pick another, or sign in.",
  wrong_name_or_password: "Wrong name or password.",
  slow_down: "Too many tries. Wait a minute, then try again.",
  unavailable: "Accounts are not available right now. Your progress is kept in this browser.",
  signed_out: "You are signed out. Sign in again.",
  too_big: "The save is too big to send.",
  unreachable: "Cannot reach the server. Check the connection and try again.",
};
export const NAME_TEXT = `A hero name is ${String(ACCOUNT_NAME_MIN)} to ${String(ACCOUNT_NAME_MAX)} characters.`;
export const PASSWORD_TEXT = `A password is ${String(PASSWORD_MIN)} to ${String(PASSWORD_MAX)} characters.`;

/** The name as it is sent: cleaned like the hero name, no spaces at the ends. */
export function accountName(raw: string): string {
  return cleanName(raw).trim();
}

/** What is wrong with a name and password before anything is sent; "" when both are fine. */
export function formProblem(name: string, password: string): string {
  if (accountName(name).length < ACCOUNT_NAME_MIN) return NAME_TEXT;
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) return PASSWORD_TEXT;
  return "";
}

export interface AccountDeps {
  readonly client: AccountClient;
  readonly storage: TokenStorage | null;
  readonly stores: LocalStores;
  readonly pushDelayMs?: number;
}

export interface AccountSync {
  readonly get: () => AccountState;
  readonly subscribe: (listener: () => void) => () => void;
  /** Once, when the game starts: listens to the stores, and fetches the save when a session is stored. Signed out, it asks nothing. */
  readonly start: () => void;
  /** For the Account page. Signed out: asks the server whether accounts are on. Signed in: tries again a save that is waiting. */
  readonly check: () => Promise<void>;
  readonly signUp: (name: string, password: string) => Promise<void>;
  readonly signIn: (name: string, password: string) => Promise<void>;
  /** Forgets the session here and ends it on the server. This browser's progress stays. */
  readonly signOut: () => Promise<void>;
}

export function createAccountSync(deps: AccountDeps): AccountSync {
  const { client, storage, stores } = deps;
  const listeners = new Set<() => void>();
  let session: StoredSession | null = null;
  try {
    session = parseSession(storage?.getItem(SESSION_KEY) ?? null);
  } catch (error) {
    log("warn", "account.session_read", error);
  }
  let state: AccountState = session ? { status: "signedIn", name: session.name, save: session.unsent || !session.merged ? "later" : "saved" } : { status: "unknown" };
  /** The account's save has been fetched and joined since this page loaded. Nothing is sent before that. */
  let pulled = false;
  /** Achievement ids the account holds, kept in every save sent so none is dropped. */
  let known: readonly string[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let again = false;
  /** Counts the changes made here; `sentEdits` is the count that the last save sent held. */
  let edits = 0;
  let sentEdits = 0;
  let applying = false;
  let started = false;

  const setState = (next: AccountState): void => {
    state = next;
    listeners.forEach((listener) => { listener(); });
  };
  const keep = (next: StoredSession | null): void => {
    session = next;
    try {
      if (next) storage?.setItem(SESSION_KEY, JSON.stringify(next));
      else storage?.removeItem(SESSION_KEY);
    } catch (error) {
      log("warn", "account.session_save", error);
    }
  };
  const setSave = (save: SaveState): void => {
    if (session && (state.status !== "signedIn" || state.save !== save || state.name !== session.name)) setState({ status: "signedIn", name: session.name, save });
  };
  const forget = (error: string): void => {
    if (timer) clearTimeout(timer);
    timer = null;
    pulled = false;
    known = [];
    again = false;
    keep(null);
    setState({ status: "signedOut", error });
  };
  const isMine = (mine: StoredSession): boolean => session?.token === mine.token;
  // Read through these after an await: the session and the state may have changed while the answer was on its way.
  const who = (): StoredSession | null => session;
  const now = (): AccountState => state;

  /** What is sent: the stores as they are now, plus the achievements the account already had. */
  const outgoing = (): Save => {
    const mine = snapshot(stores);
    const achievements = [...new Set([...known, ...(mine.achievements ?? [])])];
    return achievements.length > 0 ? { ...mine, achievements } : mine;
  };

  /** One round with the server: fetch and join first if that has not happened yet, then send. */
  const round = async (mine: StoredSession): Promise<"saved" | "later" | "signed_out"> => {
    if (!pulled) {
      const got = await client.load(mine.token);
      if (!isMine(mine)) return "later";
      if (!got.ok) return got.error === "signed_out" ? "signed_out" : "later";
      const theirs = readSave(got.value.save);
      if (theirs === "unreadable") {
        log("warn", "account.save_unreadable");
        return "later";
      }
      const mineNow = who();
      const prefer = mineNow?.merged && mineNow.unsent ? "local" : "account";
      const merged = mergeSaves(snapshot(stores), theirs, { accountName: mine.name, prefer });
      applying = true;
      try {
        applySave(stores, merged);
      } finally {
        applying = false;
      }
      known = merged.achievements ?? [];
      pulled = true;
      if (mineNow) keep({ ...mineNow, merged: true });
      sentEdits = edits;
      if (theirs && sameSave(outgoing(), theirs)) return "saved";
    }
    again = false;
    sentEdits = edits;
    const sent = await client.store(mine.token, outgoing());
    if (sent.ok) return "saved";
    if (sent.error !== "signed_out") log("warn", "account.save_failed", sent.error);
    return sent.error === "signed_out" ? "signed_out" : "later";
  };

  /** The one worker: at most one request is out; a change during it runs one more round after it. */
  const run = async (): Promise<void> => {
    const mine = session;
    if (!mine) return;
    if (inFlight) {
      again = true;
      return;
    }
    inFlight = true;
    setSave("saving");
    let outcome: "saved" | "later" | "signed_out" = "later";
    try {
      do {
        outcome = await round(mine);
      } while (outcome === "saved" && again && isMine(mine));
    } catch (error) {
      log("warn", "account.sync", error);
    } finally {
      inFlight = false;
    }
    if (!isMine(mine)) {
      // Signed out during the round. Someone who signed in since then has not been served yet.
      if (who()) void run();
      return;
    }
    if (outcome === "signed_out") {
      // The session ended on the server (it ran out, or was signed out elsewhere). Quietly: the progress stays here.
      forget("");
      return;
    }
    // A change made while the save was on its way is not in it: it goes with the next one.
    const settled = outcome === "saved" && edits === sentEdits;
    const mineNow = who();
    if (mineNow && settled) keep({ ...mineNow, unsent: false });
    setSave(outcome === "later" ? "later" : settled ? "saved" : "saving");
  };

  const changed = (): void => {
    if (applying || !session) return;
    edits += 1;
    if (session.merged && !session.unsent) keep({ ...session, unsent: true });
    setSave("saving");
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; void run(); }, deps.pushDelayMs ?? PUSH_DELAY_MS);
  };

  const enter = async (kind: "signUp" | "signIn", rawName: string, password: string): Promise<void> => {
    if (who() || now().status === "busy") return;
    const problem = formProblem(rawName, password);
    if (problem) {
      setState({ status: "signedOut", error: problem });
      return;
    }
    setState({ status: "busy" });
    const got = await client[kind](accountName(rawName), password);
    if (!got.ok) {
      const text = got.error === "invalid" && got.field === "name" ? NAME_TEXT : got.error === "invalid" && got.field === "password" ? PASSWORD_TEXT : ERROR_TEXT[got.error];
      setState({ status: "signedOut", error: text });
      return;
    }
    pulled = false;
    known = [];
    keep({ token: got.value.token, name: cleanName(got.value.name), merged: false, unsent: false });
    setSave("saving");
    await run();
  };

  return {
    get: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    start() {
      if (started) return;
      started = true;
      stores.profile.subscribe(changed);
      stores.settings.subscribe(changed);
      stores.character.subscribe(changed);
      if (session) void run();
    },
    async check() {
      if (who()) {
        const at = now();
        if (at.status === "signedIn" && at.save === "later") await run();
        return;
      }
      if (now().status === "busy") return;
      const available = await client.status();
      // A sign-in may have started or ended while the answer was on its way.
      if (who() || now().status === "busy") return;
      if (!available) setState({ status: "off" });
      else if (now().status !== "signedOut") setState({ status: "signedOut", error: "" });
    },
    signUp: (name, password) => enter("signUp", name, password),
    signIn: (name, password) => enter("signIn", name, password),
    async signOut() {
      const mine = session;
      if (!mine) return;
      // A change still waiting to go is sent first, so signing out does not lose it.
      const last = pulled && mine.unsent ? outgoing() : null;
      forget("");
      if (last) await client.store(mine.token, last);
      await client.signOut(mine.token);
    },
  };
}
