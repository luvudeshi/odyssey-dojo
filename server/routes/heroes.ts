// The hall of heroes over plain HTTP: a signed-in player's finished fight is written down, and anybody may read the lists.
// What is accepted lives in ../lib/heroRules, the database work in ../lib/heroes and the limits in ../lib/heroLimits.
//
// The public tunnel reaches both paths (../lib/localOnly). A fight is written only for the account its session
// belongs to, a few a minute at most, and the hall is read from memory: the database is asked once in
// HALL_CACHE_MS however many ask. The score is the browser's own word; docs/accounts.md says so.
// Nothing here shows a player an error: the browser sends a fight in the background and forgets the answer.
//
// This file is registered after routes/account.ts (the files are taken in alphabetical order), which gives it the
// accounts of this app and has already put "no-store" and the 503 of a database that is down on /api/account/.
import type { Request, RequestHandler, Response } from "express";
import { log } from "../../src/core/log";
import type { Register } from "../app";
import { Busy } from "../lib/accountLimits";
import { Unavailable, bearerToken, statementsOf } from "../lib/accounts";
import { sharedAccounts } from "../lib/accountsShared";
import type { SharedAccounts } from "../lib/accountsShared";
import { createHeroLimits } from "../lib/heroLimits";
import { FIGHT_BODY_BYTES, parseFightBody } from "../lib/heroRules";
import { createHeroes } from "../lib/heroes";
import type { HallRow, Heroes } from "../lib/heroes";
import { wasRelayed } from "../lib/localOnly";
import { RELAYED, THIS_MACHINE, clientKey } from "../lib/roomLimits";
import { smallBody } from "./account";

function unavailable(response: Response): void {
  response.status(503).json({ error: "unavailable" });
}

function slowDown(response: Response, seconds: number): void {
  response.status(429).set("Retry-After", String(seconds)).json({ error: "slow_down" });
}

function signedOut(response: Response): void {
  response.status(401).json({ error: "signed_out" });
}

function invalid(response: Response, field: string): void {
  response.status(400).json({ error: "invalid", field });
}

