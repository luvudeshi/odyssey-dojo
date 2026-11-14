// Replay sharing: stores a god card and a fight video, then serves a phone page for them and a QR code that opens it.
import express from "express";
import type { NextFunction, Request, Response } from "express";
import { toString as qrCode } from "qrcode";
import { log } from "../../src/core/log";
import { CARD_PREFIX, CreateReplayRequestSchema, MAX_VIDEO_BYTES } from "../../src/replay/contracts";
import type { CreateReplayResponse } from "../../src/replay/contracts";
import type { Register } from "../app";
import { baseUrl, lanAddress } from "../lib/address";
import { missingPage, replayPage } from "../lib/replayPage";
import { CARD_FILE, createReplay, findReplay, isPng, saveVideo, videoFile } from "../lib/replayStore";
import type { StoredReplay, VideoKind } from "../lib/replayStore";

type Handler = (request: Request, response: Response, next: NextFunction) => Promise<void>;

const VIDEO_TYPES: Readonly<Record<VideoKind, string>> = { webm: "video/webm", mp4: "video/mp4" };
// The page loads its own card and video and nothing else, whatever ends up in its text.
const PAGE_POLICY = "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'";

const readVideo = express.raw({ type: Object.values(VIDEO_TYPES), limit: MAX_VIDEO_BYTES });

/** A handler that fails still answers, and the failure never reaches the caller as a stack trace. */
function safely(handler: Handler): Handler {
  return async (request, response, next) => {
    try {
      await handler(request, response, next);
    } catch (error) {
      log("error", "replay_route_failed", error);
      if (!response.headersSent) response.status(500).json({ error: "server_error" });
    }
  };
}

function notFound(response: Response): void {
  response.status(404).json({ error: "not_found" });
}

/** Sends a stored file. sendFile answers Range requests, which is how a phone plays and seeks a video. */
function sendStored(response: Response, replay: StoredReplay, file: string, type: string): void {
  response.type(type).set("X-Content-Type-Options", "nosniff");
  // The root keeps sendFile from refusing a data folder that sits under a dot-folder.
  response.sendFile(file, { root: replay.dir }, (error?: Error) => {
    if (error === undefined) return;
    log("warn", "replay_send_failed", error);
    if (!response.headersSent) notFound(response);
  });
}

/** A body that is too big is a 413, anything else the parser rejects is a 400, and neither reaches the app's 500. */
function parseVideo(request: Request, response: Response, next: NextFunction): void {
  readVideo(request, response, (error?: unknown) => {
    if (error === undefined || error === null) {
      next();
      return;
    }
    const tooLarge = typeof error === "object" && "status" in error && error.status === 413;
    response.status(tooLarge ? 413 : 400).json({ error: tooLarge ? "too_large" : "bad_body" });
  });
}

export const register: Register = (router, { config }) => {
  const find = (request: Request): Promise<StoredReplay | null> => findReplay(config.dataDir, request.params.id);

  router.post("/api/replays", safely(async (request, response) => {
    const parsed = CreateReplayRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "bad_request", issues: parsed.error.issues.map((issue) => issue.message) });
      return;
    }
    const { meta, card } = parsed.data;
    const picture = card === null ? null : Buffer.from(card.slice(CARD_PREFIX.length), "base64");
    if (picture !== null && !isPng(picture)) {
      response.status(400).json({ error: "bad_request", issues: ["card is not a PNG"] });
      return;
    }
    const base = baseUrl({
      publicBaseUrl: config.publicBaseUrl,
      lan: lanAddress(),
      port: request.socket.localPort,
      protocol: request.protocol,
      host: request.get("host"),
    });
    const replay = await createReplay(config.dataDir, meta, picture, (id) => `${base}/replays/${id}`);
    const answer: CreateReplayResponse = {
      id: replay.id,
      page_url: replay.pageUrl,
      qr_url: `/api/replays/${replay.id}/qr.svg`,
    };
    response.json(answer);
  }));

  // The id is checked before the body is read, so an unknown id never costs a 64 MB upload.
  router.put("/api/replays/:id/video", safely(async (request, response, next) => {
    if (await find(request) === null) notFound(response);
    else next();
  }), parseVideo, safely(async (request, response) => {
    const replay = await find(request);
    const body: unknown = request.body;
    if (replay === null) {
      notFound(response);
    } else if (!Buffer.isBuffer(body) || body.length === 0) {
      response.status(400).json({ error: "bad_body" });
    } else {
      await saveVideo(replay, request.is(VIDEO_TYPES.mp4) === false ? "webm" : "mp4", body);
      response.json({ ok: true });
    }
  }));

  router.get("/replays/:id", safely(async (request, response) => {
    const replay = await find(request);
    response
      .status(replay === null ? 404 : 200)
      .set({ "Content-Security-Policy": PAGE_POLICY, "X-Content-Type-Options": "nosniff", "Cache-Control": "no-cache" })
      .type("html")
      .send(replay === null ? missingPage() : replayPage(replay));
  }));

  router.get("/replays/:id/card.png", safely(async (request, response) => {
    const replay = await find(request);
    if (replay?.hasCard === true) sendStored(response, replay, CARD_FILE, "image/png");
    else notFound(response);
  }));

  router.get("/replays/:id/video", safely(async (request, response) => {
    const replay = await find(request);
    const kind = replay?.video ?? null;
    if (replay === null || kind === null) notFound(response);
    else sendStored(response, replay, videoFile(kind), VIDEO_TYPES[kind]);
  }));

  router.get("/api/replays/:id/qr.svg", safely(async (request, response) => {
    const replay = await find(request);
    if (replay === null) {
      notFound(response);
      return;
    }
    const svg = await qrCode(replay.pageUrl, { type: "svg", margin: 2, color: { dark: "#140c22", light: "#f1ead9" } });
    response.type("image/svg+xml").set("X-Content-Type-Options", "nosniff").send(svg);
  }));
};
