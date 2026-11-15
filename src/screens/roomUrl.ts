// Pure helpers for the room screens: the link a friend opens, and how a guest's device will play.
import { cleanCode } from "../net/transport";

/** The address a friend opens: the game's own address with the room code in the query. */
export function joinUrl(base: string, code: string): string {
  return `${base.replace(/\/+$/, "")}/?room=${cleanCode(code)}`;
}

/** A page already on a real address is reachable as it is; a page on localhost needs the server's LAN address. */
export function reachableBase(origin: string, hostname: string, lanBase: string | null): string {
  const local = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  return local && lanBase !== null ? lanBase : origin;
}

export type GuestMode = "camera" | "keyboard" | "touch";

/** A camera needs a secure page (https or localhost); a phone over plain http refuses it, so it gets big buttons. */
export function guestMode(env: { readonly secure: boolean; readonly hasCamera: boolean; readonly touch: boolean }): GuestMode {
  if (env.secure && env.hasCamera) return "camera";
  return env.touch ? "touch" : "keyboard";
}

export const MODE_TEXT: Readonly<Record<GuestMode, string>> = {
  camera: "You will play with your webcam, or with the keyboard if you prefer.",
  keyboard: "This page has no camera, so you will play with the keyboard.",
  touch: "A phone on plain http cannot use the camera, so you will play with big touch buttons.",
};

/** The code from `?room=`, cleaned, or null. */
export function roomFromSearch(search: string): string | null {
  const code = cleanCode(new URLSearchParams(search).get("room") ?? "");
  return code === "" ? null : code;
}

export const ROOM_MESSAGES: Readonly<Record<string, string>> = {
  unknown_room: "No room has that code. Check the letters, or ask your friend for a new one.",
  room_full: "That room already has two fighters.",
  too_many_rooms: "The server has too many rooms open. Try again in a minute.",
  unreachable: "Cannot reach the game server. Is it running?",
};
