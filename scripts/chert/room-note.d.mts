// Types for room-note.mjs, so server/tests/facetimeWaiting.test.ts can import it (no allowJs there).

export interface NotedRoom {
  caller: string | null;
  ready: boolean;
  entered: string;
  at: string;
}
export interface RoomNoteFile {
  room: string | null;
  caller: string | null;
  ready: boolean;
  at: string;
  last?: string;
  rooms: Record<string, NotedRoom>;
}
export const FORGET_AFTER_MS: number;
export function noteAfter(before: unknown, change: { room: string; caller?: string | null; ready?: boolean; over?: boolean }, nowMs: number): RoomNoteFile;
