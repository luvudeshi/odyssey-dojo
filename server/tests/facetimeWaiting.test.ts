// Answering a FaceTime call, the server's side, with no account: the agent's note (no file, an old one, a bad
// room name, a good one), the two read-only questions to LiveKit with a fake LiveKit, the route over real HTTP with
// the token it hands out, and that the route answers this machine only.
import { createHmac } from "node:crypto";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, describe, expect, test } from "vitest";
import { noteAfter } from "../../scripts/chert/room-note.mjs";
import { NO_AI } from "../ai/types";
import { createApp } from "../app";
import type { Config } from "../env";
import {
  CHERT_ROOM, DOCTOR_ROOM, LIST_PARTICIPANTS_PATH, LIST_ROOMS_PATH, NOTE_MAX_AGE_MS, WAITING_ROOM, findChertRoom, mintLookupToken, readRoomFile, readRoomNote, roomFilePath,
} from "../lib/chertWaitingRoom";
import type { LivekitConfig } from "../lib/facetimeEnv";
import { readToken } from "../lib/facetimeToken";
import { isOpenPath, isTunnelPath, mayAnswer } from "../lib/localOnly";
import { AGENT_IDENTITY, TOKEN_TTL_S, registerFaceTime } from "../routes/facetime";
import { NOT_ASKED, NO_LIVEKIT, NO_ROOM, lineNumber, registerFaceTimeWaiting } from "../routes/facetimeWaiting";

// Made-up values: none of these is a real key, room or number.
const ENV = { LIVEKIT_URL: "wss://rooms.example.test", LIVEKIT_API_KEY: "lk-test-key", LIVEKIT_API_SECRET: "lk-test-secret-not-real" };
const config: LivekitConfig = { livekitUrl: ENV.LIVEKIT_URL, livekitKey: ENV.LIVEKIT_API_KEY, livekitSecret: ENV.LIVEKIT_API_SECRET };
const NOW = Date.parse("2026-11-15T09:00:00.000Z");
const at = (msAgo: number): string => new Date(NOW - msAgo).toISOString();
const WARM = "chert-warm-uyAmfnCg0jjA";
const CALLER = "chert-bridge-0b9c2f6e";
const AGENT = { identity: "agent-AJ_madeup", kind: "AGENT" };
const READY = JSON.stringify({ chert_call: "0b9c2f6e", chert_bridge_ready: true, at: at(0) });
const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

interface FakeRoom { readonly name: string; readonly created: number; readonly metadata?: string; readonly people: readonly { identity: string; kind?: string | number }[] }

/** A LiveKit that knows these rooms. Every request is kept, and its token is checked against the secret. */
function fakeLivekit(rooms: readonly FakeRoom[], options: { roomsStatus?: number; peopleStatus?: number; down?: boolean } = {}) {
  const asked: { path: string; body: Record<string, unknown>; claims: Record<string, unknown> }[] = [];
  const fetcher = (url: string, init: RequestInit): Promise<Response> => {
    if (options.down === true) return Promise.reject(new TypeError("fetch failed"));
    const address = new URL(url);
    const token = String(new Headers(init.headers).get("Authorization")).replace(/^Bearer /, "");
    const [header, payload, signature] = token.split(".");
    // Checked by hand here, not with the code under test.
    expect(signature).toBe(createHmac("sha256", ENV.LIVEKIT_API_SECRET).update(`${header ?? ""}.${payload ?? ""}`).digest("base64url"));
    const claims = JSON.parse(Buffer.from(payload ?? "", "base64url").toString()) as Record<string, unknown>;
    const body = JSON.parse(typeof init.body === "string" ? init.body : "{}") as Record<string, unknown>;
    asked.push({ path: address.pathname, body, claims });
    expect(address.origin).toBe("https://rooms.example.test");
    expect(init.method).toBe("POST");
    if (address.pathname === LIST_ROOMS_PATH) {
      if (options.roomsStatus !== undefined) return Promise.resolve(json(options.roomsStatus, { msg: "refused" }));
      return Promise.resolve(json(200, { rooms: rooms.map((room) => ({ name: room.name, creation_time: String(room.created), metadata: room.metadata ?? "", num_participants: room.people.length })) }));
    }
    if (address.pathname === LIST_PARTICIPANTS_PATH) {
      if (options.peopleStatus !== undefined) return Promise.resolve(json(options.peopleStatus, { msg: "refused" }));
      const room = rooms.find((each) => each.name === body.room);
      return Promise.resolve(room ? json(200, { participants: room.people }) : json(404, { code: "not_found" }));
    }
    return Promise.resolve(json(500, { msg: "this test's LiveKit was asked something it should never be asked" }));
  };
  return { fetcher, asked };
}

