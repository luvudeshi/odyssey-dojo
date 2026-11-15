// The real room: LiveKit, where the call service bridges each FaceTime call. This is the only file that touches
// the livekit-client package, and it loads it when a call starts, so the game's first load does not grow.
//
// NOT RUN AGAINST A REAL ROOM YET. It type-checks against livekit-client 2.24.1; the event names and options are
// that package's own. What the bridge's participant and tracks look like is taken from the call service's setup
// page: every remote participant is treated as the friend, and a remote participant leaving ends the call.
import { TRACK_NAMES } from "./room";
import type { FaceTimeRoom, RoomEvent } from "./room";

export async function openLivekitRoom(): Promise<FaceTimeRoom> {
  const { Room, RoomEvent: Events, Track } = await import("livekit-client");
  // The friend's picture is read by the pose model, never shown in an element, so nothing may pause or shrink it.
  const room = new Room({ adaptiveStream: false, dynacast: false });
  const listeners: ((event: RoomEvent) => void)[] = [];
  const tell = (event: RoomEvent): void => { listeners.forEach((listener) => { listener(event); }); };

  room.on(Events.RoomMetadataChanged, (metadata) => { tell({ type: "metadata", metadata }); });
  room.on(Events.TrackSubscribed, (track, _publication, participant) => {
    if (track.kind === Track.Kind.Video) tell({ type: "video", track: track.mediaStreamTrack, identity: participant.identity });
    else if (track.kind === Track.Kind.Audio) tell({ type: "audio", track: track.mediaStreamTrack, identity: participant.identity });
  });
  room.on(Events.TrackUnsubscribed, (track, _publication, participant) => {
    if (track.kind === Track.Kind.Video) tell({ type: "video", track: null, identity: participant.identity });
    else if (track.kind === Track.Kind.Audio) tell({ type: "audio", track: null, identity: participant.identity });
  });
  room.on(Events.ParticipantConnected, (participant) => { tell({ type: "joined", identity: participant.identity }); });
  room.on(Events.ParticipantDisconnected, (participant) => { tell({ type: "left", identity: participant.identity }); });
  room.on(Events.Disconnected, (reason) => { tell({ type: "disconnected", reason: reason === undefined ? "" : String(reason) }); });

  return {
    async connect(url, token) {
      await room.connect(url, token);
      // Whoever was here first raises no event either. Told before the metadata, so an answered call hears the ready sign.
      room.remoteParticipants.forEach((participant) => { tell({ type: "joined", identity: participant.identity }); });
      // Metadata set before this page joined does not raise the changed event.
      if (room.metadata !== undefined && room.metadata !== "") tell({ type: "metadata", metadata: room.metadata });
    },
    async publish(video, audio) {
      // The sound goes first: the call service ends a call it hears nothing from, and a call with no picture only
      // shows the line's default one. Published once, as one track: a second audio track ends the call too.
      if (audio) await room.localParticipant.publishTrack(audio, { name: TRACK_NAMES.audio, source: Track.Source.Microphone, dtx: false });
      // The picture is published as this participant's camera: the call service sends video only when the
      // participant that speaks has a camera track. Tried twice, so one lost answer does not cost the call.
      const sendPicture = (): Promise<unknown> => room.localParticipant.publishTrack(video, {
        name: TRACK_NAMES.video, source: Track.Source.Camera, simulcast: false,
        videoEncoding: { maxBitrate: 1_500_000, maxFramerate: 20 },
      });
      await sendPicture().catch(() => sendPicture());
    },
    on(listener) { listeners.push(listener); },
    async disconnect() { await room.disconnect(); },
  };
}
