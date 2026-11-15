// The one FaceTime session of this page, with the real room, camera reader, picture, sound and timers.
// It outlives the Multiplayer card (which leaves the screen when the fight starts), so the call carries on through
// the style pick, the map and the fight. While the friend is on the line a small plate on the host's screen shows
// the time left and a hang up button; it is plain DOM added to the page, so no screen has to mount it.
// When the call ends or fails in the middle of a fight the plate stays a few seconds and says why.
import { createPoseInput } from "../input/poseInput";
import { ENEMIES } from "../enemies/registry";
import { MOVES } from "../moves/registry";
import { rating } from "../pose/quality";
import { pushFrame } from "../pose/signals";
import { createFaceTimeApi } from "./api";
import { startCallAudio } from "./callAudio";
import { PLATE_LINGER_MS, callMsLeft, clock as showClock, isLive, isOpen, partingLine } from "./callMachine";
import { startCompositor } from "./compositor";
import type { FrameShape } from "./frameLayout";
import { openLivekitRoom } from "./livekitRoom";
import { createRemotePlayer, mediapipeDetector } from "./remotePlayer";
import { createFaceTimeSession } from "./session";
import type { FaceTimeSession, SessionDeps } from "./session";
import "./ui/faceTimeCard.css";

const TICK_MS = 250;

/** ?ftframe=landscape sends a wide picture, for a phone held sideways. */
function frameShape(): FrameShape {
  return new URLSearchParams(window.location.search).get("ftframe") === "landscape" ? "landscape" : "portrait";
}

export function browserDeps(): SessionDeps {
  return {
    api: createFaceTimeApi(),
    openRoom: openLivekitRoom,
    startPicture: () => startCompositor(frameShape()),
    // When src/audio exports gameSoundStream(), this becomes startCallAudio({ gameSound: gameSoundStream }).
    startSound: () => startCallAudio(),
    watchFriend: async (track) => createRemotePlayer(track, await mediapipeDetector()),
    poseReader: () => createPoseInput(MOVES),
    pushFrame,
    moves: MOVES,
    enemies: ENEMIES,
    rate: rating,
  };
}

/**
 * Runs `session` on the page's clocks while a call is open, and shows the host's plate. Returns a function that
 * stops both. `clock` is the time in milliseconds; the demo page passes its own to jump ahead.
 */
export function drive(session: FaceTimeSession, clock: () => number = () => performance.now()): () => void {
  let frame = 0;
  let timer = 0;
  let plate: HTMLDivElement | null = null;
  let time: HTMLSpanElement | null = null;
  /** A plate that is saying why the call is over, and the timer that takes it away. */
  let parting: { readonly plate: HTMLDivElement; readonly timer: number } | null = null;
  let inFight = false;

  const dropParting = (): void => {
    if (!parting) return;
    window.clearTimeout(parting.timer);
    parting.plate.remove();
    parting = null;
  };

  const showPlate = (): void => {
    const state = session.state();
    if (!isLive(state)) {
      const gone = plate;
      plate = null;
      time = null;
      if (!gone) return;
      const line = partingLine(inFight, state, clock());
      inFight = false;
      if (line === null) { gone.remove(); return; }
      // In a fight the card is not on screen: without this the host would keep talking to nobody.
      const name = document.createElement("span");
      name.textContent = "FaceTime";
      const why = document.createElement("span");
      why.className = "ft-plate__time";
      why.textContent = line;
      gone.replaceChildren(name, why);
      gone.classList.remove("ft-plate--late");
      gone.classList.add("ft-plate--over");
      dropParting();
      parting = { plate: gone, timer: window.setTimeout(() => { if (parting?.plate === gone) dropParting(); }, PLATE_LINGER_MS) };
      return;
    }
    inFight = state.phase === "playing";
    if (!plate) {
      dropParting();
      plate = document.createElement("div");
      plate.className = "ft-plate";
      plate.setAttribute("role", "status");
      const name = document.createElement("span");
      name.textContent = "FaceTime";
      time = document.createElement("span");
      time.className = "ft-plate__time";
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Hang up";
      button.addEventListener("click", () => { session.hangUp(clock()); });
      plate.append(name, time, button);
      document.body.append(plate);
    }
    const left = callMsLeft(session.state(), clock()) ?? 0;
    if (time) time.textContent = `${showClock(left)} left`;
    plate.classList.toggle("ft-plate--late", left <= 30_000);
  };

  const loop = (): void => {
    session.frame(clock());
    frame = requestAnimationFrame(loop);
  };
  const sync = (): void => {
    const open = isOpen(session.state());
    if (open && timer === 0) {
      frame = requestAnimationFrame(loop);
      timer = window.setInterval(() => { session.tick(clock()); showPlate(); }, TICK_MS);
    } else if (!open && timer !== 0) {
      cancelAnimationFrame(frame);
      window.clearInterval(timer);
      timer = 0;
    }
    showPlate();
  };
  const unsubscribe = session.subscribe(sync);
  sync();
  return () => {
    unsubscribe();
    cancelAnimationFrame(frame);
    window.clearInterval(timer);
    timer = 0;
    plate?.remove();
    dropParting();
  };
}

let shared: FaceTimeSession | null = null;

/** The page's one session, made on first use. */
export function faceTimeSession(): FaceTimeSession {
  if (!shared) {
    shared = createFaceTimeSession(browserDeps());
    drive(shared);
    // Closing the page hangs up, so the line is not left busy for the next call.
    window.addEventListener("pagehide", () => { shared?.hangUp(performance.now()); });
  }
  return shared;
}