describe("the agent's note", () => {
  test("a good note names the waiting room", () => {
    const text = JSON.stringify({ room: WARM, caller: null, ready: false, at: at(30_000) });
    expect(readRoomNote(text, NOW)).toEqual({ kind: "room", room: { room: WARM, caller: null, ready: false, source: "file", seated: false } });
    const call = JSON.stringify({ room: WARM, caller: CALLER, ready: true, at: at(1000) });
    expect(readRoomNote(call, NOW)).toEqual({ kind: "room", room: { room: WARM, caller: CALLER, ready: true, source: "file", seated: false } });
  });

  test("no file, a file that is not the note, and a note that says the room is over all name no room", async () => {
    expect(await readRoomFile("/nonexistent/room.json", NOW)).toEqual({ kind: "none", why: "missing" });
    expect(await readRoomFile("x", NOW, () => Promise.reject(new Error("EACCES")))).toEqual({ kind: "none", why: "missing" });
    for (const text of ["", "not json", "[]", "null", "\"chert-warm-x\"", "42"]) expect(readRoomNote(text, NOW), text).toEqual({ kind: "none", why: "unreadable" });
    expect(readRoomNote(JSON.stringify({ room: null, caller: null, ready: false, last: WARM, at: at(0) }), NOW)).toEqual({ kind: "none", why: "no_room" });
    expect(readRoomNote(JSON.stringify({ at: at(0) }), NOW)).toEqual({ kind: "none", why: "no_room" });
  });

  test("an old note is not believed: the room it names has been replaced or closed", () => {
    const note = (when: unknown): string => JSON.stringify({ room: WARM, caller: null, ready: false, at: when });
    expect(readRoomNote(note(at(NOTE_MAX_AGE_MS)), NOW).kind).toBe("room");
    expect(readRoomNote(note(at(NOTE_MAX_AGE_MS + 1)), NOW)).toEqual({ kind: "none", why: "stale" });
    expect(readRoomNote(note(at(24 * 3600_000)), NOW)).toEqual({ kind: "none", why: "stale" });
    // No time, a time that is not one, or one well in the future: not believed either.
    for (const when of [undefined, null, "", "yesterday", 1_800_000_000, at(-5 * 60_000)]) expect(readRoomNote(note(when), NOW), String(when)).toEqual({ kind: "none", why: "stale" });
    expect(readRoomNote(note(at(-30_000)), NOW).kind).toBe("room");
  });

  test("a room name that is not one of Chert's is refused before anything is signed for it", () => {
    const note = (room: unknown, caller: unknown = null): string => JSON.stringify({ room, caller, ready: false, at: at(0) });
    for (const room of [
      "odyssey-dojo-0123456789ab", "my-room", "chert-warm-", "chert-", "chert-warm-a b", "chert-warm-a/../b", "chert-warm-a\"b", ` ${WARM}`, `${WARM}\n`,
      `chert-warm-${"a".repeat(65)}`, 7, true, {}, [WARM],
    ]) expect(readRoomNote(note(room), NOW), String(room)).toEqual({ kind: "none", why: "bad_name" });
    // A room that is not a waiting room is only one of ours when a caller is in it.
    expect(readRoomNote(note("chert-doctor-AbCd1234"), NOW)).toEqual({ kind: "none", why: "bad_name" });
    expect(readRoomNote(note("chert-0b9c2f6e-7a41"), NOW)).toEqual({ kind: "none", why: "bad_name" });
    expect(readRoomNote(note("chert-0b9c2f6e-7a41", CALLER), NOW)).toMatchObject({ kind: "room", room: { room: "chert-0b9c2f6e-7a41", caller: CALLER } });
    // A caller that is not the FaceTime bridge is not a caller.
    expect(readRoomNote(note(WARM, "someone"), NOW)).toMatchObject({ kind: "room", room: { caller: null } });
    expect(readRoomNote(note("chert-0b9c2f6e-7a41", "someone"), NOW)).toEqual({ kind: "none", why: "bad_name" });
    expect(WAITING_ROOM.test(WARM) && CHERT_ROOM.test(WARM)).toBe(true);
  });

  test("the file is FACETIME_ROOM_FILE, or the agent's note in the Chert folder", () => {
    expect(roomFilePath({ FACETIME_ROOM_FILE: " /tmp/room.json " }, "/home/hero")).toBe("/tmp/room.json");
    expect(roomFilePath({}, "/home/hero")).toBe("/home/hero/.chert/odyssey-dojo-room.json");
    expect(roomFilePath({ FACETIME_ROOM_FILE: "  " }, "/home/hero")).toBe("/home/hero/.chert/odyssey-dojo-room.json");
  });
});

