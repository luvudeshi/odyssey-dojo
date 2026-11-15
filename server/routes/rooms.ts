// Online rooms over plain HTTP: create, join, an event stream that pushes the other member's messages, and send.
// The rooms and their rules live in ../lib/rooms and the limits in ../lib/roomLimits; this file only turns them into requests and answers.
import express from "express";
import type { Request, RequestHandler, Response } from "express";
import { log } from "../../src/core/log";
import type { Register } from "../app";
import {
  MAX_ROOMS_PER_CLIENT, MAX_STREAM_BACKLOG_BYTES, ROOMS_KEPT_FOR_THIS_MACHINE, SEND_ENVELOPE_BYTES, SMALL_BODY_BYTES, STREAMS_RETRY_S,
  THIS_MACHINE, clientKey, createRoomLimits,
} from "../lib/roomLimits";
import { MAX_MESSAGE_BYTES, MAX_ROOMS, POLL_HOLD_MS, createRoomStore, isRelayMessage, peerEvent } from "../lib/rooms";
import type { Refusal, RelayMessage } from "../lib/rooms";

/**
 * A "beat" this often keeps proxies and browsers from closing a quiet stream, and tells the page its stream is alive:
 * a page that stops getting beats knows the stream died without a word and polls instead (STREAM_QUIET_MS in
 * src/net/transport.ts, which must stay well above this). It is a comment line for readers that only want the
 * stream kept open, and a data line with no number for the page. It is the server talking, not a player, so it
 * does not count as use of the room.
 */
