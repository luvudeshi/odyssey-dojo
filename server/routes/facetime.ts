// The FaceTime call's server side. Only this machine may call these (they are not open paths in lib/localOnly),
// because they spend the call service's minutes.
//   GET  /api/facetime/status     is FaceTime set up, which settings are missing (names only), and whether a
//                                 stand-in friend is possible (the room's three settings are there)
//   POST /api/facetime/seat       a new room, and a token for the game's own seat in it
//   POST /api/facetime/call       { to, room }: rings the phone and bridges the call into that room
//   POST /api/facetime/standin    { room }: no phone and no call service; a token for the bridge's seat in that
//                                 room, for the stand-in page (tools/facetime/standin.html) on this machine
//   GET  /api/facetime/call/:id   how the call is doing
//   POST /api/facetime/hangup     { room }: closes a room this server made, which drops the bridge (and so the
//                                 phone's side) for certain. Leaving the room does not do that.
// A POST must say Content-Type: application/json, or it is refused (415): a page of another site open in the same
// browser can send a form or plain text here without asking, but not JSON.
// The keys are read from the environment on every request, so adding them to .env.local needs only a restart, and
// they go nowhere but into a signed token (the LiveKit secret) and to the call service (its own key).
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { Router } from "express";
import { log } from "../../src/core/log";
import { normalizePhone } from "../../src/facetime/phone";
import type { Register } from "../app";
import { loadEnvFile } from "../lib/envFile";
import { CHERT_MESSAGES, callState, placeCall } from "../lib/facetimeChert";
import { NOT_SET_UP, readFaceTimeEnv, readLivekitEnv } from "../lib/facetimeEnv";
import { deleteRoom } from "../lib/facetimeRooms";
import { mintToken } from "../lib/facetimeToken";

/** The game's identity in every call room, and the bridge's. */
export const AGENT_IDENTITY = "odyssey-dojo";
export const BRIDGE_IDENTITY = "facetime-bridge";
/** A trial call lasts five minutes; a token to join is good for ten. */
export const TOKEN_TTL_S = 600;
const MAX_SEATS = 50;
/** A room that was used is remembered this long, so it can be closed: a token's ten minutes, a call's five, and slack. */
export const ROOM_MEMORY_S = 1800;
const MAX_USED = 200;
const HANGUP_FAILED = "The call's room could not be closed. It closes by itself once everyone has left.";
const ROOM = /^odyssey-dojo-[0-9a-f]{12}$/;

export interface FaceTimeRouteDeps {
  readonly env: () => Readonly<Record<string, string | undefined>>;
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>;
  /** Milliseconds since 1970. */
  readonly now: () => number;
  /** Waits before the one retry of closing a room. A timer by default. */
  readonly wait?: (ms: number) => Promise<void>;
}

