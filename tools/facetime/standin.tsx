// The stand-in friend: this page is the friend's phone, in a browser. Open it from the game's FaceTime card
// ("Test without a phone"), on the dev server: /tools/facetime/standin.html#url=...&room=...&token=...
// It joins the call's real LiveKit room in the seat the FaceTime bridge would take, sends this browser's camera
// and microphone, shows the picture the game publishes in a phone-shaped frame and plays the game's sound.
// So everything on the game's side runs against a real room with no call service and no phone.
//
// What it cannot do: a participant's token cannot set the room's metadata, so the bridge's ready sign
// ("chert_bridge_ready") is never sent. The game takes its fallback instead: it greets 3 seconds after it sees
// this page's camera (BRIDGE_FALLBACK_MS in src/facetime/session.ts). The page says so.
//
// The seat comes in the part of the address after "#", which is never sent to a server. It is not logged here.
import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Room } from "livekit-client";
import { TRACK_NAMES } from "../../src/facetime/room";
import { BRIDGE_FALLBACK_MS } from "../../src/facetime/session";
import { readStandInHash, seatProblem, tokenFacts } from "../../src/facetime/standIn";
import "./standin.css";

type Phase = "bad" | "idle" | "joining" | "live" | "over";

/** What this page saw in the room, shown at the side and kept on window.__standin for a headless run. */
interface Seen {
  phase: Phase;
  message: string;
  game: string;
  picture: string;
  pictureSize: string;
  sound: string;
  camera: string;
  microphone: string;
}

const read = readStandInHash(window.location.hash);
const facts = read.ok ? tokenFacts(read.seat.token) : null;
const firstProblem = read.ok ? seatProblem(read.seat, Date.now()) : read.why;
const START: Seen = {
  phase: firstProblem === null ? "idle" : "bad", message: firstProblem ?? "",
  game: "not seen yet", picture: "not seen yet", pictureSize: "", sound: "not seen yet", camera: "not sent yet", microphone: "not sent yet",
};

/** A track's name beside the name the game should have used, so a mismatch is plain to see. */
const named = (name: string, wanted: string): string => (name === wanted ? `yes, named ${name}` : `yes, named "${name}" (the game's is ${wanted})`);

