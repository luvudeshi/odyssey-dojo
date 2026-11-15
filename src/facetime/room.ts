// The call's media room, as the little this game needs from it. The real one is LiveKit (livekitRoom.ts); tests and
// the loopback demo page use fakeRoom.ts, so nothing else in this folder knows which it is talking to.

export type RoomEvent =
  /** The room's metadata changed (or was read on joining). The bridge says it is ready here. */
  | { readonly type: "metadata"; readonly metadata: string }
  /** The friend's camera arrived (a track) or stopped (null). */
  | { readonly type: "video"; readonly track: MediaStreamTrack | null; readonly identity: string }
  /** The friend's microphone arrived or stopped. */
  | { readonly type: "audio"; readonly track: MediaStreamTrack | null; readonly identity: string }
  /** The far end left the room: the friend hung up, or the call was ended. */
  | { readonly type: "left"; readonly identity: string }
  /** This page lost the room. */
  | { readonly type: "disconnected"; readonly reason: string };

export interface FaceTimeRoom {
  /** Joins the room as the game. Events seen while joining are delivered after `on` listeners are set. */
  connect(url: string, token: string): Promise<void>;
  /**
   * Publishes the game's picture and sound from this one participant. The call service shows video only from the
   * participant that also speaks, so both go out together.
   */
  publish(video: MediaStreamTrack, audio: MediaStreamTrack | null): Promise<void>;
  on(listener: (event: RoomEvent) => void): void;
  disconnect(): Promise<void>;
}

/** The names the game's tracks are published under. */
export const TRACK_NAMES = { video: "odyssey-dojo-fight", audio: "odyssey-dojo-sound" } as const;
