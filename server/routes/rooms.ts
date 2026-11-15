// Online rooms over plain HTTP: create, join, an event stream that pushes the other member's messages, and send.
// The rooms and their rules live in ../lib/rooms; this file only turns them into requests and answers.
import type { Response } from "express";
import { log } from "../../src/core/log";
import type { Register } from "../app";
import { MAX_MESSAGE_BYTES, createRoomStore, isRelayMessage, peerEvent } from "../lib/rooms";
import type { Refusal, RelayMessage } from "../lib/rooms";

/** A comment line this often keeps proxies and browsers from closing a quiet stream. */
export const HEARTBEAT_MS = 15_000;
const STREAM_HEADERS = { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" };

function refuse(response: Response, refusal: Refusal): void {
  if (refusal === "unknown") response.status(404).json({ error: "unknown_room" });
  else response.status(401).json({ error: "bad_token" });
}

export const register: Register = (router) => {
  const rooms = createRoomStore();

  router.post("/api/rooms", (_request, response) => {
    const room = rooms.create();
    if (room === null) {
      log("warn", "rooms_at_cap", { rooms: rooms.size() });
      response.status(503).json({ error: "too_many_rooms" });
      return;
    }
    log("info", "room_created", { code: room.code, rooms: rooms.size() });
    response.json(room);
  });

  router.post("/api/rooms/:code/join", (request, response) => {
    const joined = rooms.join(request.params.code);
    if (joined === "unknown") refuse(response, joined);
    else if (joined === "full") response.status(409).json({ error: "room_full" });
    else response.json(joined);
  });

  router.get("/api/rooms/:code/events", (request, response) => {
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
      refuse(response, attached);
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
    });
  });

  router.post("/api/rooms/:code/send", (request, response) => {
    const body: unknown = request.body;
    const token = isRelayMessage(body) ? body.token : undefined;
    const message = isRelayMessage(body) ? body.message : undefined;
    if (typeof token !== "string" || !isRelayMessage(message)) {
      response.status(400).json({ error: "bad_request" });
      return;
    }
    if (Buffer.byteLength(JSON.stringify(message)) > MAX_MESSAGE_BYTES) {
      response.status(413).json({ error: "too_large" });
      return;
    }
    const result = rooms.send(request.params.code, token, message);
    if (result === "unknown" || result === "denied") refuse(response, result);
    else response.json({ delivered: result === "sent" });
  });
};
