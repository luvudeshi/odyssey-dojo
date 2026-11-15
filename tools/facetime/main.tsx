// The FaceTime call with the far end faked inside this page: open /tools/facetime/index.html on the dev server.
// No account, no phone, no network. What is real: the card, the call's session and clocks, the friend's link into
// a real fight (FightScreen), the reader that turns a remote video track into frames, the picture and the sound
// that would be published, and the published video track itself, shown in the phone-shaped box.
// What is made up:
//  - the room (src/facetime/fakeRoom.ts) and the server (it always says yes);
//  - the friend: a stick body drawn on a canvas, whose captured stream is handed over as the remote camera track.
//    A drawn stick body is not a person to the pose model, so here the "model" is the page itself: it reads the
//    remote picture (and counts the lit pixels, to show the picture really arrived) and answers with the pose it
//    knows it drew. The real pose model on a real FaceTime picture is NOT exercised by this page.
// In the address: ?frame=landscape sends the wide picture; ?left=20 starts the call clock with 20 seconds left,
// to see the goodbye and the end; ?auto=0 leaves the buttons to you.
import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { guideFor } from "../../src/coach/guide";
import type { CombatInput, CombatState, PoseFrame } from "../../src/core/types";
import { ENEMIES } from "../../src/enemies/registry";
import type { FaceTimeApi } from "../../src/facetime/api";
import { drive } from "../../src/facetime/browserSession";
import { startCallAudio } from "../../src/facetime/callAudio";
import type { CallAudio } from "../../src/facetime/callAudio";
import { CALL_CAP_MS } from "../../src/facetime/callMachine";
import { startCompositor } from "../../src/facetime/compositor";
import { createFakeRoom } from "../../src/facetime/fakeRoom";
import type { PoseDetector } from "../../src/facetime/remotePlayer";
import { createRemotePlayer } from "../../src/facetime/remotePlayer";
import { createFaceTimeSession } from "../../src/facetime/session";
import { FaceTimeCard } from "../../src/facetime/ui/FaceTimeCard";
import { createPoseInput } from "../../src/input/poseInput";
import { MOVES } from "../../src/moves/registry";
import type { HostLink } from "../../src/net/host";
import { rating } from "../../src/pose/quality";
import { JOINT, pushFrame } from "../../src/pose/signals";
import { FightScreen } from "../../src/screens/FightScreen";
import { STYLES } from "../../src/styles/registry";
import "../../src/index.css";
import { GOOD, effortFrame } from "../dojo/player";
import "./page.css";

const query = new URLSearchParams(window.location.search);
const shape = query.get("frame") === "landscape" ? "landscape" : "portrait";
const auto = query.get("auto") !== "0";
const startLeft = Number(query.get("left")) || 0;
const enemy = ENEMIES.find((each) => each.id === (query.get("enemy") ?? "polyphemus")) ?? ENEMIES[0];
const style = STYLES.find((each) => each.id === (query.get("style") ?? "boxer")) ?? STYLES[0];
const FAKE_NUMBER = "+1 555 555 0100";

/** What the page shows about itself, also on window.__ft for a headless run. */
interface Meter { phase: string; strikes: number; pictures: number; lit: number; peak: number; fight: string }
const meter: Meter = { phase: "idle", strikes: 0, pictures: 0, lit: 0, peak: 0, fight: "" };
(window as unknown as { __ft: Meter }).__ft = meter;

const BONES: readonly (readonly [number, number])[] = [
  [JOINT.leftShoulder, JOINT.rightShoulder], [JOINT.leftShoulder, JOINT.leftElbow], [JOINT.leftElbow, JOINT.leftWrist],
  [JOINT.rightShoulder, JOINT.rightElbow], [JOINT.rightElbow, JOINT.rightWrist], [JOINT.leftShoulder, JOINT.leftHip],
  [JOINT.rightShoulder, JOINT.rightHip], [JOINT.leftHip, JOINT.rightHip], [JOINT.leftHip, JOINT.leftKnee],
  [JOINT.leftKnee, JOINT.leftAnkle], [JOINT.rightHip, JOINT.rightKnee], [JOINT.rightKnee, JOINT.rightAnkle],
];

