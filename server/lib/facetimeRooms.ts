// Closing a call's room for certain. Leaving the room is not enough: the FaceTime bridge is a participant too, and
// while it stays the room stays, the call can stay up on the friend's phone and the line stays busy.
// LiveKit's room service has DeleteRoom, which drops everyone in the room. It is a Twirp call: a plain HTTPS POST
// with a JSON body, on the same host as the rooms. The token for it is signed here and goes only to LiveKit.
import type { LivekitConfig } from "./facetimeEnv";
import { mintRoomServiceToken } from "./facetimeToken";

export const DELETE_ROOM_PATH = "/twirp/livekit.RoomService/DeleteRoom";
/** The room-service token is used at once, so it lives this many seconds. */
export const ROOM_SERVICE_TTL_S = 60;
export const ROOM_SERVICE_TIMEOUT_MS = 5000;
/** A DeleteRoom sent in the first second after a join can answer 404: the room is tried once more after this wait. */
export const DELETE_RETRY_MS = 700;

/** The room service's address for a room address: wss:// becomes https://, ws:// becomes http://. Null when it is neither. */
export function roomServiceUrl(livekitUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(livekitUrl.trim());
  } catch {
    return null;
  }
  const scheme = url.protocol === "wss:" || url.protocol === "https:" ? "https:" : url.protocol === "ws:" || url.protocol === "http:" ? "http:" : null;
  if (scheme === null || url.host === "") return null;
  return `${scheme}//${url.host}${url.pathname.replace(/\/+$/, "")}`;
}

export interface DeleteRoomRequest {
  readonly url: string;
  readonly init: { readonly method: "POST"; readonly headers: Readonly<Record<string, string>>; readonly body: string };
}

export function deleteRoomRequest(config: LivekitConfig, room: string, nowSeconds: number): DeleteRoomRequest | null {
  const base = roomServiceUrl(config.livekitUrl);
  if (base === null) return null;
  const token = mintRoomServiceToken({ apiKey: config.livekitKey, apiSecret: config.livekitSecret, ttlSeconds: ROOM_SERVICE_TTL_S, nowSeconds });
  return {
    url: `${base}${DELETE_ROOM_PATH}`,
    init: { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ room }) },
  };
}

/**
 * "deleted": LiveKit closed the room and dropped whoever was in it. "gone": it knows no such room (already closed).
 * `status` is LiveKit's HTTP status, or 0 when it was not reached. Nothing LiveKit sent back is kept.
 */
export type RoomClosed =
  | { readonly ok: true; readonly room: "deleted" | "gone"; readonly tries: number }
  | { readonly ok: false; readonly why: "network" | "service"; readonly status: number };

export interface DeleteRoomDeps {
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>;
  /** Milliseconds since 1970. */
  readonly now: () => number;
  readonly wait: (ms: number) => Promise<void>;
}

export async function deleteRoom(deps: DeleteRoomDeps, config: LivekitConfig, room: string): Promise<RoomClosed> {
  for (let tries = 1; ; tries++) {
    // A new token for each try, so the retry is never sent with one that has aged.
    const request = deleteRoomRequest(config, room, Math.floor(deps.now() / 1000));
    if (request === null) return { ok: false, why: "service", status: 0 };
    let status: number;
    try {
      const response = await deps.fetch(request.url, { ...request.init, signal: AbortSignal.timeout(ROOM_SERVICE_TIMEOUT_MS) });
      status = response.status;
      // The body is not needed; drop it so the connection is freed.
      void response.body?.cancel().catch(() => undefined);
    } catch {
      // The error is not passed on: it can carry the request, and the request carries the token.
      return { ok: false, why: "network", status: 0 };
    }
    if (status >= 200 && status < 300) return { ok: true, room: "deleted", tries };
    if (status !== 404) return { ok: false, why: "service", status };
    if (tries === 2) return { ok: true, room: "gone", tries };
    await deps.wait(DELETE_RETRY_MS);
  }
}
