// Answering a FaceTime call: where the game must be for a call to the Chert line to reach it.
//   GET /api/facetime/waiting   the room `chert dev` keeps ready for the next call (or the room of a call that is
//                               coming in), and a token for the game's own seat in it; { room: null, reason } when
//                               there is none. `line` is the number to call, when FACETIME_LINE_NUMBER is set.
// This machine only, like every FaceTime route (it is not an open path in lib/localOnly): the token is a seat in
// the call's room. Nothing here rings a phone, spends a minute, or makes, changes or deletes a room.
// The room is Chert's. The game joins it and leaves it; it never closes it (POST /api/facetime/hangup refuses it).
import { resolve } from "node:path";
import type { Router } from "express";
import { log } from "../../src/core/log";
import type { Register } from "../app";
import { findChertRoom, readRoomFile, roomFilePath } from "../lib/chertWaitingRoom";
import type { WaitingRoom } from "../lib/chertWaitingRoom";
import { loadEnvFile } from "../lib/envFile";
import { readLivekitEnv } from "../lib/facetimeEnv";
import { mintToken } from "../lib/facetimeToken";
import { AGENT_IDENTITY, TOKEN_TTL_S } from "./facetime";

export const NO_LIVEKIT = "The room's settings are missing on this server: LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET.";
export const NO_ROOM = "No call can come in yet. Check that chert dev and the game's agent are both running on this computer.";
export const NOT_ASKED = "The call's room could not be looked up. Check the internet connection.";
/** The line's number is shown on the card, so it is kept to what a number or an address is made of. */
const LINE = /^[\w+@.()\- ]{3,64}$/;

export interface FaceTimeWaitingDeps {
  readonly env: () => Readonly<Record<string, string | undefined>>;
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>;
  /** Milliseconds since 1970. */
  readonly now: () => number;
  /** Reads the agent's note. The real file by default. */
  readonly readFile?: (path: string) => Promise<string>;
}

/** The number a friend calls, from FACETIME_LINE_NUMBER. Null when it is not set: the card then says "your Chert line". */
export function lineNumber(env: Readonly<Record<string, string | undefined>>): string | null {
  const set = env.FACETIME_LINE_NUMBER?.trim() ?? "";
  return LINE.test(set) ? set : null;
}

export function registerFaceTimeWaiting(router: Router, deps: FaceTimeWaitingDeps): void {
  router.get("/api/facetime/waiting", async (_request, response) => {
    // The answer holds a token: never kept by anything between the server and the page.
    response.set("Cache-Control", "no-store");
    const env = deps.env();
    const line = lineNumber(env);
    const found = readLivekitEnv(env);
    if (!found.ready) {
      response.json({ room: null, reason: NO_LIVEKIT, line });
      return;
    }
    const { config } = found;
    const looked = await findChertRoom({ fetch: deps.fetch, now: deps.now }, config);
    let room: WaitingRoom | null;
    if (looked.ok) room = looked.room;
    else {
      // LiveKit could not be asked: the agent's note is the second word, when it names a room and is not old.
      const noted = await readRoomFile(roomFilePath(env), deps.now(), deps.readFile);
      if (noted.kind !== "room") {
        // The status only: nothing LiveKit sent back, and never the token.
        log("warn", "facetime_waiting_not_asked", { why: looked.why, status: looked.status, note: noted.why });
        response.status(502).json({ error: looked.why, message: NOT_ASKED, line });
        return;
      }
      room = noted.room;
    }
    if (room === null) {
      response.json({ room: null, reason: NO_ROOM, line });
      return;
    }
    const token = mintToken({
      apiKey: config.livekitKey, apiSecret: config.livekitSecret, identity: AGENT_IDENTITY, name: "Odyssey Dojo",
      room: room.room, ttlSeconds: TOKEN_TTL_S, nowSeconds: Math.floor(deps.now() / 1000),
    });
    response.json({ url: config.livekitUrl, token, room: room.room, identity: AGENT_IDENTITY, caller: room.caller, ready: room.ready, line, source: room.source });
  });
}

export const register: Register = (router, { config }) => {
  // The same two files the other FaceTime routes read (values already set win).
  loadEnvFile(resolve(config.dataDir, "../..", ".env.local"));
  registerFaceTimeWaiting(router, { env: () => process.env, fetch: (url, init) => fetch(url, init), now: () => Date.now() });
};
