// Signing in, and keeping the account's save and this browser's stores the same. The stores stay the truth for the
// game: it plays from localStorage whether or not anyone is signed in, and nothing here can throw into it.
// Signed out, this makes no request at all unless the Account page asks whether accounts are on.
//
// Every send is a fetch first: the account's save is read, joined with this browser's (./merge) and only then
// written, so a browser that was not looking can never put an old save over a newer one.
import { log } from "../core/log";
import type { AccountClient, AccountError } from "./client";
import { ACCOUNT_NAME_MAX, ACCOUNT_NAME_MIN, PASSWORD_MAX, PASSWORD_MIN } from "./contracts";
import type { Save } from "./contracts";
import { changesBetween, mergeSaves } from "./merge";
import { applySave, emptySnapshot, readSave, sameSave, snapshot } from "./snapshot";
import type { LocalStores } from "./snapshot";
import { cleanName } from "./store";

/** Where the session is kept in localStorage, next to PROFILE_KEY, SETTINGS_KEY and CHARACTER_KEY. */
export const SESSION_KEY = "odyssey-dojo.session";
/**
 * Whose progress this browser was left with at the last sign-out, and a mark of what it was. It is only written when
 * the account had all of it. A different player who signs in next, with the progress untouched since, starts from
 * their own account and does not inherit the last player's stops under their name.
 */
export const LEFT_KEY = "odyssey-dojo.account-left";
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
  /** The progress in this browser was another account's when this one signed in, so the first join starts from the account alone. */
  readonly fresh: boolean;
}

/** Reads the stored session. Anything that is not one reads as signed out. */
export function parseSession(raw: unknown): StoredSession | null {
  try {
    const data: unknown = typeof raw === "string" ? JSON.parse(raw) : null;
    if (typeof data !== "object" || data === null) return null;
    const { token, name, merged, unsent, fresh } = data as Record<string, unknown>;
    if (typeof token !== "string" || token.length < 20 || token.length > 200 || typeof name !== "string" || cleanName(name) === "") return null;
    return { token, name: cleanName(name), merged: merged === true, unsent: unsent === true, fresh: fresh === true };
  } catch {
    return null;
  }
}

/** What the form says for each failure, in plain words. */
export const ERROR_TEXT: Readonly<Record<AccountError, string>> = {
  invalid: "The server did not accept that name or password.",
  name_taken: "That hero name is taken. Pick another, or sign in.",
  wrong_name_or_password: "Wrong name or password.",
  wrong_password: "That is not your current password.",
  slow_down: "Too many tries. Wait a minute, then try again.",
  signups_closed: "No new accounts can be made right now. If you have one, sign in. Your progress is kept in this browser.",
  unavailable: "Accounts are not available right now. Your progress is kept in this browser.",
  signed_out: "You are signed out. Sign in again.",
  too_big: "The save is too big to send.",
  unreachable: "Cannot reach the server. Check the connection and try again.",
};
export const RENAME_TAKEN_TEXT = "That name is taken. Pick another.";
export const MISMATCH_TEXT = "The two new passwords do not match.";
export const PASSWORD_CHANGED_TEXT = "Password changed. Other devices are signed out.";
/** A 409 on the password route: another change of the same account was made at the same moment. */
export const PASSWORD_BUSY_TEXT = "Your password was just changed by another request. Check the page and try again if you still need to.";
export const renamedText = (name: string): string => `Your sign-in name is now ${name}.`;
/** What a rename or a password change gave back: the line to show, and whether it worked. */
export interface ChangeResult {
  readonly ok: boolean;
  readonly text: string;
}
export const NAME_TEXT = `A hero name is ${String(ACCOUNT_NAME_MIN)} to ${String(ACCOUNT_NAME_MAX)} characters.`;
export const PASSWORD_TEXT = `A password is ${String(PASSWORD_MIN)} to ${String(PASSWORD_MAX)} characters.`;

/** The name as it is sent: cleaned like the hero name, no spaces at the ends. */
export function accountName(raw: string): string {
  return cleanName(raw).trim();
}