describe("what the agent writes (scripts/chert/room-note.mjs)", () => {
  test("a new waiting room is entered before the old one ends: the note still names the new one", () => {
    let note: unknown = null;
    note = noteAfter(note, { room: "chert-warm-OLD" }, NOW);
    note = noteAfter(note, { room: "chert-warm-NEW" }, NOW + 300_000);
    // The old room's job ends after the new one has begun. The first agent wrote "no room" here.
    note = noteAfter(note, { room: "chert-warm-OLD", over: true }, NOW + 301_000);
    expect(note).toMatchObject({ room: "chert-warm-NEW", caller: null, ready: false });
    expect(readRoomNote(JSON.stringify(note), NOW + 302_000)).toEqual({ kind: "room", room: { room: "chert-warm-NEW", caller: null, ready: false, source: "file", seated: false } });
  });

  test("during a call the next waiting room is entered too: the note names the call until it is over", () => {
    let note: unknown = noteAfter(null, { room: "chert-warm-CALL" }, NOW);
    note = noteAfter(note, { room: "chert-warm-CALL", caller: CALLER }, NOW + 1000);
    note = noteAfter(note, { room: "chert-warm-NEXT" }, NOW + 2000);
    expect(note).toMatchObject({ room: "chert-warm-CALL", caller: CALLER, ready: false });
    note = noteAfter(note, { room: "chert-warm-CALL", caller: CALLER, ready: true }, NOW + 4000);
    expect(readRoomNote(JSON.stringify(note), NOW + 5000)).toEqual({ kind: "room", room: { room: "chert-warm-CALL", caller: CALLER, ready: true, source: "file", seated: false } });
    note = noteAfter(note, { room: "chert-warm-CALL", over: true }, NOW + 60_000);
    expect(note).toMatchObject({ room: "chert-warm-NEXT", caller: null, ready: false });
  });

  test("the last room ending leaves no room, and a room nothing was written about for long is forgotten", () => {
    let note: unknown = noteAfter({ garbage: true }, { room: "chert-warm-ONE" }, NOW);
    note = noteAfter(note, { room: "chert-warm-ONE", over: true }, NOW + 1000);
    expect(note).toMatchObject({ room: null, last: "chert-warm-ONE", rooms: {} });
    expect(readRoomNote(JSON.stringify(note), NOW + 2000)).toEqual({ kind: "none", why: "no_room" });
    // A job that was killed never says its room is over.
    note = noteAfter(noteAfter(null, { room: "chert-warm-DEAD", caller: CALLER }, NOW), { room: "chert-warm-LIVE" }, NOW + 11 * 60_000);
    expect(note).toMatchObject({ room: "chert-warm-LIVE", rooms: { "chert-warm-LIVE": { caller: null } } });
    expect(Object.keys((note as { rooms: object }).rooms)).toEqual(["chert-warm-LIVE"]);
  });
});