export const HEARTBEAT_MS = 5_000;
const BEAT = `: keep\ndata: ${JSON.stringify({ type: "beat" })}\n\n`;
const STREAM_HEADERS = { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" };

function refuse(response: Response, refusal: Refusal): void {
  if (refusal === "unknown") response.status(404).json({ error: "unknown_room" });
  else response.status(401).json({ error: "bad_token" });
}

function slowDown(response: Response, seconds: number): void {
  response.status(429).set("Retry-After", String(seconds)).json({ error: "too_many_requests" });
}

function tooLarge(response: Response): void {
  response.status(413).json({ error: "too_large" });
}

/**
 * Reads a JSON body of at most `limit` bytes. The app's own parser skips these routes (see ../app), so nothing
 * larger is ever held. A body that says it is too long is refused before any of it is read. One that does not say
 * is thrown away as it arrives once it passes the limit, and the 413 is written when it ends; a body that never
 * ends is closed by the server's request timeout (REQUEST_TIMEOUT_MS).
 */
function body(limit: number): RequestHandler {
  const parse = express.json({ limit });
  return (request, response, next) => {
    if (Number(request.headers["content-length"] ?? 0) > limit) {
      tooLarge(response);
      return;
    }
    parse(request, response, (error?: unknown) => {
      if (error === undefined) next();
      else if (typeof error === "object" && error !== null && "status" in error && error.status === 413) tooLarge(response);
      else response.status(400).json({ error: "bad_request" });
    });
  };
}

export const register: Register = (router) => {
  const rooms = createRoomStore();
  const limits = createRoomLimits();
  const client = (request: Request): string => clientKey(request.socket.remoteAddress, request.headers);
  /**
   * Answers a wrong code or token on a send or a stream. Once a client has had too many it gets 429 for both,
   * so trying codes there tells a stranger nothing more. A member with the right token never comes through here.
   */
  const refuseCounted = (response: Response, who: string, refusal: Refusal): void => {
    const wait = limits.wrongWait(who, "member");
    if (wait > 0) {
      slowDown(response, wait);
      return;
    }
    limits.wrongCount(who, "member");
    refuse(response, refusal);
  };

  router.post(["/api/rooms", "/api/rooms/:code/join"], body(SMALL_BODY_BYTES));
  router.post("/api/rooms/:code/send", body(MAX_MESSAGE_BYTES + SEND_ENVELOPE_BYTES));

  router.post("/api/rooms", (request, response) => {
    const who = client(request);
    let wait = limits.create(who);
    // A caller at its cap gets the place of a room it left behind: there is no call that closes a room.
    if (wait === 0 && who !== THIS_MACHINE && rooms.heldBy(who) >= MAX_ROOMS_PER_CLIENT) wait = rooms.freeOne(who);
    if (wait > 0) {
      slowDown(response, wait);
      return;
    }
    // Other callers stop short of the cap, so they can never take the last rooms from the laptop that runs the server.
    const kept = who === THIS_MACHINE ? 0 : ROOMS_KEPT_FOR_THIS_MACHINE;
    const room = rooms.size() - rooms.heldBy(THIS_MACHINE) >= MAX_ROOMS - kept ? null : rooms.create(who);
    if (room === null) {
      log("warn", "rooms_at_cap", { rooms: rooms.size() });
      response.status(503).json({ error: "too_many_rooms" });
      return;
    }
    log("info", "room_created", { code: room.code, rooms: rooms.size() });
    response.json(room);
  });

  router.post("/api/rooms/:code/join", (request, response) => {
    const who = client(request);
    // Asked before the room is looked up: past the limit a right code is refused like a wrong one.
    const wait = limits.wrongWait(who, "join");
    if (wait > 0) {
      slowDown(response, wait);
      return;
    }
    const joined = rooms.join(request.params.code);
    if (joined === "unknown") {
      limits.wrongCount(who, "join");
      refuse(response, joined);
    } else if (joined === "full") response.status(409).json({ error: "room_full" });
    else response.json(joined);
  });

  router.get("/api/rooms/:code/events", (request, response) => {
    const who = client(request);
    const token = typeof request.query.token === "string" ? request.query.token : "";
    const release = limits.openStream(who, `${request.params.code.toUpperCase()} ${token}`);
    if (release === null) {
      slowDown(response, STREAMS_RETRY_S);
      return;
    }
    // A stream that has ended is never written to again: that would raise an error nobody handles.
    // A reader that has stopped reading is cut off, or every message sent to it would be held here until it hung up.
    const write = (text: string): void => {
      if (response.writableEnded || response.destroyed) return;
      if (response.writableLength > MAX_STREAM_BACKLOG_BYTES) response.destroy();
      else response.write(text);
    };
    // A numbered message carries its number as the event id; the opening line below has none.
    const push = (message: RelayMessage, seq?: number): void => {
      write(`${seq === undefined ? "" : `id: ${String(seq)}\n`}data: ${JSON.stringify(message)}\n\n`);
    };
    const attached = rooms.attach(request.params.code, token, {
      message: push,
      end: () => { response.end(); },
    });
    if (typeof attached === "string") {
      release();
      refuseCounted(response, who, attached);
      return;
    }
    response.status(200).set(STREAM_HEADERS);
    response.flushHeaders();
    // Every stream opens with where the other member stands, so a client never has to guess.
    push(peerEvent(attached.peerJoined));
    const heartbeat = setInterval(() => {
      rooms.sweep();
      write(BEAT);
    }, HEARTBEAT_MS);
    response.on("close", () => {
      clearInterval(heartbeat);
      attached.detach();
      release();
    });
  });

  /**
   * The same messages as the event stream, for a client the stream does not reach (a Cloudflare quick tunnel holds
   * the whole answer back). Answers at once with the messages after `after`, or holds the request until one arrives
   * or POLL_HOLD_MS passes. A client that hangs up, and a room that is removed, end the request and its timer.
   */
  router.get("/api/rooms/:code/poll", (request, response) => {
    const who = client(request);
    const token = typeof request.query.token === "string" ? request.query.token : "";
    const asked = request.query.after;
    if (asked !== undefined && (typeof asked !== "string" || !/^\d{1,15}$/.test(asked))) {
      response.status(400).json({ error: "bad_request" });
      return;
    }
    const wait = limits.poll(who);
    if (wait > 0) {
      slowDown(response, wait);
      return;
    }
    const polling = rooms.poll(request.params.code, token, Number(asked ?? 0), (result) => {
      if (!response.writableEnded) response.set("Cache-Control", "no-store").json(result);
    });
    if (typeof polling === "string") {
      refuseCounted(response, who, polling);
      return;
    }
    const timer = setTimeout(() => {
      rooms.sweep();
      polling.stop(true);
    }, POLL_HOLD_MS);
    response.on("close", () => {
      clearTimeout(timer);
      polling.stop(false);
    });
  });

  router.post("/api/rooms/:code/send", (request, response) => {
    const sent: unknown = request.body;
    const token = isRelayMessage(sent) ? sent.token : undefined;
    const message = isRelayMessage(sent) ? sent.message : undefined;
    if (typeof token !== "string" || !isRelayMessage(message)) {
      response.status(400).json({ error: "bad_request" });
      return;
    }
    if (Buffer.byteLength(JSON.stringify(message)) > MAX_MESSAGE_BYTES) {
      tooLarge(response);
      return;
    }
    const result = rooms.send(request.params.code, token, message);
    if (result === "slow") slowDown(response, 1);
    else if (result === "unknown" || result === "denied") refuseCounted(response, client(request), result);
    else response.json({ delivered: result === "sent" });
  });
};
