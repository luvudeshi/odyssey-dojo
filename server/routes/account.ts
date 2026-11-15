// Accounts over plain HTTP: is it on, sign up, sign in, sign out, and read and write the one save of an account.
// What is accepted lives in ../lib/accountRules, the database work in ../lib/accounts and the limits in ../lib/accountLimits;
// this file only turns them into requests and answers.
//
// Another device and the public tunnel reach these paths (../lib/localOnly), so each step is in an order that costs a
// stranger more than it costs the server: is the database there (no work when it is not), then the limits, then a body
// of bounded size, then the check of that body, and only then a password hash or a query. With no database every route
// but status answers 503 and the game plays as signed out. docs/accounts.md has the list of what is bounded and by what.
import express from "express";
import type { Request, RequestHandler, Response } from "express";
import { log } from "../../src/core/log";
import type { Register } from "../app";
import { Busy, createAccountLimits } from "../lib/accountLimits";
import { CREDENTIALS_BODY_BYTES, SAVE_BODY_BYTES, nameKey, parseCredentials, parseSaveBody } from "../lib/accountRules";
import { Unavailable, bearerToken, createAccounts } from "../lib/accounts";
import { dbSecrets, openDb } from "../lib/db";
import { createRedactor } from "../lib/redact";
import { THIS_MACHINE, clientKey } from "../lib/roomLimits";

function unavailable(response: Response): void {
  response.status(503).json({ error: "unavailable" });
}

function slowDown(response: Response, seconds: number): void {
  response.status(429).set("Retry-After", String(seconds)).json({ error: "slow_down" });
}

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
  const redact = createRedactor(dbSecrets(url));
  const accounts = deps.accounts ?? createAccounts(() => openDb(url), { redact });
  const limits = createAccountLimits();
  const client = (request: Request): string => clientKey(request.socket.remoteAddress, request.headers);

  /**
   * Runs a handler so that nothing it throws reaches the app's error handler, which would log the error as it is.
   * No place for a hash is 429; everything else is 503, logged here with the connection string cut out.
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

  /** Refuses a client that is over a limit, and counts it otherwise. */
  const within = (take: (client: string) => number): RequestHandler => (request, response, next) => {
    const wait = take(client(request));
    if (wait > 0) slowDown(response, wait);
    else next();
  };

  /**
   * Finds whose request this is and puts the account id in response.locals. No token, an unknown one or one that has
   * run out is 401. Unknown tokens are counted, so guessing them (hopeless as it is) cannot keep the database busy.
   */
  const owner = safely(async (request, response, next) => {
    const token = bearerToken(request.headers.authorization);
    if (token === null) {
      signedOut(response);
      return;
    }
    const who = client(request);
    const wait = limits.wrongTokenWait(who);
    if (wait > 0) {
      slowDown(response, wait);
      return;
    }
    const accountId = await accounts.accountOf(token);
    if (accountId === null) {
      limits.wrongTokenCount(who);
      signedOut(response);
      return;
    }
    response.locals.accountId = accountId;
    next();
  });
  const accountId = (response: Response): string => String(response.locals.accountId);

  // A token is in these answers, and a save is one player's: nothing between the server and the browser may keep a copy.
  router.use("/api/account", (_request, response, next) => {
    response.set("Cache-Control", "no-store");
    next();
  });

  router.get("/api/account/status", safely(async (_request, response) => {
    response.json({ available: await accounts.available() });
  }));

  // Everything below needs the database. Asked first, so with accounts off no body is read and nothing is counted.
  router.use("/api/account", safely(async (_request, response, next) => {
    if (await accounts.available()) next();
    else unavailable(response);
  }));

  router.post(
    "/api/account/signup",
    within(limits.signUp),
    smallBody(CREDENTIALS_BODY_BYTES, (response) => { invalid(response, "body"); }, (response) => { invalid(response, "body"); }),
    safely(async (request, response) => {
      const asked = parseCredentials(request.body);
      if ("field" in asked) {
        invalid(response, asked.field);
        return;
      }
      const made = await accounts.signUp(asked.name, asked.password, client(request) === THIS_MACHINE);
      if (made === "name_taken") response.status(409).json({ error: "name_taken" });
      else if (made === "full") {
        log("warn", "accounts_at_cap");
        unavailable(response);
      } else response.status(201).json(made);
    }),
  );

  router.post(
    "/api/account/signin",
    within(limits.signIn),
    smallBody(CREDENTIALS_BODY_BYTES, wrong, wrong),
    safely(async (request, response) => {
      const asked = parseCredentials(request.body);
      if ("field" in asked) {
        wrong(response);
        return;
      }
      const who = client(request);
      // Counted for the name whether or not it exists, so the 429 says nothing about which names do.
      const wait = limits.signInName(who, nameKey(asked.name));
      if (wait > 0) {
        slowDown(response, wait);
        return;
      }
      const signed = await accounts.signIn(asked.name, asked.password, who === THIS_MACHINE);
      if (signed === null) wrong(response);
      else response.json(signed);
    }),
  );

  // 204 whether or not the token was known, so the answer says nothing about a token.
  router.post("/api/account/signout", within(limits.request), safely(async (request, response) => {
    const token = bearerToken(request.headers.authorization);
    if (token !== null) await accounts.signOut(token);
    response.status(204).end();
  }));

  router.get("/api/account/save", within(limits.request), owner, safely(async (_request, response) => {
    response.json(await accounts.readSave(accountId(response)));
  }));

  router.put(
    "/api/account/save",
    within(limits.request),
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
      response.json(await accounts.writeSave(accountId(response), save));
    }),
  );
};
