// Accounts over plain HTTP: is it on, sign up, sign in, sign out, and read and write the one save of an account.
// What is accepted lives in ../lib/accountRules, the database work in ../lib/accounts and the limits in ../lib/accountLimits;
// this file only turns them into requests and answers.
//
// The public tunnel reaches these paths, and so does every visitor of a public server (../lib/localOnly), so each step is in an order that costs a stranger more
// than it costs the server: is the database there (no work when it is not), a cheap count per address, a body of
// bounded size, the check of that body, and only then the budgets for what costs something (an account, a password
// hash, a query). A request that is empty or malformed is refused before any of those budgets, so it cannot use them
// up for anybody else. With no database every route but status answers 503 and the game plays as signed out.
// docs/accounts.md has the list of what is bounded and by what.
import express from "express";
import type { Request, RequestHandler, Response } from "express";
import { log } from "../../src/core/log";
import type { Register } from "../app";
import { Busy, STRANGERS_AT_ONCE, STRANGERS_WAITING, callerOf, createAccountLimits, createGate } from "../lib/accountLimits";
import { CREDENTIALS_BODY_BYTES, SAVE_BODY_BYTES, nameKey, parseCredentials, parseSaveBody } from "../lib/accountRules";
import { Unavailable, bearerToken, createAccounts } from "../lib/accounts";
import type { Reach } from "../lib/accounts";
import { shareAccounts } from "../lib/accountsShared";
import { dbRedactor, openDb } from "../lib/db";
import { behindOwnProxy } from "../lib/localOnly";
import { THIS_MACHINE } from "../lib/roomLimits";
import { withTimeout } from "../lib/timeout";

/** How long "is the database there" may take to answer a request. The first question after a start also opens the database and makes the tables. */
export const STATUS_MS = 4_000;

function unavailable(response: Response): void {
  response.status(503).json({ error: "unavailable" });
}

function slowDown(response: Response, seconds: number): void {
  response.status(429).set("Retry-After", String(seconds)).json({ error: "slow_down" });
}

/**
 * Sign-up is closed for strangers: the accounts all of them together may make in ten minutes, an hour or a day are
 * used up (429, with how long to wait), or the database holds as many accounts as it may (503). Sign-in goes on.
 * The words are for a person; the browser shows its own (src/account/session.ts).
 */
export const SIGNUPS_CLOSED_TEXT = "No new accounts can be made right now. Signing in still works. Try again later.";
function signUpsClosed(response: Response, seconds: number | null): void {
  if (seconds !== null) response.set("Retry-After", String(seconds));
  response.status(seconds === null ? 503 : 429).json({ error: "signups_closed", message: SIGNUPS_CLOSED_TEXT });
}
/** How long to wait when the database, not this server's own count, says enough accounts were made this hour or today. */
export const CLOSED_RETRY_S = 600;

function signedOut(response: Response): void {
  response.status(401).json({ error: "signed_out" });
}

/** The one answer to a sign-in that did not work, whatever the reason: an unknown name, a wrong password, a body that is neither. */
function wrong(response: Response): void {
  response.status(401).json({ error: "wrong_name_or_password" });
}

function invalid(response: Response, field: string): void {
  response.status(400).json({ error: "invalid", field });
}

/**
 * Reads a JSON body of at most `limit` bytes. The app's own parser skips these routes (see ../app), so nothing larger
 * is ever held. A body that says it is too long is refused before any of it is read; one that does not say is thrown
 * away once it passes the limit. `tooBig` and `notJson` write the answer for each.
 */
export function smallBody(limit: number, tooBig: (response: Response) => void, notJson: (response: Response) => void): RequestHandler {
  const parse = express.json({ limit });
  return (request, response, next) => {
    if (Number(request.headers["content-length"] ?? 0) > limit) {
      tooBig(response);
      return;
    }
    parse(request, response, (error?: unknown) => {
      if (error === undefined) next();
      else if (typeof error === "object" && error !== null && "status" in error && error.status === 413) tooBig(response);
      else notJson(response);
    });
  };
}

