// The browser's side of the hall of heroes (src/account/heroes.ts): a finished fight is sent once when a player is
// signed in and never when nobody is, what is sent, and what is made of the hall the server gives back.
// The fetch is made up and answers what the test tells it to; no server runs.
import { expect, test } from "vitest";
import type { AccountFetch } from "../src/account/client";
import {
  HERO_COMBO_MAX, HERO_SCORE_MAX, HERO_SECONDS_MAX, HERO_SECONDS_MIN, HERO_SLUG, HallSchema, createHeroesClient, fightReport,
} from "../src/account/heroes";
import type { Hall } from "../src/account/heroes";
import { SESSION_KEY } from "../src/account/session";
import { createProfileStore } from "../src/account/store";
import type { FightResult } from "../src/account/store";
import { fightSeconds, newTally, tallyFrame } from "../src/account/tally";
import * as serverRules from "../server/lib/heroRules";
import { parseFightBody } from "../server/lib/heroRules";
import { ACTIVITY_BUCKETS, BOARD_SIZE, STOPS_MAX } from "../server/lib/heroes";
import { memory } from "./helpers/accountKit";

type Init = Parameters<AccountFetch>[1];
const TOKEN = "t".repeat(43);
const SIGNED_IN = { [SESSION_KEY]: JSON.stringify({ token: TOKEN, name: "Luv", merged: true, unsent: false, fresh: false }) };
const HALL: Hall = {
  at: "2026-11-15T06:00:00.000Z",
  tonight: [{ hero: "Penelope", score: 6840, stop: "scylla", style: "jiu_jitsu", god: "athena", you: false }, { hero: "Luv", score: 4105, stop: "polyphemus", style: "boxer", god: null, you: true }],
  allTime: [{ hero: "Luv", score: 8150, stop: "suitors", style: "boxer", god: "zeus", you: true }],
  lastHour: 3,
  fightsEver: 41,
  stops: [{ stop: "polyphemus", fights: 9, wins: 5 }],
  activity: { minutes: 10, until: "2026-11-15T06:10:00.000Z", fights: Array.from({ length: 36 }, (_unused, index) => index % 4) },
};

/** One finished fight as the game records it, with its own tally: 62.4 seconds from its first frame to its last. */
function fought(change: Partial<FightResult> = {}): FightResult {
  const tally = newTally();
  tallyFrame(tally, [], 3, false, 1_000);
  tallyFrame(tally, [], 7, false, 63_400);
  return { enemyId: "polyphemus", won: true, score: 1840, mastery: { jab: 3 }, styleId: "boxer", tally, godId: "athena", ...change };
}

/** A client whose server always gives one answer, and the requests it was sent. */
function answering(status: number, body?: unknown, storage: Readonly<Record<string, string>> = SIGNED_IN) {
  const sent: { url: string; init: Init }[] = [];
  const fetch: AccountFetch = (url, init) => {
    sent.push({ url, init });
    return Promise.resolve({ status, json: () => (body === undefined ? Promise.reject(new SyntaxError("no JSON")) : Promise.resolve(body)) });
  };
  return { client: createHeroesClient({ fetch, storage: memory(storage), heroName: () => "Luv the Bold" }), sent };
}

test("signed out, a finished fight sends nothing at all", async () => {
  for (const storage of [{}, { [SESSION_KEY]: "not json" }, { [SESSION_KEY]: JSON.stringify({ token: "short", name: "Luv" }) }, { [SESSION_KEY]: JSON.stringify({ name: "Luv" }) }]) {
    const { client, sent } = answering(201, { recorded: true }, storage);
    expect(await client.record(fought())).toBe(false);
    expect(sent).toEqual([]);
  }
  // No storage at all, and one that throws as a private window does.
  const sent: string[] = [];
  const fetch: AccountFetch = (url) => { sent.push(url); return Promise.resolve({ status: 201, json: () => Promise.resolve({}) }); };
  expect(await createHeroesClient({ fetch, storage: null, heroName: () => "Luv" }).record(fought())).toBe(false);
  expect(await createHeroesClient({ fetch, storage: { getItem: () => { throw new Error("private window"); } }, heroName: () => "Luv" }).record(fought())).toBe(false);
  expect(sent).toEqual([]);
});

