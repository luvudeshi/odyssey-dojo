// The real room's adapter (src/facetime/livekitRoom.ts) with a made-up livekit-client: what it tells a listener on
// joining a room that already has people and tracks in it, and the order the game's own tracks go out in.
import { describe, expect, test, vi } from "vitest";
import { openLivekitRoom } from "../src/facetime/livekitRoom";
import { TRACK_NAMES } from "../src/facetime/room";
import type { RoomEvent } from "../src/facetime/room";

interface FakeTrack { readonly kind: "video" | "audio"; readonly mediaStreamTrack: MediaStreamTrack }
interface FakeParticipant { readonly identity: string; readonly trackPublications: Map<string, { readonly track?: FakeTrack }> }

const made = vi.hoisted(() => ({
  /** Who is in the room when the join is done. */
  present: [] as FakeParticipant[],
  metadata: "",
  /** What was published, in order, and how often the picture is refused first. */
  published: [] as string[],
  refusePicture: 0,
  handlers: new Map<string, (...args: unknown[]) => void>(),
}));

vi.mock("livekit-client", () => {
  class Room {
    remoteParticipants = new Map<string, FakeParticipant>();
    metadata: string | undefined = undefined;
    localParticipant = {
      publishTrack: (_track: MediaStreamTrack, options: { name: string }): Promise<void> => {
        if (options.name === "odyssey-dojo-fight" && made.refusePicture > 0) {
          made.refusePicture -= 1;
          made.published.push(`${options.name} refused`);
          return Promise.reject(new Error("the answer was lost"));
        }
        made.published.push(options.name);
        return Promise.resolve();
      },
    };
    on(event: string, handler: (...args: unknown[]) => void): void { made.handlers.set(event, handler); }
    connect(): Promise<void> {
      made.present.forEach((each) => { this.remoteParticipants.set(each.identity, each); });
      this.metadata = made.metadata;
      return Promise.resolve();
    }
    disconnect(): Promise<void> { return Promise.resolve(); }
  }
  const RoomEvent = {
    RoomMetadataChanged: "roomMetadataChanged", TrackSubscribed: "trackSubscribed", TrackUnsubscribed: "trackUnsubscribed",
    ParticipantConnected: "participantConnected", ParticipantDisconnected: "participantDisconnected", Disconnected: "disconnected",
  };
  const Track = { Kind: { Video: "video", Audio: "audio" }, Source: { Camera: "camera", Microphone: "microphone" } };
  return { Room, RoomEvent, Track };
});

const media = (name: string): MediaStreamTrack => ({ id: name }) as unknown as MediaStreamTrack;
const person = (identity: string, tracks: readonly (FakeTrack | undefined)[] = []): FakeParticipant =>
  ({ identity, trackPublications: new Map(tracks.map((track, index) => [`TR_${String(index)}`, track === undefined ? {} : { track }])) });
const said = (event: RoomEvent): string => {
  if (event.type === "video" || event.type === "audio") return `${event.type} ${event.identity} ${event.track ? (event.track as unknown as { id: string }).id : "gone"}`;
  if (event.type === "joined" || event.type === "left") return `${event.type} ${event.identity}`;
  return event.type;
};

describe("joining a room that is already in use", () => {
  test("the caller's camera and voice, which came while joining, are told after the caller, and the ready sign last", async () => {
    made.present = [
      person("agent-AJ_madeup"),
      // The second publication is one that is not subscribed yet: it raises its own event later.
      person("chert-bridge-call-1", [{ kind: "video", mediaStreamTrack: media("friend-camera") }, undefined, { kind: "audio", mediaStreamTrack: media("friend-voice") }]),
    ];
    made.metadata = '{"chert_bridge_ready":true}';
    const room = await openLivekitRoom();
    const heard: string[] = [];
    room.on((event) => { heard.push(said(event)); });
    await room.connect("wss://rooms.example.test", "token");
    expect(heard).toEqual([
      "joined agent-AJ_madeup",
      "joined chert-bridge-call-1",
      "video chert-bridge-call-1 friend-camera",
      "audio chert-bridge-call-1 friend-voice",
      "metadata",
    ]);
  });

  test("an empty room tells nothing on joining, and what happens later is told as it happens", async () => {
    made.present = [];
    made.metadata = "";
    const room = await openLivekitRoom();
    const heard: string[] = [];
    room.on((event) => { heard.push(said(event)); });
    await room.connect("wss://rooms.example.test", "token");
    expect(heard).toEqual([]);
    made.handlers.get("participantConnected")?.({ identity: "chert-bridge-call-1" });
    made.handlers.get("trackSubscribed")?.({ kind: "video", mediaStreamTrack: media("friend-camera") }, {}, { identity: "chert-bridge-call-1" });
    made.handlers.get("participantDisconnected")?.({ identity: "chert-bridge-call-1" });
    made.handlers.get("disconnected")?.(2);
    expect(heard).toEqual(["joined chert-bridge-call-1", "video chert-bridge-call-1 friend-camera", "left chert-bridge-call-1", "disconnected"]);
  });
});

describe("what the game sends", () => {
  test("the sound goes out before the picture, each once, and a picture that is refused once is sent again", async () => {
    const room = await openLivekitRoom();
    made.published.length = 0;
    await room.publish(media("picture"), media("sound"));
    expect(made.published).toEqual([TRACK_NAMES.audio, TRACK_NAMES.video]);
    made.published.length = 0;
    made.refusePicture = 1;
    await room.publish(media("picture"), media("sound"));
    expect(made.published).toEqual([TRACK_NAMES.audio, `${TRACK_NAMES.video} refused`, TRACK_NAMES.video]);
  });
});