export const register: Register = (router, deps) => {
  const url = deps.config.databaseUrl ?? null;
  const redact = dbRedactor(url);
  const accounts = deps.accounts ?? createAccounts(() => openDb(url, { caFile: deps.config.databaseCaFile ?? null }));
  const limits = createAccountLimits();
  const strangers = createGate(STRANGERS_AT_ONCE, STRANGERS_WAITING);
  shareAccounts(deps, { accounts, strangers, limits });

  /** Who a request is counted against (callerOf). Asked on every request: the server reads its .env after this file is loaded. */
  const client = (request: Request): string => callerOf(request.socket.remoteAddress, request.headers, behindOwnProxy());

  /** Database work. A stranger's waits at the gate, so however many arrive at once the laptop still finds a free connection. */
  const reach = <T>(who: string, work: () => Promise<T>): Promise<T> => (who === THIS_MACHINE ? work() : strangers(work));
  /** The same for sign-up and sign-in, which run their statements through it one by one and hash the password outside it. */
  const through = (who: string): Reach => (work) => reach(who, work);

  /** Whether the database answers, within STATUS_MS. A slow start goes on in the background and the next request finds it done. */
  const available = (): Promise<boolean> => withTimeout(STATUS_MS, () => accounts.available()).catch(() => false);

  /**
   * Runs a handler so that nothing it throws reaches the app's error handler, which would log the error as it is.
   * No place at a gate is 429; everything else is 503, logged here with the connection string cut out.
   */
  const safely = (work: (request: Request, response: Response, next: () => void) => Promise<void>): RequestHandler =>
    (request, response, next) => {
      work(request, response, () => { next(); }).catch((error: unknown) => {
        if (response.headersSent) return;
        if (error instanceof Busy) {
          slowDown(response, 1);
          return;
        }
        if (!(error instanceof Unavailable)) log("error", "account_route_failed", redact(error));
        unavailable(response);
      });
    };

  /** Refuses an address that sends sign-ups, or sign-ins, too fast, before any of the body is read. */
  const attempt = (what: "signup" | "signin"): RequestHandler => (request, response, next) => {
    const wait = limits.attempt(client(request), what);
    if (wait > 0) slowDown(response, wait);
    else next();
  };

  /**
   * The account a token belongs to, or the answer already written: 429 when this address has sent too many tokens
   * the database did not know, 401 when this one is unknown or has run out. A token seen a short while ago is not
   * asked about again, so somebody else's junk from the same address cannot stop a player who is signed in.
   */
  const accountOf = async (who: string, token: string, response: Response): Promise<string | null> => {
    const seen = accounts.remembered(token);
    if (seen !== null) return seen;
    const wait = limits.lookup(who);
    if (wait > 0) {
      slowDown(response, wait);
      return null;
    }
    let found: string | null = null;
    try {
      found = await reach(who, () => accounts.accountOf(token));
    } catch (error) {
      // No answer says nothing about the token, so it is not held against the address.
      limits.tokenKnown(who);
      throw error;
    }
    if (found === null) {
      signedOut(response);
      return null;
    }
    limits.tokenKnown(who);
    return found;
  };

  /**
   * Finds whose request this is and puts the account id in response.locals. A request with no well-formed token is
   * 401 at once and counted nowhere: it cost nothing. A known account is then counted for itself, not for its address.
   */
  const owner = safely(async (request, response, next) => {
    const token = bearerToken(request.headers.authorization);
    if (token === null) {
      signedOut(response);
      return;
    }
    const who = client(request);
    const found = await accountOf(who, token, response);
    if (found === null) return;
    const wait = limits.request(who, found);
    if (wait > 0) {
      slowDown(response, wait);
      return;
    }
    response.locals.accountId = found;
    next();
  });
  const accountId = (response: Response): string => String(response.locals.accountId);

  // A token is in these answers, and a save is one player's: nothing between the server and the browser may keep a copy.
  router.use("/api/account", (_request, response, next) => {
    response.set("Cache-Control", "no-store");
    next();
  });

  router.get("/api/account/status", safely(async (_request, response) => {
    response.json({ available: await available() });
  }));

  // Everything below needs the database. Asked first, so with accounts off no body is read and nothing is counted.
  router.use("/api/account", safely(async (_request, response, next) => {
    if (await available()) next();
    else unavailable(response);
  }));

  router.post(
    "/api/account/signup",
    attempt("signup"),
    smallBody(CREDENTIALS_BODY_BYTES, (response) => { invalid(response, "body"); }, (response) => { invalid(response, "body"); }),
    safely(async (request, response) => {
      const asked = parseCredentials(request.body);
      if ("field" in asked) {
        invalid(response, asked.field);
        return;
      }
      const who = client(request);
      // Closed for all strangers: said in its own words, before anything is held or asked. Sign-in is not touched by it.
      const closed = limits.signUpsClosed(who);
      if (closed > 0) {
        signUpsClosed(response, closed);
        return;
      }
      // Held from here, and given back unless an account is made: a typo or a taken name uses up nobody's sign-ups.
      const wait = limits.signUp(who);
      if (wait > 0) {
        slowDown(response, wait);
        return;
      }
      let made: Awaited<ReturnType<typeof accounts.signUp>> = "full";
      try {
        made = await accounts.signUp(asked.name, asked.password, who === THIS_MACHINE, through(who));
      } finally {
        if (typeof made === "string") limits.signUpNotMade(who);
      }
      if (made === "name_taken") response.status(409).json({ error: "name_taken" });
      else if (made === "full" || made === "closed") {
        log("warn", made === "full" ? "accounts_at_cap" : "accounts_signups_closed");
        signUpsClosed(response, made === "full" ? null : CLOSED_RETRY_S);
      } else response.status(201).json(made);
    }),
  );

  router.post(
    "/api/account/signin",
    attempt("signin"),
    smallBody(CREDENTIALS_BODY_BYTES, wrong, wrong),
    safely(async (request, response) => {
      const asked = parseCredentials(request.body);
      if ("field" in asked) {
        wrong(response);
        return;
      }
      const who = client(request);
      const key = nameKey(asked.name);
      // Counted for the name whether or not it exists, so the 429 says nothing about which names do.
      const wait = limits.signIn(who, key);
      if (wait > 0) {
        slowDown(response, wait);
        return;
      }
      let signed: Awaited<ReturnType<typeof accounts.signIn>> = null;
      let checked = false;
      try {
        signed = await accounts.signIn(asked.name, asked.password, who === THIS_MACHINE, through(who));
        checked = true;
      } finally {
        // Only a wrong password stays counted against the name: not a right one, and not a try that was never checked.
        if (signed !== null || !checked) limits.signedIn(who, key);
      }
      if (signed === null) wrong(response);
      else response.json(signed);
    }),
  );

  // 204 whether or not the token was known, so the answer says nothing about a token. A request with no well-formed
  // token is 204 at once. When the session could not be ended (429, 503) the answer says so instead of 204.
  router.post("/api/account/signout", safely(async (request, response) => {
    const token = bearerToken(request.headers.authorization);
    if (token !== null) {
      const who = client(request);
      // A token this server has not just seen may be anybody's guess, so it is counted like one before the database is asked.
      const wait = accounts.remembered(token) === null ? limits.lookup(who) : 0;
      if (wait > 0) {
        slowDown(response, wait);
        return;
      }
      await reach(who, () => accounts.signOut(token));
    }
    response.status(204).end();
  }));

  router.get("/api/account/save", owner, safely(async (request, response) => {
    response.json(await reach(client(request), () => accounts.readSave(accountId(response))));
  }));

  router.put(
    "/api/account/save",
    owner,
    // After the owner is known and before the body is read: a stranger's 32 KB is never parsed, and one account is written at a bounded rate.
    (_request, response, next) => {
      const wait = limits.save(accountId(response));
      if (wait > 0) slowDown(response, wait);
      else next();
    },
    smallBody(SAVE_BODY_BYTES, (response) => { response.status(413).json({ error: "too_big" }); }, (response) => { invalid(response, "body"); }),
    safely(async (request, response) => {
      const save = parseSaveBody(request.body);
      if (save === null) {
        invalid(response, "save");
        return;
      }
      response.json(await reach(client(request), () => accounts.writeSave(accountId(response), save)));
    }),
  );
};