test("signed in, a finished fight is sent once with the session, and what is sent is what the server takes", async () => {
  const { client, sent } = answering(201, { recorded: true });
  const fight = fought();
  expect(await client.record(fight)).toBe(true);
  expect(sent).toHaveLength(1);
  expect(sent[0]?.url).toBe("/api/account/fights");
  expect(sent[0]?.init.method).toBe("POST");
  expect(sent[0]?.init.headers).toEqual({ "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` });
  expect(sent[0]?.init.signal).toBeInstanceOf(AbortSignal);
  const body = JSON.parse(sent[0]?.init.body ?? "") as unknown;
  expect(body).toEqual({ fight: { stop: "polyphemus", won: true, score: 1840, style: "boxer", god: "athena", seconds: 62.4, bestCombo: 7, hero: "Luv the Bold" } });
  // The server's own check takes it as it is.
  expect(parseFightBody(body)).toEqual({ stop: "polyphemus", won: true, score: 1840, style: "boxer", god: "athena", seconds: 62.4, bestCombo: 7, hero: "Luv the Bold" });
  // The result screen draws more than once and hands the same fight over again: it is not sent twice.
  expect(await client.record(fight)).toBe(false);
  expect(await client.record({ ...fight, score: 9999 })).toBe(false);
  expect(sent).toHaveLength(1);
  // The next fight has a tally of its own and is sent.
  expect(await client.record(fought({ won: false, score: 120, godId: null }))).toBe(true);
  expect(sent).toHaveLength(2);
  expect((JSON.parse(sent[1]?.init.body ?? "") as { fight: unknown }).fight).toMatchObject({ won: false, score: 120, god: null });
});

test("whatever the server says, and with no server at all, sending a fight never throws and is not tried again", async () => {
  for (const [status, body] of [[400, { error: "invalid", field: "fight" }], [401, { error: "signed_out" }], [413, { error: "too_big" }], [429, { error: "slow_down" }], [503, { error: "unavailable" }], [200, "<!doctype html>"], [500, undefined]] as const) {
    const { client, sent } = answering(status, body);
    const fight = fought();
    expect(await client.record(fight), String(status)).toBe(false);
    expect(await client.record(fight), String(status)).toBe(false);
    expect(sent).toHaveLength(1);
  }
  let calls = 0;
  const offline: AccountFetch = () => { calls += 1; return Promise.reject(new TypeError("Failed to fetch")); };
  const client = createHeroesClient({ fetch: offline, storage: memory(SIGNED_IN), heroName: () => "Luv" });
  expect(await client.record(fought())).toBe(false);
  expect(await client.hall()).toBeNull();
  expect(calls).toBe(2);
});

test("a fight the server would refuse is not sent; how long it took is clamped, and a fight nobody timed has no time", () => {
  expect(fightReport(fought(), "Luv")).toEqual({ stop: "polyphemus", won: true, score: 1840, style: "boxer", god: "athena", seconds: 62.4, bestCombo: 7, hero: "Luv" });
  for (const change of [{ score: HERO_SCORE_MAX + 1 }, { score: -5 }, { score: Number.NaN }, { score: Number.POSITIVE_INFINITY }, { enemyId: "" }, { enemyId: "Not A Slug" }, { enemyId: "x".repeat(33) }, { styleId: "" }, { styleId: "kung fu" }] as const) {
    expect(fightReport(fought(change), "Luv"), JSON.stringify(change)).toBeNull();
  }
  // A score with a fraction is rounded, a god id that is not a slug is left out, a combo past the cap is the cap.
  expect(fightReport(fought({ score: 1840.6, godId: "Athena!" }), "Luv")).toMatchObject({ score: 1841, god: null });
  expect(fightReport(fought({ score: HERO_SCORE_MAX }), "Luv")).toMatchObject({ score: HERO_SCORE_MAX });
  expect(fightReport(fought({ tally: { ...newTally(), bestCombo: HERO_COMBO_MAX + 40 } }), "Luv")).toMatchObject({ bestCombo: HERO_COMBO_MAX, seconds: null });
  // A fight recorded by code that knows nothing of gods has none.
  const { enemyId, won, score, mastery, styleId, tally: plain } = fought();
  expect(fightReport({ enemyId, won, score, mastery, styleId, tally: plain }, "Luv")).toMatchObject({ god: null, seconds: 62.4 });
  const timed = (ms: number): FightResult => {
    const tally = newTally();
    tallyFrame(tally, [], 0, false, 5_000);
    tallyFrame(tally, [], 0, false, 5_000 + ms);
    return fought({ tally });
  };
  expect(fightReport(timed(200), "Luv")?.seconds).toBe(HERO_SECONDS_MIN);
  expect(fightReport(timed(26 * 60 * 60 * 1000), "Luv")?.seconds).toBe(HERO_SECONDS_MAX);
  expect(fightReport(timed(41_234), "Luv")?.seconds).toBe(41.2);
  // Every one of these the server takes.
  for (const fight of [fought({ score: HERO_SCORE_MAX }), timed(200), timed(26 * 60 * 60 * 1000), fought({ tally: newTally(), godId: null })]) {
    expect(parseFightBody({ fight: fightReport(fight, "") })).not.toBeNull();
  }
});

test("the browser and the server hold a fight to the same bounds", () => {
  expect([serverRules.SCORE_MAX, serverRules.SECONDS_MIN, serverRules.SECONDS_MAX, serverRules.COMBO_MAX, serverRules.SLUG.source])
    .toEqual([HERO_SCORE_MAX, HERO_SECONDS_MIN, HERO_SECONDS_MAX, HERO_COMBO_MAX, HERO_SLUG.source]);
  // The hall the server builds fits the schema the browser reads it with.
  const row = { hero: "H".repeat(20), score: serverRules.SCORE_MAX, stop: "s".repeat(32), style: "boxer", god: null, you: false };
  const full = {
    at: new Date(0).toISOString(), tonight: Array.from({ length: BOARD_SIZE }, () => row), allTime: Array.from({ length: BOARD_SIZE }, () => row), lastHour: 120, fightsEver: 1e6,
    stops: Array.from({ length: STOPS_MAX }, () => ({ stop: "s".repeat(32), fights: 9, wins: 9 })),
    activity: { minutes: 10, until: new Date(0).toISOString(), fights: Array.from({ length: ACTIVITY_BUCKETS }, () => 240) },
  };
  expect(HallSchema.safeParse(full).success).toBe(true);
});

test("the tally times a fight from its first frame to its last, beside what it counts and not in it", () => {
  const tally = newTally();
  expect(fightSeconds(tally)).toBeNull();
  tallyFrame(tally, [], 2, false, 10_000);
  expect(fightSeconds(tally)).toBe(0);
  tallyFrame(tally, [], 5, false, 10_016);
  tallyFrame(tally, [], 1, false, 83_500);
  expect(fightSeconds(tally)).toBe(73.5);
  // The profile adds up the tally, so the clock must not be a field of it.
  expect(tally).toEqual({ powers: 0, blocks: 0, dodges: 0, hitsTaken: 0, bestCombo: 5, room: false });
  // Another fight's tally has its own clock, and a copy of a tally has none.
  expect(fightSeconds(newTally())).toBeNull();
  expect(fightSeconds({ ...tally })).toBeNull();
  // With no clock given it reads the real one.
  const real = newTally();
  tallyFrame(real, [], 0, false);
  expect(fightSeconds(real)).toBe(0);
});

test("the profile store tells a listener of each recorded fight, after the profile has it, and of nothing else", () => {
  const store = createProfileStore(memory());
  const heard: { fights: number; score: number; god: string | null | undefined }[] = [];
  const stop = store.onFight((fight) => { heard.push({ fights: store.get().fights, score: fight.score, god: fight.godId }); });
  store.record(fought());
  store.record(fought({ score: 50, won: false, godId: null }));
  // A rename, a dojo session, a room and a save that came from the account are not fights.
  store.rename("Luv");
  store.recordDojo(true);
  store.recordRoom();
  store.replace({ fights: 40, wins: 30, bestScore: 9000 });
  expect(heard).toEqual([{ fights: 1, score: 1840, god: "athena" }, { fights: 2, score: 50, god: null }]);
  stop();
  store.record(fought());
  expect(heard).toHaveLength(2);
});

test("a recorded fight reaches the server through the store's listener when signed in, and the hall is only read when asked", async () => {
  const { client, sent } = answering(201, { recorded: true });
  const store = createProfileStore(memory());
  const done: Promise<boolean>[] = [];
  store.onFight((fight) => { done.push(client.record(fight)); });
  expect(sent).toEqual([]);
  store.record(fought());
  expect(await Promise.all(done)).toEqual([true]);
  expect(sent.map((one) => `${one.init.method} ${one.url}`)).toEqual(["POST /api/account/fights"]);
});

test("the hall is read with the session when there is one, and anything that is not a hall is no hall", async () => {
  const signedIn = answering(200, HALL);
  expect(await signedIn.client.hall()).toEqual(HALL);
  expect(signedIn.sent[0]?.url).toBe("/api/heroes");
  expect(signedIn.sent[0]?.init.method).toBe("GET");
  expect(signedIn.sent[0]?.init.headers).toEqual({ Authorization: `Bearer ${TOKEN}` });
  const signedOut = answering(200, HALL, {});
  expect(await signedOut.client.hall()).toEqual(HALL);
  expect(signedOut.sent[0]?.init.headers).toEqual({});
  // An empty hall is a hall.
  const empty = { ...HALL, tonight: [], allTime: [], lastHour: 0, fightsEver: 0, stops: [] };
  expect(await answering(200, empty).client.hall()).toEqual(empty);
  // A field the browser does not know is dropped, so an id the server should never send could not reach the screen.
  const extra = await answering(200, { ...HALL, tonight: [{ ...HALL.tonight[0], accountId: "0d15ea5e" }], secret: 1 }).client.hall();
  expect(JSON.stringify(extra)).not.toContain("0d15ea5e");
  expect(extra).toEqual({ ...HALL, tonight: [HALL.tonight[0]] });
  const notOne: readonly (readonly [number, unknown])[] = [
    [503, { error: "unavailable" }], [429, { error: "slow_down" }], [403, { error: "local_only" }], [404, { error: "not_found" }], [200, undefined], [200, "<!doctype html>"], [200, {}],
    [200, { ...HALL, tonight: [{ ...HALL.tonight[0], score: -1 }] }], [200, { ...HALL, tonight: [{ ...HALL.tonight[0], hero: "" }] }], [200, { ...HALL, tonight: Array.from({ length: 11 }, () => HALL.tonight[0]) }],
    [200, { ...HALL, lastHour: "3" }], [200, { ...HALL, activity: { ...HALL.activity, fights: [1.5] } }], [200, { ...HALL, allTime: undefined }], [201, HALL],
  ];
  for (const [status, body] of notOne) expect(await answering(status, body).client.hall(), `${String(status)} ${String(JSON.stringify(body)).slice(0, 50)}`).toBeNull();
});
