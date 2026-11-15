// Talks to the account routes of the server (/api/account/*). Every call has a time limit and never throws:
// a failure of any kind comes back as a named result. The browser's fetch is passed in, so tests use a made-up one.
import { SAVE_MAX_BYTES, SavedResponseSchema, SaveResponseSchema, SessionResponseSchema, StatusResponseSchema } from "./contracts";
import type { Save } from "./contracts";

export type AccountFetch = (url: string, init: { method: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{
  readonly status: number;
  json(): Promise<unknown>;
}>;

/** The longest one request may take. After it the request is given up and counts as unreachable. */
export const REQUEST_TIMEOUT_MS = 8_000;

/**
 * Why a call did not work. The first seven are the server's own answers; "unreachable" is everything else:
 * no network, no answer in time, or an answer that is not the account server's (a page, a proxy error).
 */
export type AccountError = "invalid" | "name_taken" | "wrong_name_or_password" | "slow_down" | "unavailable" | "signed_out" | "too_big" | "unreachable";

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
}

interface Answer {
  readonly status: number;
  readonly data: unknown;
}

const FAILURES: Readonly<Record<number, AccountError>> = { 400: "invalid", 409: "name_taken", 413: "too_big", 429: "slow_down", 503: "unavailable" };

function failure(answer: Answer | null, on401: AccountError): { ok: false; error: AccountError; field?: string } {
  if (!answer) return { ok: false, error: "unreachable" };
  const error = answer.status === 401 ? on401 : FAILURES[answer.status] ?? "unreachable";
  const data = answer.data;
  const field = typeof data === "object" && data !== null && "field" in data && typeof data.field === "string" ? data.field.slice(0, 40) : null;
  return error === "invalid" && field ? { ok: false, error, field } : { ok: false, error };
}

export function createAccountClient(fetch: AccountFetch, base = ""): AccountClient {
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
      return { status: response.status, data: await response.json().catch(() => null) };
    } catch {
      return null;
    }
  };

  const enter = async (path: "signup" | "signin", wanted: number, name: string, password: string): Promise<Result<Session>> => {
    const answer = await call("POST", path, { body: JSON.stringify({ name, password }) });
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
  };
}