describe("asking LiveKit", () => {
  test("the tokens for the two questions can only list: no seat, no room to join, a minute to live", () => {
    const claims = (token: string): Record<string, unknown> => JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString()) as Record<string, unknown>;
    const seconds = Math.floor(NOW / 1000);
    expect(claims(mintLookupToken(config, seconds))).toEqual({ iss: "lk-test-key", nbf: seconds - 10, exp: seconds + 60, video: { roomList: true } });
    expect(claims(mintLookupToken(config, seconds, WARM))).toEqual({ iss: "lk-test-key", nbf: seconds - 10, exp: seconds + 60, video: { roomAdmin: true, room: WARM } });
    expect(mintLookupToken(config, seconds)).not.toContain(ENV.LIVEKIT_API_SECRET);
  });

  test("the waiting room is the newest chert-warm room that has the agent in it", async () => {
    const livekit = fakeLivekit([
      { name: "chert-warm-OLD", created: 100, metadata: '{"chert_warm":true}', people: [AGENT] },
      { name: WARM, created: 400, metadata: '{"chert_warm":true}', people: [AGENT, { identity: "odyssey-dojo", kind: "STANDARD" }] },
      { name: "chert-warm-EMPTY", created: 500, people: [] },
      { name: "chert-warm-NOAGENT", created: 600, people: [{ identity: "odyssey-dojo" }] },
      { name: "chert-doctor-AbCd1234", created: 700, people: [AGENT] },
      { name: "odyssey-dojo-0123456789ab", created: 800, people: [AGENT] },
      { name: "someone-elses-room", created: 900, people: [AGENT] },
    ]);
    expect(await findChertRoom({ fetch: livekit.fetcher, now: () => NOW }, config)).toEqual({ ok: true, room: { room: WARM, caller: null, ready: false, source: "livekit", seated: false } });
    // Only reads, and only about Chert's call rooms: the game's own rooms, anyone else's and chert doctor's are not even looked into.
    expect([...new Set(livekit.asked.map((each) => each.path))].sort()).toEqual([LIST_PARTICIPANTS_PATH, LIST_ROOMS_PATH]);
    expect(livekit.asked.filter((each) => each.path === LIST_PARTICIPANTS_PATH).map((each) => each.body.room).sort()).toEqual(["chert-warm-EMPTY", "chert-warm-NOAGENT", "chert-warm-OLD", WARM].sort());
    for (const each of livekit.asked) {
      expect(each.claims.sub).toBeUndefined();
      expect(each.claims.video).toEqual(each.path === LIST_ROOMS_PATH ? { roomList: true } : { roomAdmin: true, room: each.body.room });
    }
  });

  test("a room with a caller comes first, whatever it is called, and says whether FaceTime is up", async () => {
    const rooms: FakeRoom[] = [
      { name: "chert-warm-NEXT", created: 900, people: [AGENT] },
      { name: WARM, created: 400, metadata: READY, people: [AGENT, { identity: CALLER, kind: "STANDARD" }] },
    ];
    expect(await findChertRoom({ fetch: fakeLivekit(rooms).fetcher, now: () => NOW }, config)).toEqual({ ok: true, room: { room: WARM, caller: CALLER, ready: true, source: "livekit", seated: false } });
    // A call that found no waiting room is put in chert-<operation id>.
    const cold: FakeRoom[] = [{ name: "chert-0b9c2f6e-7a41", created: 950, metadata: '{"chert_call":"0b9c2f6e"}', people: [{ identity: "agent-AJ_x", kind: 4 }, { identity: CALLER }] }];
    expect(await findChertRoom({ fetch: fakeLivekit(cold).fetcher, now: () => NOW }, config)).toEqual({ ok: true, room: { room: "chert-0b9c2f6e-7a41", caller: CALLER, ready: false, source: "livekit", seated: false } });
    // The same room with no caller yet is not waited in: only chert-warm rooms are.
    const early: FakeRoom[] = [{ name: "chert-0b9c2f6e-7a41", created: 950, people: [AGENT] }];
    expect(await findChertRoom({ fetch: fakeLivekit(early).fetcher, now: () => NOW }, config)).toEqual({ ok: true, room: null });
  });

  test("a chert doctor room is never named, even with the agent and a caller in it, by LiveKit or by the note", async () => {
    const doctor: FakeRoom[] = [{ name: "chert-doctor-AbCd1234", created: 950, metadata: READY, people: [AGENT, { identity: CALLER }] }];
    const livekit = fakeLivekit(doctor);
    expect(await findChertRoom({ fetch: livekit.fetcher, now: () => NOW }, config, AGENT_IDENTITY)).toEqual({ ok: true, room: null });
    expect(livekit.asked.map((each) => each.path)).toEqual([LIST_ROOMS_PATH]);
    // With a real waiting room beside it, that one is named.
    const both = fakeLivekit([...doctor, { name: WARM, created: 400, people: [AGENT] }]);
    expect(await findChertRoom({ fetch: both.fetcher, now: () => NOW }, config, AGENT_IDENTITY)).toMatchObject({ ok: true, room: { room: WARM, caller: null } });
    expect(DOCTOR_ROOM.test("chert-doctor-AbCd1234")).toBe(true);
    expect(DOCTOR_ROOM.test(WARM) || DOCTOR_ROOM.test("chert-0b9c2f6e-7a41")).toBe(false);
    expect(readRoomNote(JSON.stringify({ room: "chert-doctor-AbCd1234", caller: CALLER, ready: true, at: at(0) }), NOW)).toEqual({ kind: "none", why: "bad_name" });
  });

  test("a room the game is in already says so: a second window must not take the seat", async () => {
    const held: FakeRoom[] = [{ name: WARM, created: 400, people: [AGENT, { identity: AGENT_IDENTITY, kind: "STANDARD" }] }];
    expect(await findChertRoom({ fetch: fakeLivekit(held).fetcher, now: () => NOW }, config, AGENT_IDENTITY)).toEqual({ ok: true, room: { room: WARM, caller: null, ready: false, source: "livekit", seated: true } });
    // On a call too: the game and the caller are both in the room.
    const onCall: FakeRoom[] = [{ name: WARM, created: 400, metadata: READY, people: [AGENT, { identity: AGENT_IDENTITY }, { identity: CALLER }] }];
    expect(await findChertRoom({ fetch: fakeLivekit(onCall).fetcher, now: () => NOW }, config, AGENT_IDENTITY)).toEqual({ ok: true, room: { room: WARM, caller: CALLER, ready: true, source: "livekit", seated: true } });
    // The agent and the caller are not the game.
    const free: FakeRoom[] = [{ name: WARM, created: 400, people: [AGENT, { identity: CALLER }] }];
    expect(await findChertRoom({ fetch: fakeLivekit(free).fetcher, now: () => NOW }, config, AGENT_IDENTITY)).toMatchObject({ ok: true, room: { seated: false } });
  });

  test("no room at all is an answer; LiveKit refusing or not answering is not", async () => {
    expect(await findChertRoom({ fetch: fakeLivekit([]).fetcher, now: () => NOW }, config)).toEqual({ ok: true, room: null });
    expect(await findChertRoom({ fetch: fakeLivekit([], { roomsStatus: 401 }).fetcher, now: () => NOW }, config)).toEqual({ ok: false, why: "service", status: 401 });
    expect(await findChertRoom({ fetch: fakeLivekit([], { down: true }).fetcher, now: () => NOW }, config)).toEqual({ ok: false, why: "network", status: 0 });
    const warm: FakeRoom[] = [{ name: WARM, created: 1, people: [AGENT] }];
    expect(await findChertRoom({ fetch: fakeLivekit(warm, { peopleStatus: 500 }).fetcher, now: () => NOW }, config)).toEqual({ ok: false, why: "service", status: 500 });
    // A room that closed between the two questions is simply not there.
    expect(await findChertRoom({ fetch: fakeLivekit(warm, { peopleStatus: 404 }).fetcher, now: () => NOW }, config)).toEqual({ ok: true, room: null });
    expect(await findChertRoom({ fetch: fakeLivekit(warm).fetcher, now: () => NOW }, { ...config, livekitUrl: "not a url" })).toEqual({ ok: false, why: "service", status: 0 });
  });
});

