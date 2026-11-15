// Online rooms over plain HTTP: create, join, an event stream that pushes the other member's messages, and send.
// The rooms and their rules live in ../lib/rooms and the limits in ../lib/roomLimits; this file only turns them into requests and answers.
import express from "express";
import type { Request, RequestHandler, Response } from "express";
import { log } from "../../src/core/log";
import type { Register } from "../app";
import { SEND_ENVELOPE_BYTES, SMALL_BODY_BYTES, STREAMS_RETRY_S, clientKey, createRoomLimits } from "../lib/roomLimits";
import { MAX_MESSAGE_BYTES, createRoomStore, isRelayMessage, peerEvent } from "../lib/rooms";
import type { Refusal, RelayMessage } from "../lib/rooms";

/** A comment line this often keeps proxies and browsers from closing a quiet stream. */
export const HEARTBEAT_MS = 15_000;
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
 * larger is ever held: a body that says it is too long is refused before any of it is read, and one that does not
 * say is cut off at the limit and the rest thrown away as it arrives.
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
    const wait = limits.create(who, rooms.heldBy(who));
    if (wait > 0) {
      log("warn", "room_create_limited", { rooms: rooms.size() });
      slowDown(response, wait);
      return;
    }
    const room = rooms.create(who);
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
    const release = limits.openStream(who);
    if (release === null) {
      slowDown(response, STREAMS_RETRY_S);
      return;
    }
    const token = request.query.token;
    // A stream that has ended is never written to again: that would raise an error nobody handles.
    const write = (text: string): void => {
      if (!response.writableEnded) response.write(text);
    };
    const push = (message: RelayMessage): void => { write(`data: ${JSON.stringify(message)}\n\n`); };
    const attached = rooms.attach(request.params.code, typeof token === "string" ? token : "", {
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
      write(": keep\n\n");
    }, HEARTBEAT_MS);
    response.on("close", () => {
      clearInterval(heartbeat);
      attached.detach();
      release();
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