/** The made-up friend: stands in the asked move's start pose, and throws it a moment after the card says strike. */
function madeUpFriend(read: () => { move: string | null }) {
  const canvas = document.createElement("canvas");
  canvas.width = 360;
  canvas.height = 640;
  const ctx = canvas.getContext("2d");
  let moveId = style?.strikes[0] ?? "jab";
  let asked: string | null = null;
  let beganAt = 0;
  let latest: PoseFrame | null = null;
  const draw = (now: number): void => {
    const want = read().move;
    if (want !== null && asked === null) beganAt = now;
    asked = want;
    if (want !== null) moveId = want;
    const move = MOVES.get(moveId);
    const guide = move ? guideFor(move) : null;
    if (!guide || !ctx) return;
    // 350 ms to react, as a person would, and another try every 1.8 s while the card still asks.
    latest = effortFrame(guide, GOOD, now, asked === null ? -1 : ((now - beganAt) % 1800) - 350);
    ctx.fillStyle = "#26323c";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#3d4d59";
    ctx.fillRect(0, canvas.height * 0.72, canvas.width, canvas.height * 0.28);
    // The frame's picture is mirrored (the player's left at the left); a camera sends it unmirrored, so flip it back.
    const at = (index: number): readonly [number, number] => {
      const point = latest?.image[index];
      return [(1 - (point?.x ?? 0.5)) * canvas.width * 1.2 - canvas.width * 0.1, (point?.y ?? 0.5) * canvas.height * 0.8 + canvas.height * 0.1];
    };
    ctx.strokeStyle = "#ffd9a0";
    ctx.lineWidth = 12;
    ctx.lineCap = "round";
    for (const [a, b] of BONES) {
      const [ax, ay] = at(a), [bx, by] = at(b);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
    const [hx, hy] = at(JOINT.nose);
    ctx.fillStyle = "#ffd9a0";
    ctx.beginPath();
    ctx.arc(hx, hy, 26, 0, Math.PI * 2);
    ctx.fill();
  };
  const track = canvas.captureStream(30).getVideoTracks()[0];
  if (!track) throw new Error("no made-up camera");
  return { canvas, track, draw, frame: () => latest };
}

function Page() {
  const [link, setLink] = useState<HostLink | null>(null);
  const [, setBeat] = useState(0);
  const phone = useRef<HTMLVideoElement>(null);
  const friendBox = useRef<HTMLDivElement>(null);
  const sound = useRef<CallAudio | null>(null);

  const made = useMemo(() => {
    const room = createFakeRoom();
    const api: FaceTimeApi = {
      status: () => Promise.resolve({ ready: true, missing: [], standIn: false }),
      seat: () => Promise.resolve({ ok: true, value: { url: "wss://loopback.invalid", token: "loopback", room: "odyssey-dojo-000000000000", identity: "odyssey-dojo" } }),
      call: () => Promise.resolve({ ok: true, value: { callId: "loopback-call" } }),
      callState: () => Promise.resolve("active"),
      standIn: () => Promise.resolve({ ok: false, why: "not_set_up", message: "The loopback page has no real room." }),
    };
    let asked: string | null = null;
    const friend = madeUpFriend(() => ({ move: asked }));
    const detector: PoseDetector = {
      detect(picture) {
        // Proof the remote picture arrived: count the pixels of the body's colour on the canvas the model would read.
        const data = picture.getContext("2d")?.getImageData(0, 0, picture.width, picture.height).data;
        let lit = 0;
        if (data) for (let i = 0; i < data.length; i += 16) if ((data[i] ?? 0) > 200 && (data[i + 2] ?? 0) < 200) lit += 1;
        meter.pictures += 1;
        meter.lit = lit;
        return lit > 20 ? friend.frame() : null;
      },
      close: () => undefined,
    };
    const readPose = createPoseInput(MOVES);
    const session = createFaceTimeSession({
      api,
      openRoom: () => Promise.resolve(room),
      startPicture: () => startCompositor(shape),
      startSound: () => { sound.current = startCallAudio({ microphone: false }); return sound.current; },
      watchFriend: (track) => Promise.resolve(createRemotePlayer(track, detector)),
      poseReader: () => (history): CombatInput => {
        const input = readPose(history);
        meter.strikes += input.struck.length;
        return input;
      },
      pushFrame,
      moves: MOVES,
      enemies: ENEMIES,
      rate: rating,
    });
    return { room, session, friend, setAsked: (move: string | null) => { asked = move; } };
  }, []);

  // ?left=20: the page's clock jumps ahead once the friend is greeted, as if the call had run most of its five minutes.
  const ahead = useRef(0);
  useEffect(() => drive(made.session, () => performance.now() + ahead.current), [made]);
  /** The state the host publishes, kept so the made-up friend and the made-up host know what the fight asks for. */
  const latestState = useRef<CombatState | null>(null);

  // The far end and the host's own defends, played by the page.
  useEffect(() => {
    let handle = 0;
    let answered = false;
    let ringingSince: number | null = null;
    let defended: string | null = null;
    const loop = (now: number): void => {
      const session = made.session;
      const phase = session.state().phase;
      meter.phase = phase;
      meter.peak = Math.max(meter.peak, sound.current?.level() ?? 0);
      made.friend.draw(now);
      if (phase === "ringing" && ringingSince === null) ringingSince = now;
      // The friend "answers" 1.5 s after the phone rings: their camera arrives, then the bridge says it is ready.
      if (phase === "ringing" && !answered && ringingSince !== null && now - ringingSince > 1500) {
        answered = true;
        made.room.emit({ type: "video", track: made.friend.track, identity: "facetime-bridge" });
        made.room.emit({ type: "metadata", metadata: JSON.stringify({ chert_bridge_ready: true }) });
      }
      if (startLeft > 0 && ahead.current === 0 && (phase === "greeted" || phase === "playing")) ahead.current = CALL_CAP_MS - startLeft * 1000;
      const video = made.room.published.video;
      if (phone.current && video && phone.current.srcObject === null) {
        phone.current.srcObject = new MediaStream([video]);
        void phone.current.play().catch(() => undefined);
      }
      // What the fight asks for now, read from the link as the phone's side sees it.
      const state = latestState.current;
      const kind = state?.phase.kind;
      meter.fight = kind ?? "";
      made.setAsked(state && (state.phase.kind === "strike" || state.phase.kind === "finisher") ? state.phase.move : null);
      // The host has no camera here: press the right defend key for them.
      const counter = state?.phase.kind === "defend" ? state.phase.attack.counter : null;
      if (counter !== defended) {
        const release = defended === null ? null : MOVES.get(defended)?.key;
        if (release) window.dispatchEvent(new KeyboardEvent("keyup", { key: release }));
        const press = counter === null ? null : MOVES.get(counter)?.key;
        if (press) window.dispatchEvent(new KeyboardEvent("keydown", { key: press }));
        defended = counter;
      }
      setBeat((n) => (n + 1) % 1_000_000);
      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(handle); };
  }, [made]);

  const watched = useMemo(() => {
    if (!link) return null;
    const wrapped: HostLink = {
      ...link,
      publish(state, events, now) { latestState.current = state; link.publish(state, events, now); },
    };
    return wrapped;
  }, [link]);

  useEffect(() => {
    const box = friendBox.current;
    if (!box) return;
    box.append(made.friend.canvas);
    return () => { made.friend.canvas.remove(); };
  }, [made]);

  // ?auto=1 (the default): dial the fake number, then start the fight once the friend has been greeted.
  useEffect(() => {
    if (!auto) return;
    const timer = window.setInterval(() => {
      const phase = made.session.state().phase;
      if (phase === "idle") void made.session.dial(FAKE_NUMBER, performance.now() + ahead.current);
      if (phase === "greeted" && !link) setLink(made.session.link());
    }, 400);
    return () => { window.clearInterval(timer); };
  }, [made, link]);

  if (!enemy || !style) return <p>No enemy or style found.</p>;
  return (
    <div className={`ft-demo ft-demo--${shape}`}>
      <div className="ft-demo__game">
        {watched ? (
          <FightScreen
            enemy={enemy} style={style} tracker={null} seed={7} link={watched}
            renderEnd={(won) => <p className="notice">{won ? "The loopback fight is won." : "The loopback fight is lost."}</p>}
          />
        ) : (
          <main className="menu menu--rooms ft-demo__menu">
            <div className="rooms">
              <FaceTimeCard session={made.session} status={() => Promise.resolve({ ready: true, missing: [] })} onStart={setLink} />
            </div>
          </main>
        )}
      </div>
      <aside className="ft-demo__side">
        <div className="ft-demo__phone">
          <video ref={phone} muted playsInline />
        </div>
        <p className="ft-demo__label">What the friend sees (the published video track)</p>
        <div className="ft-demo__friend" ref={friendBox} />
        <p className="ft-demo__label">The friend&apos;s camera (made up)</p>
        <p className="ft-demo__meter" data-testid="meter">
          call: {meter.phase} | fight: {meter.fight || "none"} | pictures read: {meter.pictures} | strikes from the phone: {meter.strikes} | sound peak: {meter.peak.toFixed(2)}
        </p>
      </aside>
    </div>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root element");
createRoot(root).render(<StrictMode><Page /></StrictMode>);