describe("GET /api/facetime/waiting", () => {
  let server: Server | null = null;
  afterEach(() => { server?.close(); server?.closeAllConnections(); server = null; });

  async function serve(options: { env?: Record<string, string | undefined>; rooms?: readonly FakeRoom[]; livekit?: Parameters<typeof fakeLivekit>[1]; note?: string | null } = {}) {
    const livekit = fakeLivekit(options.rooms ?? [], options.livekit);
    const app = express();
    app.use(express.json());
    const router = express.Router();
    const deps = { env: () => options.env ?? ENV, fetch: livekit.fetcher, now: () => NOW };
    registerFaceTime(router, deps);
    registerFaceTimeWaiting(router, { ...deps, readFile: () => (options.note === null || options.note === undefined ? Promise.reject(new Error("ENOENT")) : Promise.resolve(options.note)) });
    app.use(router);
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
    return { livekit, get: () => fetch(`${base}/api/facetime/waiting`), base };
  }

  test("with a waiting room: the room, and a token for the game's seat in that room and nothing more", async () => {
    const { get, livekit } = await serve({ rooms: [{ name: WARM, created: 400, people: [AGENT] }] });
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json() as Record<string, unknown>;
    expect(body).toEqual({ url: ENV.LIVEKIT_URL, token: expect.any(String) as string, room: WARM, identity: AGENT_IDENTITY, caller: null, ready: false, seated: false, line: null, source: "livekit" });
    // Join, publish and subscribe in this one room, for ten minutes. No right to list, make, change or close a room.
    const seconds = Math.floor(NOW / 1000);
    expect(readToken(String(body.token), ENV.LIVEKIT_API_SECRET)).toEqual({
      iss: "lk-test-key", sub: "odyssey-dojo", jti: "odyssey-dojo", name: "Odyssey Dojo", nbf: seconds - 10, exp: seconds + TOKEN_TTL_S,
      video: { room: WARM, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true },
    });
    expect(JSON.stringify(body)).not.toContain(ENV.LIVEKIT_API_SECRET);
    expect(JSON.stringify(body)).not.toContain(ENV.LIVEKIT_API_KEY);
    // Nothing but the two lists was asked of LiveKit: the room is never made, changed or closed from here.
    expect(livekit.asked.map((each) => each.path)).toEqual([LIST_ROOMS_PATH, LIST_PARTICIPANTS_PATH]);
  });

  test("a call that is coming in says who and whether FaceTime is up", async () => {
    const { get } = await serve({ rooms: [{ name: WARM, created: 400, metadata: READY, people: [AGENT, { identity: CALLER }] }, { name: "chert-warm-NEXT", created: 500, people: [AGENT] }] });
    expect(await (await get()).json()).toMatchObject({ room: WARM, caller: CALLER, ready: true });
  });

  test("a room a window of the game is in already is still named, and marked as held", async () => {
    const { get } = await serve({ rooms: [{ name: WARM, created: 400, people: [AGENT, { identity: AGENT_IDENTITY }] }] });
    expect(await (await get()).json()).toMatchObject({ room: WARM, seated: true });
    server?.close();
    // The note cannot know who is in the room.
    const fromNote = await serve({ livekit: { down: true }, note: JSON.stringify({ room: WARM, caller: null, ready: false, at: at(0) }) });
    expect(await (await fromNote.get()).json()).toMatchObject({ room: WARM, seated: false, source: "file" });
  });

  test("with no room: null and a plain reason, and no token", async () => {
    const none = await (await (await serve()).get()).json() as Record<string, unknown>;
    expect(none).toEqual({ room: null, reason: NO_ROOM, line: null });
    expect(NO_ROOM).toContain("chert dev");
    server?.close();
    const unset = await serve({ env: { LIVEKIT_URL: ENV.LIVEKIT_URL } });
    expect(await (await unset.get()).json()).toEqual({ room: null, reason: NO_LIVEKIT, line: null });
    expect(unset.livekit.asked).toEqual([]);
  });

  test("when LiveKit cannot be asked the agent's note is used, if it is a good one", async () => {
    const good = JSON.stringify({ room: WARM, caller: null, ready: false, at: at(20_000) });
    const fromNote = await serve({ livekit: { down: true }, note: good });
    const body = await (await fromNote.get()).json() as Record<string, unknown>;
    expect(body).toMatchObject({ room: WARM, caller: null, ready: false, source: "file" });
    expect(readToken(String(body.token), ENV.LIVEKIT_API_SECRET)?.video.room).toBe(WARM);
    server?.close();
    for (const note of [null, JSON.stringify({ room: WARM, at: at(NOTE_MAX_AGE_MS + 1) }), JSON.stringify({ room: "odyssey-dojo-0123456789ab", at: at(0) }), JSON.stringify({ room: null, last: WARM, at: at(0) })]) {
      const refused = await serve({ livekit: { down: true }, note });
      const response = await refused.get();
      expect(response.status, String(note)).toBe(502);
      expect(await response.json()).toEqual({ error: "network", message: NOT_ASKED, line: null });
      server?.close();
    }
  });

  test("when LiveKit answers, the note is not read at all: an old or wrong note cannot mislead", async () => {
    const wrong = JSON.stringify({ room: "chert-warm-WRONG", caller: null, ready: false, at: at(0) });
    const { get } = await serve({ rooms: [{ name: WARM, created: 400, people: [AGENT] }], note: wrong });
    expect(await (await get()).json()).toMatchObject({ room: WARM, source: "livekit" });
    server?.close();
    expect(await (await (await serve({ note: wrong })).get()).json()).toEqual({ room: null, reason: NO_ROOM, line: null });
  });

  test("the number to call comes from FACETIME_LINE_NUMBER, with or without a room, and is null when unset", async () => {
    const withRoom = await serve({ env: { ...ENV, FACETIME_LINE_NUMBER: " +1 555 555 0100 " }, rooms: [{ name: WARM, created: 400, people: [AGENT] }] });
    expect(await (await withRoom.get()).json()).toMatchObject({ room: WARM, line: "+1 555 555 0100" });
    server?.close();
    expect(await (await (await serve({ env: { ...ENV, FACETIME_LINE_NUMBER: "+1 555 555 0100" } })).get()).json()).toEqual({ room: null, reason: NO_ROOM, line: "+1 555 555 0100" });
    expect(lineNumber({})).toBeNull();
    expect(lineNumber({ FACETIME_LINE_NUMBER: "  " })).toBeNull();
    expect(lineNumber({ FACETIME_LINE_NUMBER: "line@example.test" })).toBe("line@example.test");
    // Shown on the card, so nothing that is not a number or an address.
    expect(lineNumber({ FACETIME_LINE_NUMBER: "<b>+1 555</b>" })).toBeNull();
    expect(lineNumber({ FACETIME_LINE_NUMBER: "9".repeat(65) })).toBeNull();
  });

  test("the other FaceTime routes are as they were: status does not change, and hang up refuses Chert's room", async () => {
    const { base, livekit } = await serve({ rooms: [{ name: WARM, created: 400, people: [AGENT] }] });
    expect(await (await fetch(`${base}/api/facetime/status`)).json()).toEqual({ ready: false, missing: ["CHERT_API_KEY", "CHERT_PROJECT_ID", "CHERT_LINE_ID"], standIn: true });
    const hangUp = await fetch(`${base}/api/facetime/hangup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ room: WARM }) });
    expect(hangUp.status).toBe(400);
    expect(livekit.asked).toEqual([]);
  });
});

describe("this machine only", () => {
  const PATH = "/api/facetime/waiting";
  const appConfig: Config = {
    port: 0, geminiKey: null, elevenLabsKey: null, dataDir: "/nonexistent", publicBaseUrl: null, distDir: "/nonexistent",
    timeouts: { levelMs: 80, revealMs: 80, portraitMs: 80, speechMs: 80 },
  };
  let close: (() => void) | null = null;
  afterEach(() => { close?.(); close = null; });

  test("the route is not open to the network or to a tunnel, in any case or with a trailing slash", () => {
    for (const each of [PATH, PATH.toUpperCase(), `${PATH}/`]) {
      expect(isOpenPath(each.toLowerCase()), each).toBe(false);
      expect(isTunnelPath(each.toLowerCase()), each).toBe(false);
      expect(mayAnswer(each, "192.168.1.20"), each).toBe(false);
      expect(mayAnswer(each, undefined), each).toBe(false);
      expect(mayAnswer(each, "127.0.0.1", { "x-forwarded-for": "127.0.0.1" }), each).toBe(false);
      expect(mayAnswer(each, "127.0.0.1"), each).toBe(true);
    }
  });

  test("the real app mounts it and refuses it to a request that was passed on", async () => {
    const app = await createApp({ config: appConfig, ai: NO_AI });
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    close = () => { server.close(); server.closeAllConnections(); };
    const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
    for (const [name, value] of [["X-Forwarded-For", "203.0.113.9"], ["Cf-Connecting-Ip", "203.0.113.9"], ["Via", "1.1 tunnel"], ["Forwarded", "for=203.0.113.9"]] as const) {
      const response = await fetch(`${base}${PATH}`, { headers: { [name]: value } });
      expect(response.status, name).toBe(403);
      expect(await response.json()).toEqual({ error: "local_only" });
    }
    // Mounted: a path the app does not know answers 404 from this machine, and this one must not.
    const saved = { url: process.env.LIVEKIT_URL, key: process.env.LIVEKIT_API_KEY, secret: process.env.LIVEKIT_API_SECRET };
    delete process.env.LIVEKIT_URL;
    delete process.env.LIVEKIT_API_KEY;
    delete process.env.LIVEKIT_API_SECRET;
    try {
      const local = await fetch(`${base}${PATH}`);
      expect(local.status).toBe(200);
      expect(await local.json()).toMatchObject({ room: null, reason: NO_LIVEKIT });
    } finally {
      if (saved.url !== undefined) process.env.LIVEKIT_URL = saved.url;
      if (saved.key !== undefined) process.env.LIVEKIT_API_KEY = saved.key;
      if (saved.secret !== undefined) process.env.LIVEKIT_API_SECRET = saved.secret;
    }
  });
});
