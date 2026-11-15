// Talks to the account routes of the server (/api/account/*). Every call has a time limit and never throws:
// a failure of any kind comes back as a named result. The browser's fetch is passed in, so tests use a made-up one.
import { RenamedResponseSchema, SAVE_MAX_BYTES, SavedResponseSchema, SaveResponseSchema, SessionResponseSchema, StatusResponseSchema } from "./contracts";
import type { Save } from "./contracts";

export type AccountFetch = (url: string, init: { method: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{
  readonly status: number;
  /** The answer's headers, when the fetch has them. Only Retry-After is read (see BUSY_RETRIES). */
  readonly headers?: { get(name: string): string | null };
  json(): Promise<unknown>;
}>;

/** The longest one request may take. After it the request is given up and counts as unreachable. */
export const REQUEST_TIMEOUT_MS = 8_000;

/**
 * A sign-up or sign-in the server had no place for (a 429 whose Retry-After is BUSY_WAIT_MAX_S or less: many people
 * signing in in the same second) is sent again by itself, BUSY_RETRIES times at most. Each time it waits as long as
 * the server said and up to BUSY_SPREAD_MS more, so browsers refused together do not come back together.
 * A longer wait is a budget that is used up: that one is shown at once, as before. Nothing was done for a request
 * answered 429, so sending it again makes no second account and no second session.
 */
export const BUSY_RETRIES = 2;
export const BUSY_WAIT_MAX_S = 2;
export const BUSY_SPREAD_MS = 400;

/**
 * Why a call did not work. All but the last are the server's own answers; "unreachable" is everything else:
 * no network, no answer in time, or an answer that is not the account server's (a page, a proxy error).
 * "signups_closed": the server makes no new accounts for now (it has made as many as it may), and sign-in still works.
 */
export type AccountError =
  | "invalid" | "name_taken" | "wrong_name_or_password" | "wrong_password" | "slow_down" | "signups_closed" | "unavailable" | "signed_out" | "too_big" | "unreachable";

export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: AccountError; readonly field?: string };

export interface Session {
  readonly token: string;
  readonly name: string;
}

export interface AccountClient {
  /** True only when the server says accounts are on. Any failure is false. */
  status(): Promise<boolean>;
  signUp(name: string, password: string): Promise<Result<Session>>;
  signIn(name: string, password: string): Promise<Result<Session>>;
  /** Ends the session on the server. The answer does not matter: the browser forgets the token either way. */
  signOut(token: string): Promise<void>;
  /** The account's save as the server holds it, unchecked (see readSave in ./snapshot); null when there is none yet. */
  load(token: string): Promise<Result<{ save: unknown; updatedAt: string | null }>>;
  store(token: string, save: Save): Promise<Result<{ updatedAt: string }>>;
  /** Changes the sign-in name of the signed-in account. The answer holds the name as the server keeps it. */
  rename(token: string, name: string): Promise<Result<{ name: string }>>;
  /** Changes the password, given the current one. The server ends the account's other sessions. */
  changePassword(token: string, current: string, next: string): Promise<Result<null>>;
}

interface Answer {
  readonly status: number;
  readonly data: unknown;
  /** The whole seconds of the answer's Retry-After, or null when it has none. */
  readonly retryAfterS: number | null;
}

/** Seconds to wait before sending a refused sign-up or sign-in again, or null when it is not to be sent again. */
function busyFor(answer: Answer | null): number | null {
  if (answer === null || answer.status !== 429 || answer.retryAfterS === null) return null;
  return answer.retryAfterS <= BUSY_WAIT_MAX_S ? answer.retryAfterS : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => { setTimeout(resolve, ms); });
}

const FAILURES: Readonly<Record<number, AccountError>> = { 400: "invalid", 403: "wrong_password", 409: "name_taken", 413: "too_big", 429: "slow_down", 503: "unavailable" };

