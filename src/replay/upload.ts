// How the game shares a finished fight: the god card and the replay video go to the server, a phone page and its QR code come back. Never rejects and never hangs.
import { log } from "../core/log";
import { CARD_PREFIX, CreateReplayResponseSchema, MAX_CARD_BYTES, MAX_VIDEO_BYTES, isPng } from "./contracts";
import type { CreateReplayRequest, ReplayMeta } from "./contracts";

const CREATE_TIMEOUT_MS = 8000;
const VIDEO_TIMEOUT_MS = 30000;
/** String.fromCharCode takes its bytes as arguments, and engines cap how many a call may have. */
const CHUNK = 0x8000;

export interface ReplayUpload {
  readonly meta: ReplayMeta;
  /** The god card as a PNG. Anything else is left out, and the page is made without a picture. */
  readonly card: Blob | null;
  /** The recorded fight, WebM or MP4. */
  readonly video: Blob | null;
}

export interface ReplayLinks {
  /** The absolute address a phone should open. */
  readonly pageUrl: string;
  /** An image of pageUrl as a QR code, served by this game's own server. */
  readonly qrUrl: string;
}

export interface UploadOptions {
  readonly fetcher?: typeof fetch;
  readonly timeoutMs?: number;
  readonly videoTimeoutMs?: number;
  /** Aborting this stops the upload: the request on its way is cancelled, and a video not yet started is not sent. */
  readonly signal?: AbortSignal;
}

/** Ends a request when its time is up or when the caller stops the upload, whichever comes first. */
function until(timeoutMs: number, stop: AbortSignal | undefined): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return stop === undefined ? timeout : AbortSignal.any([timeout, stop]);
}

async function cardDataUrl(card: Blob | null): Promise<string | null> {
  if (card === null || card.size === 0) return null;
  if (card.size > MAX_CARD_BYTES) {
    log("warn", "replay_card_too_large", card.size);
    return null;
  }
  const bytes = new Uint8Array(await card.arrayBuffer());
  // The server refuses the whole request over a card that is not a PNG, which would lose the page and the video too.
  if (!isPng(bytes)) {
    log("warn", "replay_card_not_png", card.type);
    return null;
  }
  let binary = "";
  for (let start = 0; start < bytes.length; start += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(start, start + CHUNK));
  }
  return CARD_PREFIX + btoa(binary);
}

/** The page is already worth showing without its video, so a failure here is only logged. */
async function uploadVideo(fetcher: typeof fetch, id: string, video: Blob, signal: AbortSignal): Promise<void> {
  if (video.size === 0 || video.size > MAX_VIDEO_BYTES) {
    log("warn", "replay_video_skipped", video.size);
    return;
  }
  try {
    const response = await fetcher(`/api/replays/${encodeURIComponent(id)}/video`, {
      method: "PUT",
      // A recorder reports its codecs too ("video/webm;codecs=vp9"); the server only needs the container.
      headers: { "Content-Type": video.type.startsWith("video/mp4") ? "video/mp4" : "video/webm" },
      body: video,
      signal,
    });
    if (!response.ok) throw new Error(`video upload failed with ${String(response.status)}`);
  } catch (error) {
    log("warn", "replay_video_failed", error);
  }
}

/** Null means there is nothing to show: the server is off, slow or answered with something else. */
export async function uploadReplay(input: ReplayUpload, options: UploadOptions = {}): Promise<ReplayLinks | null> {
  const fetcher = options.fetcher ?? fetch;
  try {
    const body: CreateReplayRequest = { meta: input.meta, card: await cardDataUrl(input.card) };
    const response = await fetcher("/api/replays", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: until(options.timeoutMs ?? CREATE_TIMEOUT_MS, options.signal),
    });
    if (!response.ok) throw new Error(`replay request failed with ${String(response.status)}`);
    const created = CreateReplayResponseSchema.parse(await response.json());
    // A share that was stopped while the page was being made does not go on to send up to 64 MB of video.
    if (input.video !== null && options.signal?.aborted !== true) {
      await uploadVideo(fetcher, created.id, input.video, until(options.videoTimeoutMs ?? VIDEO_TIMEOUT_MS, options.signal));
    }
    return { pageUrl: created.page_url, qrUrl: created.qr_url };
  } catch (error) {
    log("warn", "replay_offline", error);
    return null;
  }
}