export function registerFaceTime(router: Router, deps: FaceTimeRouteDeps): void {
  /** Rooms this server made, and when: a call or a stand-in friend is only let into one of them, once. */
  const seats = new Map<string, number>();
  /** Rooms a call or a stand-in went into, and when: the only rooms hang up will close. */
  const used = new Map<string, number>();
  const remember = (room: string): void => {
    const now = deps.now();
    for (const [each, at] of used) if (now - at > ROOM_MEMORY_S * 1000) used.delete(each);
    // Oldest first: a Map keeps the order things were put in.
    while (used.size >= MAX_USED) {
      const oldest = used.keys().next();
      if (oldest.done === true) break;
      used.delete(oldest.value);
    }
    used.set(room, now);
  };
  const wait = deps.wait ?? ((ms: number): Promise<void> => new Promise((done) => { setTimeout(done, ms); }));
  const setup = (): ReturnType<typeof readFaceTimeEnv> => readFaceTimeEnv(deps.env());
  const missing = (): readonly string[] => { const found = setup(); return found.ready ? [] : found.missing; };

  router.use("/api/facetime", (request, response, next) => {
    const type = (request.headers["content-type"] ?? "").split(";")[0]?.trim().toLowerCase();
    if (request.method === "POST" && type !== "application/json") {
      response.status(415).json({ error: "service", message: "Send JSON." });
      return;
    }
    next();
  });

  router.get("/api/facetime/status", (_request, response) => {
    // standIn: the room can be joined, so a browser can play the friend. True with or without the call service.
    response.json({ ready: setup().ready, missing: missing(), standIn: readLivekitEnv(deps.env()).ready });
  });

  router.post("/api/facetime/seat", (_request, response) => {
    // A seat needs the room's settings only, so a stand-in call can open one. Ringing a phone still needs all six.
    const found = readLivekitEnv(deps.env());
    if (!found.ready) {
      response.status(503).json({ error: "not_set_up", message: NOT_SET_UP, missing: missing() });
      return;
    }
    const now = deps.now();
    for (const [room, at] of seats) if (now - at > TOKEN_TTL_S * 1000) seats.delete(room);
    if (seats.size >= MAX_SEATS) {
      response.status(429).json({ error: "service", message: "Too many calls were started. Wait a few minutes." });
      return;
    }
    const room = `odyssey-dojo-${randomBytes(6).toString("hex")}`;
    seats.set(room, now);
    const { config } = found;
    const token = mintToken({
      apiKey: config.livekitKey, apiSecret: config.livekitSecret, identity: AGENT_IDENTITY, name: "Odyssey Dojo",
      room, ttlSeconds: TOKEN_TTL_S, nowSeconds: Math.floor(now / 1000),
    });
    response.json({ url: config.livekitUrl, token, room, identity: AGENT_IDENTITY });
  });

  router.post("/api/facetime/call", async (request, response) => {
    const found = setup();
    if (!found.ready) {
      response.status(503).json({ error: "not_set_up", message: NOT_SET_UP, missing: found.missing });
      return;
    }
    const body: unknown = request.body;
    const fields = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
    const phone = normalizePhone(typeof fields.to === "string" ? fields.to : "");
    if (!phone.ok) {
      response.status(400).json({ error: "bad_number", message: phone.why });
      return;
    }
    const room = typeof fields.room === "string" ? fields.room : "";
    if (!ROOM.test(room) || !seats.has(room)) {
      response.status(400).json({ error: "service", message: "That call room is not known. Start the call again." });
      return;
    }
    // One call per room: a second press of the button must not ring the phone twice.
    seats.delete(room);
    remember(room);
    const { config } = found;
    const bridgeToken = mintToken({
      apiKey: config.livekitKey, apiSecret: config.livekitSecret, identity: BRIDGE_IDENTITY, name: "FaceTime",
      room, ttlSeconds: TOKEN_TTL_S, nowSeconds: Math.floor(deps.now() / 1000),
    });
    const placed = await placeCall(deps.fetch, config, { to: phone.e164, bridgeToken, agentIdentity: AGENT_IDENTITY, idempotencyKey: `odyssey-dojo-${randomUUID()}` });
    if (!placed.ok) {
      // The status only: nothing Chert sent back, and never the number or a key.
      log("warn", "facetime_call_refused", { why: placed.why, status: placed.status });
      response.status(placed.why === "network" ? 502 : placed.why === "line_busy" ? 409 : 400).json({ error: placed.why, message: CHERT_MESSAGES[placed.why] });
      return;
    }
    log("info", "facetime_call_placed", { queued: placed.queued });
    response.status(placed.queued ? 202 : 200).json({ callId: placed.callId, queued: placed.queued });
  });

  router.post("/api/facetime/standin", (request, response) => {
    const found = readLivekitEnv(deps.env());
    if (!found.ready) {
      response.status(503).json({ error: "not_set_up", message: NOT_SET_UP, missing: found.missing });
      return;
    }
    const body: unknown = request.body;
    const fields = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
    const room = typeof fields.room === "string" ? fields.room : "";
    if (!ROOM.test(room) || !seats.has(room)) {
      response.status(400).json({ error: "service", message: "That call room is not known. Start the test again." });
      return;
    }
    // The same rule as a call: one friend per room, phone or stand-in, and never both.
    seats.delete(room);
    remember(room);
    const { config } = found;
    const token = mintToken({
      apiKey: config.livekitKey, apiSecret: config.livekitSecret, identity: BRIDGE_IDENTITY, name: "Stand-in friend",
      room, ttlSeconds: TOKEN_TTL_S, nowSeconds: Math.floor(deps.now() / 1000),
    });
    // Nothing is sent to the call service: deps.fetch is not touched here.
    log("info", "facetime_standin_opened", {});
    response.json({ url: config.livekitUrl, token, room, identity: BRIDGE_IDENTITY });
  });

  router.post("/api/facetime/hangup", async (request, response) => {
    const found = readLivekitEnv(deps.env());
    if (!found.ready) {
      response.status(503).json({ error: "not_set_up", message: NOT_SET_UP, missing: found.missing });
      return;
    }
    const body: unknown = request.body;
    const fields = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
    const room = typeof fields.room === "string" ? fields.room : "";
    const at = ROOM.test(room) ? used.get(room) : undefined;
    // Only a room a call or a stand-in went into here, and only while it could still be open.
    if (at === undefined || deps.now() - at > ROOM_MEMORY_S * 1000) {
      response.status(400).json({ error: "service", message: "That call room is not known." });
      return;
    }
    // The room stays remembered: a second hang up (the page closing just after) is answered the same way.
    const closed = await deleteRoom({ fetch: deps.fetch, now: deps.now, wait }, found.config, room);
    if (!closed.ok) {
      // The status only: nothing LiveKit sent back, and never the token.
      log("warn", "facetime_room_not_closed", { why: closed.why, status: closed.status });
      response.status(502).json({ error: closed.why, message: HANGUP_FAILED });
      return;
    }
    log("info", "facetime_room_closed", { room: closed.room, tries: closed.tries });
    response.json({ room: closed.room });
  });

  router.get("/api/facetime/call/:id", async (request, response) => {
    const found = setup();
    if (!found.ready) {
      response.status(503).json({ error: "not_set_up", message: NOT_SET_UP, missing: found.missing });
      return;
    }
    const id = request.params.id;
    if (!/^[\w-]{1,100}$/.test(id)) {
      response.status(400).json({ error: "service", message: "That is not a call id." });
      return;
    }
    response.json(await callState(deps.fetch, found.config, id));
  });
}

export const register: Register = (router, { config }) => {
  // The call service's guide keeps the LiveKit settings in .env.local; the rest of the server reads .env.
  // Both are read (values already set win), from the folder above server/data.
  loadEnvFile(resolve(config.dataDir, "../..", ".env.local"));
  registerFaceTime(router, { env: () => process.env, fetch: (url, init) => fetch(url, init), now: () => Date.now() });
};
