// A guest's seat, kept for the tab so a reload goes back into the same room and seat. joinRoomAgain in
// src/net/transport.ts writes the seat (code and token); this file reads which room it is in, keeps how the guest
// joined (webcam or not), and forgets both when the guest leaves on purpose or the host leaves.
import type { SeatStore } from "../net/transport";
import { cleanCode } from "../net/transport";

/** The key joinRoomAgain keeps the seat under (SEAT_KEY in src/net/transport.ts); tests/seatStore.test.ts checks they match. */
const SEAT_KEY = "odyssey.room.seat";
const CAMERA_KEY = "odyssey.room.camera";

/** The tab's sessionStorage, or null when the page may not use it (some private windows throw on the getter). */
export function tabStore(): SeatStore | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** The room of the kept seat and whether it was joined with the webcam, or null when no seat is kept. */
export function keptRoom(store: SeatStore | null): { code: string; camera: boolean } | null {
  if (store === null) return null;
  try {
    const kept: unknown = JSON.parse(store.getItem(SEAT_KEY) ?? "null");
    const code = typeof kept === "object" && kept !== null && "code" in kept && typeof kept.code === "string" ? cleanCode(kept.code) : "";
    return code.length === 4 ? { code, camera: store.getItem(CAMERA_KEY) === "camera" } : null;
  } catch {
    return null;
  }
}

export function keepCamera(store: SeatStore | null, camera: boolean): void {
  try {
    store?.setItem(CAMERA_KEY, camera ? "camera" : "keys");
  } catch {
    // No storage: a reload asks nothing and the guest presses Join again.
  }
}

export function forgetSeat(store: SeatStore | null): void {
  try {
    store?.removeItem(SEAT_KEY);
    store?.removeItem(CAMERA_KEY);
  } catch {
    // Storage is closed to this page: nothing was kept.
  }
}