function Page() {
  const [seen, setSeen] = useState<Seen>(START);
  const [muted, setMuted] = useState(false);
  const room = useRef<Room | null>(null);
  const over = useRef(false);
  const game = useRef<HTMLVideoElement>(null);
  const self = useRef<HTMLVideoElement>(null);
  const sound = useRef<HTMLAudioElement>(null);
  const note = (change: Partial<Seen>): void => { setSeen((before) => ({ ...before, ...change })); };

  useEffect(() => { (window as unknown as { __standin: Seen }).__standin = seen; }, [seen]);

  const end = (message: string): void => {
    if (over.current) return;
    over.current = true;
    note({ phase: "over", message });
    void room.current?.disconnect().catch(() => undefined);
    room.current = null;
  };

  // Closing the window is hanging up: the game sees the friend leave.
  useEffect(() => {
    const leave = (): void => { void room.current?.disconnect().catch(() => undefined); };
    window.addEventListener("pagehide", leave);
    return () => { window.removeEventListener("pagehide", leave); };
  }, []);

  const answer = async (): Promise<void> => {
    if (!read.ok || room.current) return;
    const seat = read.seat;
    const problem = seatProblem(seat, Date.now());
    if (problem !== null) { note({ phase: "bad", message: problem }); return; }
    over.current = false;
    note({ phase: "joining", message: "Joining the room..." });
    try {
      const { Room: LivekitRoom, RoomEvent, Track } = await import("livekit-client");
      const joined = new LivekitRoom({ adaptiveStream: false, dynacast: false });
      room.current = joined;
      joined.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        if (track.kind === Track.Kind.Video) {
          if (game.current) track.attach(game.current);
          note({ game: participant.identity, picture: named(publication.trackName, TRACK_NAMES.video) });
        } else if (track.kind === Track.Kind.Audio) {
          if (sound.current) track.attach(sound.current);
          note({ game: participant.identity, sound: named(publication.trackName, TRACK_NAMES.audio) });
        }
      });
      joined.on(RoomEvent.TrackUnsubscribed, (track) => { track.detach(); });
      joined.on(RoomEvent.ParticipantConnected, (participant) => { note({ game: participant.identity }); });
      joined.on(RoomEvent.ParticipantDisconnected, (participant) => {
        end(`The game (${participant.identity}) left the room, so the call is over. This is how the game hangs up on a real call too.`);
      });
      // A room that was never joined also raises this; that case is told below, with what to check.
      let inRoom = false;
      joined.on(RoomEvent.Disconnected, () => { if (inRoom) end("The room was closed."); });
      await joined.connect(seat.url, seat.token);
      inRoom = true;
      const others = [...joined.remoteParticipants.values()].map((each) => each.identity);
      note({
        phase: "live",
        message: others.length > 0 ? "" : "Nobody else is in the room. Is the game still on \"Waiting for the stand-in friend\"? If it gave up, start the test again there.",
        ...(others.length > 0 ? { game: others.join(", ") } : {}),
      });

      // Each on its own: with no microphone the picture still goes out, and the game reads only the picture.
      try {
        await joined.localParticipant.setCameraEnabled(true);
        const mine = joined.localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack;
        if (mine && self.current) mine.attach(self.current);
        note({ camera: "yes" });
      } catch {
        note({ camera: "NO. The camera was not allowed or not found. The game counts the call as answered only when it sees this camera, so it will give up after a minute. Allow the camera for this page and reload." });
      }
      try {
        await joined.localParticipant.setMicrophoneEnabled(true);
        note({ microphone: "yes" });
      } catch {
        note({ microphone: "no (not allowed or not found). The game will not hear you; the rest still works." });
      }
    } catch (error) {
      room.current = null;
      if (over.current) return;
      // The token is never shown, whatever the error quotes.
      const detail = (error instanceof Error ? error.message : String(error)).split(seat.token).join("[token]").slice(0, 300);
      note({
        phase: "bad",
        message: `The room could not be joined. Check that LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET on the game server are from the same LiveKit project, and that this computer is online. (${detail})`,
      });
    }
  };

  const toggleMute = (): void => {
    const next = !muted;
    setMuted(next);
    void room.current?.localParticipant.setMicrophoneEnabled(!next).catch(() => undefined);
  };

  const live = seen.phase === "live";
  return (
    <main className="si">
      <div className="si__phone">
        <div className="si__screen">
          <video
            ref={game} className="si__game" autoPlay playsInline muted
            onResize={(event) => { note({ pictureSize: `${String(event.currentTarget.videoWidth)} x ${String(event.currentTarget.videoHeight)}` }); }}
          />
          {live && <video ref={self} className="si__self" autoPlay playsInline muted />}
          <audio ref={sound} autoPlay />
          {seen.phase === "idle" && (
            <div className="si__cover">
              <p className="si__caller">Odyssey Dojo</p>
              <p>FaceTime Video (stand-in)</p>
              <button type="button" className="si__answer" onClick={() => { void answer(); }}>Answer</button>
            </div>
          )}
          {seen.phase === "joining" && <div className="si__cover"><p>Joining the room...</p></div>}
          {seen.phase === "over" && <div className="si__cover"><p className="si__caller">Call ended</p></div>}
          {seen.phase === "bad" && <div className="si__cover"><p className="si__caller">No call</p></div>}
          {live && (
            <div className="si__keys">
              <button type="button" aria-pressed={muted} onClick={toggleMute}>{muted ? "Unmute" : "Mute"}</button>
              <button type="button" className="si__end" onClick={() => { end("You hung up. The game should say \"Your friend hung up.\""); }}>Hang up</button>
            </div>
          )}
        </div>
      </div>

      <section className="si__side">
        <h1>Stand-in friend&apos;s phone</h1>
        <p>This window plays the friend&apos;s iPhone. It sits in the call&apos;s room where the FaceTime bridge would. No phone rings and the call service is not used.</p>
        {seen.message !== "" && <p className={`si__notice${seen.phase === "bad" ? " si__notice--bad" : ""}`} role={seen.phase === "bad" ? "alert" : "status"}>{seen.message}</p>}
        {seen.phase === "idle" && <p>Press Answer and allow the camera and the microphone. Keep the game&apos;s window visible beside this one. Wear headphones, or press Mute, to stop the game&apos;s sound from looping.</p>}
        {read.ok && (
          <dl className="si__facts">
            <dt>Room</dt><dd>{read.seat.room}</dd>
            <dt>Joined as</dt><dd>{facts?.identity ?? "unknown"}</dd>
            <dt>Game in the room</dt><dd>{seen.game}</dd>
            <dt>Game&apos;s picture</dt><dd>{seen.picture}{seen.pictureSize !== "" ? `, ${seen.pictureSize}` : ""}</dd>
            <dt>Game&apos;s sound</dt><dd>{seen.sound}</dd>
            <dt>My camera sent</dt><dd>{seen.camera}</dd>
            <dt>My microphone sent</dt><dd>{seen.microphone}</dd>
          </dl>
        )}
        <p className="si__small">
          The ready sign is not sent. A real bridge writes it into the room&apos;s metadata, and a participant&apos;s token cannot do that.
          The game greets {String(BRIDGE_FALLBACK_MS / 1000)} seconds after it sees this camera instead: three rising notes, then Athena.
        </p>
        <p className="si__small">Step back until your upper body is in the small picture, then strike when the card in the phone asks.</p>
      </section>
    </main>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<StrictMode><Page /></StrictMode>);