/** What makes two names the same account, as the server sees it: case and the spaces between words do not count. */
function sameName(a: string, b: string): boolean {
  const key = (name: string): string => name.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  return key(a) === key(b);
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
  /** Calls the listener when another tab of this browser changed the stored session. The real one is the window's storage event. */
  readonly watch?: (listener: () => void) => void;
}

export interface AccountSync {
  readonly get: () => AccountState;
  readonly subscribe: (listener: () => void) => () => void;
  /** Once, when the game starts: listens to the stores, and fetches the save when a session is stored. Signed out, it asks nothing. */
  readonly start: () => void;
  /** For the Account page. Signed out: asks the server whether accounts are on. Signed in: fetches the account's save, so what another browser did shows here. */
  readonly check: () => Promise<void>;
  readonly signUp: (name: string, password: string) => Promise<void>;
  readonly signIn: (name: string, password: string) => Promise<void>;
  /** Forgets the session here and ends it on the server. This browser's progress stays. */
  readonly signOut: () => Promise<void>;
  /** Changes the sign-in name (not the hero name). Never sends a name that fails the rules. */
  readonly rename: (name: string) => Promise<ChangeResult>;
  /** Changes the password. Never sends one that fails the rules, or two new ones that differ. */
  readonly changePassword: (current: string, next: string, again: string) => Promise<ChangeResult>;
}

