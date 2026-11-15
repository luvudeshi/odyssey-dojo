// The note the game's Chert agent keeps (bridge.mjs, beside this file): which room a FaceTime call is in or will
// come into. Plain JavaScript with no dependencies, so the game's tests can run it (server/tests/facetimeWaiting.test.ts).
//
// `chert dev` gives each room its own agent job, and jobs overlap: a new waiting room is entered before the old one
// is closed, and the next waiting room is entered while a call is still on in the last one. So the note keeps every
// room that is open, and names one: a room with a caller first, else the room entered last. A job that ends takes
// only its own room out. (The first version of the agent wrote one room and let the last writer win, so after every
// change of room the note said "no room" while a new one was waiting.)

/** A room nothing was written about for this long is taken to be gone: a job that was killed never says goodbye. */
export const FORGET_AFTER_MS = 10 * 60_000;

/**
 * The note after one change. `before` is the note as last read (anything: a missing or broken file is null).
 * `change` is { room, caller, ready } for a room that is open, or { room, over: true } for a room that has ended.
 * @param {unknown} before
 * @param {{ room: string, caller?: string | null, ready?: boolean, over?: boolean }} change
 * @param {number} nowMs milliseconds since 1970
 */
export function noteAfter(before, change, nowMs) {
  const now = new Date(nowMs).toISOString();
  /** @type {Record<string, { caller: string | null, ready: boolean, entered: string, at: string }>} */
  const rooms = {};
  const old = before !== null && typeof before === 'object' && 'rooms' in before ? before.rooms : null;
  if (old !== null && typeof old === 'object') {
    for (const [name, entry] of Object.entries(old)) {
      if (entry === null || typeof entry !== 'object') continue;
      const at = Date.parse(String(entry.at));
      const entered = Date.parse(String(entry.entered));
      if (!Number.isFinite(at) || !Number.isFinite(entered) || nowMs - at > FORGET_AFTER_MS) continue;
      rooms[name] = { caller: typeof entry.caller === 'string' ? entry.caller : null, ready: entry.ready === true, entered: new Date(entered).toISOString(), at: new Date(at).toISOString() };
    }
  }
  if (change.over === true) delete rooms[change.room];
  else rooms[change.room] = { caller: change.caller ?? null, ready: change.ready === true, entered: rooms[change.room]?.entered ?? now, at: now };
  const newestFirst = Object.entries(rooms).sort((a, b) => Date.parse(b[1].entered) - Date.parse(a[1].entered));
  const pick = newestFirst.find(([, entry]) => entry.caller !== null) ?? newestFirst[0];
  if (!pick) return { room: null, caller: null, ready: false, at: now, last: change.room, rooms };
  // `at` is when the named room was last written about, so a reader can tell an old note from a new one.
  return { room: pick[0], caller: pick[1].caller, ready: pick[1].ready, at: pick[1].at, rooms };
}
