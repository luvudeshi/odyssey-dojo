// The stand-in friend: a browser page that sits in the call's room where the FaceTime bridge would, so the call can
// be tried with a LiveKit project and no call service. This file is the link between the card and that page
// (tools/facetime/standin.html): how the seat is put into the page's address and read back out of it.
//
// The seat travels in the part of the address after "#". A browser never sends that part to a server, so the
// token is not in any request line or server log. It must never go in the query string.
import type { RoomSeat } from "./api";

/** The stand-in page, served by the dev server (npm run dev). It is not part of a built game. */
export const STAND_IN_PAGE = "/tools/facetime/standin.html";

const ROOM = /^odyssey-dojo-[0-9a-f]{12}$/;
const TOKEN = /^[\w-]+\.[\w-]+\.[\w-]+$/;

/** What the stand-in page needs to join: where the room is, which room, and the token for the friend's seat. */
export type FriendSeat = Pick<RoomSeat, "url" | "room" | "token">;

/** The address of the stand-in page for this seat, on the game's own origin. */
export function standInLink(origin: string, seat: FriendSeat): string {
  const fields = new URLSearchParams({ url: seat.url, room: seat.room, token: seat.token });
  return `${origin.replace(/\/+$/, "")}${STAND_IN_PAGE}#${fields.toString()}`;
}

export type ReadSeat = { readonly ok: true; readonly seat: FriendSeat } | { readonly ok: false; readonly why: string };

/** Reads the seat back from the page's address (`location.hash`). Every refusal is a plain line for the page. */
export function readStandInHash(hash: string): ReadSeat {
  const text = hash.replace(/^#/, "");
  if (text.trim() === "") return { ok: false, why: "This page has no call to join. Open it from the game: press \"Test without a phone\" on the FaceTime card, then the link it shows." };
  const fields = new URLSearchParams(text);
  const url = fields.get("url") ?? "";
  const room = fields.get("room") ?? "";
  const token = fields.get("token") ?? "";
  if (!/^wss?:\/\/[^\s/]+/.test(url)) return { ok: false, why: "The link has no room address (it should begin with wss://). Open the link from the game's card again." };
  if (!ROOM.test(room)) return { ok: false, why: "The link does not name one of the game's call rooms. Open the link from the game's card again." };
  if (!TOKEN.test(token)) return { ok: false, why: "The link has no token for the room. Open the link from the game's card again." };
  return { ok: true, seat: { url, room, token } };
}

export interface TokenFacts {
  /** Who the holder is in the room. */
  readonly identity: string;
  readonly room: string;
  /** Seconds since 1970 after which the token no longer lets anyone in. */
  readonly expires: number;
}

/**
 * What a room token says about itself, read without checking its signature (the page has no secret, and LiveKit
 * checks it on joining). Only for telling the person at the page who they will be and whether the link is too old.
 */
export function tokenFacts(token: string): TokenFacts | null {
  const payload = token.split(".")[1];
  if (payload === undefined || !TOKEN.test(token)) return null;
  try {
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const claims: unknown = JSON.parse(atob(padded));
    if (typeof claims !== "object" || claims === null) return null;
    const { sub, exp, video } = claims as { sub?: unknown; exp?: unknown; video?: unknown };
    const room = typeof video === "object" && video !== null ? (video as { room?: unknown }).room : undefined;
    if (typeof sub !== "string" || typeof exp !== "number" || typeof room !== "string") return null;
    return { identity: sub, room, expires: exp };
  } catch {
    return null;
  }
}

/** Why this seat cannot be used right now, or null when it can. `nowMs` is milliseconds since 1970. */
export function seatProblem(seat: FriendSeat, nowMs: number): string | null {
  const facts = tokenFacts(seat.token);
  if (!facts) return "The token in the link cannot be read. Open the link from the game's card again.";
  if (facts.room !== seat.room) return "The token in the link is for another room. Open the link from the game's card again.";
  if (facts.expires * 1000 <= nowMs) return "This link is too old: its token has run out. Press \"Test without a phone\" in the game again.";
  return null;
}