export const register: Register = (router, deps) => {
  const limits = createHeroLimits();

  /** The accounts of this app and the hall on top of them, or null when there are none to use. Looked up at each request, made once. */
  let made: { readonly shared: SharedAccounts; readonly heroes: Heroes } | null = null;
  const linked = (): { readonly shared: SharedAccounts; readonly heroes: Heroes } | null => {
    if (made !== null) return made;
    const shared = sharedAccounts(deps);
    if (shared === null) return null;
    const door = statementsOf(shared.accounts);
    // A reading of the hall takes a stranger's place at the gate but is never turned away: there is one at a time at most.
    const heroes = deps.heroes ?? (door === null ? null : createHeroes(door, { gate: (work) => shared.strangers(work, true) }));
    if (heroes === null) return null;
    made = { shared, heroes };
    return made;
  };

  /** Who a request is counted against, as in routes/account.ts: a request that was passed on never gets the laptop's free pass. */
  const client = (request: Request): string => {
    const who = clientKey(request.socket.remoteAddress, request.headers);
    return who === THIS_MACHINE && wasRelayed(request.headers) ? RELAYED : who;
  };

  /** Runs a handler so that nothing it throws reaches the app's error handler. No place at a gate is 429; everything else is 503. */
  const safely = (work: (request: Request, response: Response, next: () => void) => Promise<void>): RequestHandler =>
    (request, response, next) => {
      work(request, response, () => { next(); }).catch((error: unknown) => {
        if (response.headersSent) return;
        if (error instanceof Busy) {
          slowDown(response, 1);
          return;
        }
        // The database's own failures were logged at the door, with the connection string cut out. Anything else is a fault here.
        if (!(error instanceof Unavailable)) log("error", "heroes_route_failed", error instanceof Error ? error.name : "unknown");
        unavailable(response);
      });
    };

  /**
   * The account a token belongs to, or null with nothing said. A token seen a short while ago costs no query.
   * One the database has to be asked about is counted for its address first, so guesses cannot keep the database busy.
   * `wait` is how long the address must wait when that count is used up.
   */
  const accountOf = async (shared: SharedAccounts, who: string, token: string): Promise<{ readonly id: string | null; readonly wait: number }> => {
    const seen = shared.accounts.remembered(token);
    if (seen !== null) return { id: seen, wait: 0 };
    const wait = shared.limits.lookup(who);
    if (wait > 0) return { id: null, wait };
    let found: string | null = null;
    try {
      found = await (who === THIS_MACHINE ? shared.accounts.accountOf(token) : shared.strangers(() => shared.accounts.accountOf(token)));
    } catch (error) {
      // No answer says nothing about the token, so it is not held against the address.
      shared.limits.tokenKnown(who);
      throw error;
    }
    if (found !== null) shared.limits.tokenKnown(who);
    return { id: found, wait: 0 };
  };

  /** Finds whose fight this is before any of the body is read, and counts the fight for that account. */
  const owner = safely(async (request, response, next) => {
    const found = linked();
    if (found === null) {
      unavailable(response);
      return;
    }
    const token = bearerToken(request.headers.authorization);
    if (token === null) {
      signedOut(response);
      return;
    }
    const who = client(request);
    const account = await accountOf(found.shared, who, token);
    if (account.wait > 0) {
      slowDown(response, account.wait);
      return;
    }
    if (account.id === null) {
      signedOut(response);
      return;
    }
    const wait = limits.fight(who, account.id);
    if (wait > 0) {
      slowDown(response, wait);
      return;
    }
    response.locals.accountId = account.id;
    next();
  });

  /** Gives back what a fight took of the strangers' shared count when no row came of it: only fights really written use it up. */
  const notWritten = (request: Request): void => { limits.fightNotWritten(client(request)); };

  router.post(
    "/api/account/fights",
    owner,
    smallBody(
      FIGHT_BODY_BYTES,
      (response) => { notWritten(response.req); response.status(413).json({ error: "too_big" }); },
      (response) => { notWritten(response.req); invalid(response, "body"); },
    ),
    safely(async (request, response) => {
      const found = linked();
      const fight = parseFightBody(request.body);
      if (found === null || fight === null) {
        notWritten(request);
        if (found === null) unavailable(response);
        else invalid(response, "fight");
        return;
      }
      const who = client(request);
      const work = (): Promise<boolean> => found.heroes.record(String(response.locals.accountId), fight);
      let written = false;
      try {
        written = await (who === THIS_MACHINE ? work() : found.shared.strangers(work));
      } finally {
        if (!written) notWritten(request);
      }
      // The session was good a moment ago and the account is gone: the same answer as a session that ran out.
      if (written) response.status(201).json({ recorded: true });
      else signedOut(response);
    }),
  );

  // Open to everybody: the lists hold hero names and scores and nothing else of an account. A reader who is signed in
  // gets their own row marked, so the answer is theirs alone and is not kept by anything on the way.
  router.get("/api/heroes", safely(async (request, response) => {
    response.set("Cache-Control", "no-store");
    const who = client(request);
    const wait = limits.read(who);
    if (wait > 0) {
      slowDown(response, wait);
      return;
    }
    const found = linked();
    if (found === null) {
      unavailable(response);
      return;
    }
    // From memory when it was read in the last HALL_CACHE_MS. With the database down this fails at once, at the accounts' door: 503.
    const hall = await found.heroes.hall();
    // Whose row to mark. Any trouble with the token (unknown, too many, the database slow) only leaves the mark out.
    const token = bearerToken(request.headers.authorization);
    const reader = token === null ? null : (await accountOf(found.shared, who, token).catch(() => null))?.id ?? null;
    const shown = (rows: readonly HallRow[]): unknown[] =>
      rows.map((row) => ({ hero: row.hero, score: row.score, stop: row.stop, style: row.style, god: row.god, you: reader !== null && row.accountId === reader }));
    response.json({
      at: hall.at,
      tonight: shown(hall.tonight),
      allTime: shown(hall.allTime),
      lastHour: hall.lastHour,
      fightsEver: hall.fightsEver,
      stops: hall.stops,
      activity: hall.activity,
    });
  }));
};