function failure(answer: Answer | null, on401: AccountError): { ok: false; error: AccountError; field?: string } {
  if (!answer) return { ok: false, error: "unreachable" };
  const data = answer.data;
  // The server says this one by name, with a 429 or a 503. Any other body with those statuses reads by its status, as before.
  const closed = (answer.status === 429 || answer.status === 503) && typeof data === "object" && data !== null && "error" in data && data.error === "signups_closed";
  const error = closed ? "signups_closed" : answer.status === 401 ? on401 : FAILURES[answer.status] ?? "unreachable";
  const field = typeof data === "object" && data !== null && "field" in data && typeof data.field === "string" ? data.field.slice(0, 40) : null;
  return error === "invalid" && field ? { ok: false, error, field } : { ok: false, error };
}

export function createAccountClient(fetch: AccountFetch, base = "", pause: (ms: number) => Promise<void> = sleep): AccountClient {
  const call = async (method: string, path: string, options: { token?: string; body?: string } = {}): Promise<Answer | null> => {
    try {
      const headers: Record<string, string> = {};
      if (options.body !== undefined) headers["Content-Type"] = "application/json";
      if (options.token !== undefined) headers.Authorization = `Bearer ${options.token}`;
      const response = await fetch(`${base}/api/account/${path}`, {
        method,
        headers,
        ...(options.body !== undefined ? { body: options.body } : {}),
        // A server that takes the request and never answers must not leave the form waiting for ever.
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const after = Number(response.headers?.get("Retry-After") ?? Number.NaN);
      return { status: response.status, data: await response.json().catch(() => null), retryAfterS: Number.isFinite(after) && after > 0 ? after : null };
    } catch {
      return null;
    }
  };

  const enter = async (path: "signup" | "signin", wanted: number, name: string, password: string): Promise<Result<Session>> => {
    const body = JSON.stringify({ name, password });
    let answer = await call("POST", path, { body });
    for (let again = 0; again < BUSY_RETRIES; again += 1) {
      const wait = busyFor(answer);
      if (wait === null) break;
      await pause(wait * 1000 + Math.random() * BUSY_SPREAD_MS);
      answer = await call("POST", path, { body });
    }
    const session = answer?.status === wanted ? SessionResponseSchema.safeParse(answer.data) : null;
    return session?.success ? { ok: true, value: session.data } : failure(answer?.status === wanted ? null : answer, "wrong_name_or_password");
  };

  return {
    async status() {
      const answer = await call("GET", "status");
      const said = answer?.status === 200 ? StatusResponseSchema.safeParse(answer.data) : null;
      return said?.success === true && said.data.available;
    },
    signUp: (name, password) => enter("signup", 201, name, password),
    signIn: (name, password) => enter("signin", 200, name, password),
    async signOut(token) {
      await call("POST", "signout", { token });
    },
    async load(token) {
      const answer = await call("GET", "save", { token });
      const got = answer?.status === 200 ? SaveResponseSchema.safeParse(answer.data) : null;
      return got?.success ? { ok: true, value: { save: got.data.save ?? null, updatedAt: got.data.updatedAt } } : failure(answer?.status === 200 ? null : answer, "signed_out");
    },
    async store(token, save) {
      const body = JSON.stringify({ save });
      if (new TextEncoder().encode(body).length > SAVE_MAX_BYTES) return { ok: false, error: "too_big" };
      const answer = await call("PUT", "save", { token, body });
      const said = answer?.status === 200 ? SavedResponseSchema.safeParse(answer.data) : null;
      return said?.success ? { ok: true, value: said.data } : failure(answer?.status === 200 ? null : answer, "signed_out");
    },
    async rename(token, name) {
      const answer = await call("POST", "rename", { token, body: JSON.stringify({ name }) });
      const said = answer?.status === 200 ? RenamedResponseSchema.safeParse(answer.data) : null;
      return said?.success ? { ok: true, value: said.data } : failure(answer?.status === 200 ? null : answer, "signed_out");
    },
    async changePassword(token, current, next) {
      const answer = await call("POST", "password", { token, body: JSON.stringify({ current, next }) });
      return answer?.status === 204 ? { ok: true, value: null } : failure(answer, "signed_out");
    },
  };
}
