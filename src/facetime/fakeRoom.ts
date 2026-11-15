// A room with no network, for the tests and for the loopback demo page (tools/facetime): the test or the page
// plays the far end by calling `emit`, and can look at what the game published.
import type { FaceTimeRoom, RoomEvent } from "./room";

export interface FakeRoom extends FaceTimeRoom {
  /** Plays the far end: the bridge's metadata, the friend's tracks, a hang up. */
  emit(event: RoomEvent): void;
  /** Everything that was done to the room, in order: "connect", "publish", "disconnect". */
  readonly calls: readonly string[];
  readonly published: { readonly video: MediaStreamTrack | null; readonly audio: MediaStreamTrack | null };
  readonly joined: { readonly url: string; readonly token: string } | null;
}

export function createFakeRoom(options: { readonly failConnect?: boolean } = {}): FakeRoom {
  const listeners: ((event: RoomEvent) => void)[] = [];
  const calls: string[] = [];
  let video: MediaStreamTrack | null = null;
  let audio: MediaStreamTrack | null = null;
  let joined: { url: string; token: string } | null = null;
  return {
    connect(url, token) {
      calls.push("connect");
      if (options.failConnect === true) return Promise.reject(new Error("could not reach the room"));
      joined = { url, token };
      return Promise.resolve();
    },
    publish(nextVideo, nextAudio) {
      calls.push("publish");
      video = nextVideo;
      audio = nextAudio;
      return Promise.resolve();
    },
    on(listener) { listeners.push(listener); },
    disconnect() {
      calls.push("disconnect");
      joined = null;
      return Promise.resolve();
    },
    emit(event) { listeners.forEach((listener) => { listener(event); }); },
    get calls() { return calls; },
    get published() { return { video, audio }; },
    get joined() { return joined; },
  };
}