export function createAccountSync(deps: AccountDeps): AccountSync {
  const { client, storage, stores } = deps;
  const listeners = new Set<() => void>();

  /** The session as it is stored now. Undefined when that cannot be told (no storage, or it throws): then what this page holds stands. */
  const stored = (): StoredSession | null | undefined => {
    if (!storage) return undefined;
    try {
      return parseSession(storage.getItem(SESSION_KEY));
    } catch (error) {
      log("warn", "account.session_read", error);
      return undefined;
    }
  };

  let session: StoredSession | null = stored() ?? null;
  /** The stored session is the one this page holds. False when a write did not take: then the storage says nothing about this page. */
  let persisted = session !== null;
  let state: AccountState = session ? { status: "signedIn", name: session.name, save: session.unsent || !session.merged ? "later" : "saved" } : { status: "unknown" };
  /** The account's save has been fetched and joined since this page loaded. */
  let pulled = false;
  /** Achievement ids the account holds, kept in every save sent so none is dropped. */
  let known: readonly string[] = [];
  /** This browser's save as it was right after it last joined with the account on this page. What differs from it since was changed here. */
  let joinedAs: Save | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** The round that is under way, if one is. At most one request is out at a time. */
  let working: Promise<void> | null = null;
  let again = false;
  /** Counts the changes made here; `sentEdits` is the count that the last save sent held. */
  let edits = 0;
  let sentEdits = 0;
  let applying = false;
  let listening = false;

  const setState = (next: AccountState): void => {
    state = next;
    listeners.forEach((listener) => { listener(); });
  };
  const stop = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
    pulled = false;
    known = [];
    joinedAs = null;
    again = false;
    edits = 0;
    sentEdits = 0;
  };

  /**
   * Looks at what another tab may have done to the stored session. A tab that signed out, or signed in again, has
   * the last word: this page takes the stored session as its own and never writes its old one back over it.
   * True when the session changed.
   */
  const adopt = (): boolean => {
    if (session && !persisted) return false;
    const onDisk = stored();
    if (onDisk === undefined) return false;
    if ((onDisk?.token ?? null) === (session?.token ?? null)) {
      // The same session: another tab may have marked it joined or sent.
      if (onDisk && session) session = onDisk;
      return false;
    }
    stop();
    session = onDisk;
    persisted = onDisk !== null;
    setState(onDisk ? { status: "signedIn", name: onDisk.name, save: "later" } : { status: "signedOut", error: "" });
    return true;
  };

  /** Stores the session. `signedInHere` is a sign-in just made on this page; anything else updates the session this page holds, and gives way to another tab's. */
  const keep = (next: StoredSession, signedInHere = false): void => {
    if (!signedInHere && adopt()) return;
    if (!signedInHere && session?.token !== next.token) return;
    session = next;
    try {
      storage?.setItem(SESSION_KEY, JSON.stringify(next));
      persisted = stored()?.token === next.token;
    } catch (error) {
      persisted = false;
      log("warn", "account.session_save", error);
    }
  };
  const setSave = (save: SaveState): void => {
    if (session && (state.status !== "signedIn" || state.save !== save || state.name !== session.name)) setState({ status: "signedIn", name: session.name, save });
  };
  const mark = (): string => JSON.stringify(stores.profile.get());
  /**
   * Forgets the session here. The stored one is removed only when it is this page's: a newer one from another tab stays.
   * `settled` says the account has everything this browser has, which is noted for whoever signs in next (LEFT_KEY).
   */
  const forget = (said: string, settled = false): void => {
    const mine = session;
    stop();
    session = null;
    try {
      const onDisk = stored();
      if (mine && (onDisk === undefined || onDisk === null || onDisk.token === mine.token)) {
        storage?.removeItem(SESSION_KEY);
        if (settled) storage?.setItem(LEFT_KEY, JSON.stringify({ name: mine.name, mark: mark() }));
        else storage?.removeItem(LEFT_KEY);
      }
    } catch (error) {
      log("warn", "account.session_save", error);
    }
    persisted = false;
    setState({ status: "signedOut", error: said });
  };
  /** True when the progress in this browser is what a different account left behind, untouched since, and that account has it all. */
  const leftByAnother = (name: string): boolean => {
    try {
      const data: unknown = JSON.parse(storage?.getItem(LEFT_KEY) ?? "null");
      if (typeof data !== "object" || data === null) return false;
      const left = data as Record<string, unknown>;
      return typeof left.name === "string" && !sameName(left.name, name) && left.mark === mark();
    } catch {
      return false;
    }
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

  /** One round with the server: fetch the account's save, join it with this browser's, and send the result if the account does not have it. */
  const round = async (mine: StoredSession): Promise<"saved" | "later" | "signed_out"> => {
    const got = await client.load(mine.token);
    if (!isMine(mine)) return "later";
    if (!got.ok) return got.error === "signed_out" ? "signed_out" : "later";
    const theirs = readSave(got.value.save);
    if (theirs === "unreadable") {
      log("warn", "account.save_unreadable");
      return "later";
    }
    const mineNow = who();
    if (!mineNow) return "later";
    // Another player's leftover progress is not joined in: the account starts from its own save.
    const local = mineNow.fresh ? emptySnapshot(stores) : snapshot(stores);
    // Changes made here that the account does not have are not undone by the save they are about to be joined with.
    // What was not changed here (the hero name of a browser that only won a fight) gives way to the account's.
    const waiting = !mineNow.fresh && ((mineNow.merged && mineNow.unsent) || edits > sentEdits);
    const prefer = !waiting ? "account" : joinedAs ? changesBetween(joinedAs, local) : "local";
    const merged = mergeSaves(local, theirs, { accountName: mine.name, prefer });
    applying = true;
    try {
      applySave(stores, merged);
    } finally {
      applying = false;
    }
    known = merged.achievements ?? [];
    joinedAs = snapshot(stores);
    pulled = true;
    keep({ ...mineNow, merged: true, fresh: false });
    again = false;
    sentEdits = edits;
    const out = outgoing();
    if (theirs && sameSave(out, theirs)) return "saved";
    const sent = await client.store(mine.token, out);
    if (sent.ok) return "saved";
    if (sent.error !== "signed_out") log("warn", "account.save_failed", sent.error);
    return sent.error === "signed_out" ? "signed_out" : "later";
  };

  const work = async (): Promise<void> => {
    adopt();
    const mine = session;
    if (!mine) return;
    setSave("saving");
    let outcome: "saved" | "later" | "signed_out" = "later";
    try {
      do {
        outcome = await round(mine);
      } while (outcome === "saved" && again && isMine(mine));
    } catch (error) {
      log("warn", "account.sync", error);
    }
    // Signed out during the round, here or in another tab. Whoever signed in since is served by the next run.
    if (!isMine(mine)) return;
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

  /** The one worker: at most one round is under way; a call during it runs one more round after it and waits for both. */
  const run = (): Promise<void> => {
    if (working) {
      again = true;
      return working;
    }
    const mine = session;
    const started = work().finally(() => {
      working = null;
      // Someone else signed in while the round ran: they have not been served yet.
      if (session && session.token !== mine?.token) void run();
    });
    working = started;
    return started;
  };

  const changed = (): void => {
    if (applying) return;
    adopt();
    if (!session) return;
    edits += 1;
    if (session.merged && !session.unsent) keep({ ...session, unsent: true });
    setSave("saving");
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; void run(); }, deps.pushDelayMs ?? PUSH_DELAY_MS);
  };

  const enter = async (kind: "signUp" | "signIn", rawName: string, password: string): Promise<void> => {
    adopt();
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
    stop();
    const name = cleanName(got.value.name);
    keep({ token: got.value.token, name, merged: false, unsent: false, fresh: leftByAnother(name) }, true);
    setSave("saving");
    await run();
  };

  /** The words for a failed change. A 401 has signed the player out already, so its text is the usual one. */
  const changeText = (error: AccountError, field: string | undefined, kind: "name" | "password"): string => {
    if (error === "name_taken") return kind === "name" ? RENAME_TAKEN_TEXT : PASSWORD_BUSY_TEXT;
    if (error === "invalid") return field === "current" ? ERROR_TEXT.wrong_password : kind === "name" ? NAME_TEXT : PASSWORD_TEXT;
    return ERROR_TEXT[error];
  };
  /** After a change was answered: a 401 ends the session as any other signed-in call does. True when it did. */
  const endedByServer = (mine: StoredSession, error: AccountError): boolean => {
    if (error !== "signed_out" || !isMine(mine)) return false;
    forget("");
    return true;
  };

  return {
    get: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    start() {
      if (listening) return;
      listening = true;
      stores.profile.subscribe(changed);
      stores.settings.subscribe(changed);
      stores.character.subscribe(changed);
      deps.watch?.(() => { if (adopt() && session) void run(); });
      if (session) void run();
    },
    async check() {
      adopt();
      if (who()) {
        // Fetched again, so a win on another browser shows here, and a save that was waiting is sent.
        await run();
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
      adopt();
      const mine = session;
      if (!mine) return;
      // A change still waiting to go is sent first, joined with what the account has, so signing out does not lose it.
      if (timer) clearTimeout(timer);
      timer = null;
      if (working || mine.unsent || !mine.merged || edits !== sentEdits) await run();
      const mineNow = who();
      if (!mineNow || mineNow.token !== mine.token) return;
      forget("", mineNow.merged && !mineNow.unsent && edits === sentEdits);
      await client.signOut(mine.token);
    },
    async rename(rawName) {
      adopt();
      const mine = session;
      if (!mine) return { ok: false, text: ERROR_TEXT.signed_out };
      const name = accountName(rawName);
      if (name.length < ACCOUNT_NAME_MIN) return { ok: false, text: NAME_TEXT };
      const got = await client.rename(mine.token, name);
      if (!got.ok) {
        endedByServer(mine, got.error);
        return { ok: false, text: changeText(got.error, got.field, "name") };
      }
      const shown = cleanName(got.value.name);
      // Only the sign-in name moves: the hero name in the profile and the saved game are not touched.
      const mineNow = who();
      if (mineNow && isMine(mine)) {
        keep({ ...mineNow, name: shown });
        const cur = now();
        setSave(cur.status === "signedIn" ? cur.save : "saved");
      }
      return { ok: true, text: renamedText(shown) };
    },
    async changePassword(current, next, again) {
      adopt();
      const mine = session;
      if (!mine) return { ok: false, text: ERROR_TEXT.signed_out };
      if (current.length === 0 || current.length > PASSWORD_MAX) return { ok: false, text: ERROR_TEXT.wrong_password };
      if (next.length < PASSWORD_MIN || next.length > PASSWORD_MAX) return { ok: false, text: PASSWORD_TEXT };
      if (next !== again) return { ok: false, text: MISMATCH_TEXT };
      const got = await client.changePassword(mine.token, current, next);
      if (got.ok) return { ok: true, text: PASSWORD_CHANGED_TEXT };
      endedByServer(mine, got.error);
      return { ok: false, text: changeText(got.error, got.field, "password") };
    },
  };
}
