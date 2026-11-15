// The page's one answerer (answer.ts), with the real room, the real server and a timer. Like the page's session
// (browserSession.ts) it outlives the Multiplayer card: the game stays in the waiting room through the map and a
// fight, and goes to the next waiting room after each call.
import { sharedAudioContext } from "../audio/sfx";
import { log } from "../core/log";
import { createAnswerer, createWaitingApi } from "./answer";
import type { Answerer } from "./answer";
import { faceTimeSession } from "./browserSession";
import { openLivekitRoom } from "./livekitRoom";

const TICK_MS = 500;

/**
 * What a browser only gives after a click, asked for at the press of "Wait for a FaceTime call", so nothing has to
 * be asked while the phone is connecting: the sound may play, and the microphone is allowed (it is let go at once;
 * the call takes it again when it starts, inside its one sound track).
 */
function prime(): void {
  void sharedAudioContext()?.resume().catch(() => undefined);
  // Not there on a page that is not served securely (another device on the network, over plain http).
  const devices = (navigator as { mediaDevices?: MediaDevices }).mediaDevices;
  if (!devices) return;
  devices.getUserMedia({ audio: true }).then(
    (stream) => { stream.getTracks().forEach((each) => { each.stop(); }); },
    (error: unknown) => { log("warn", "facetime_no_microphone", error); },
  );
}

let shared: Answerer | null = null;

/** The page's one answerer, made on first use. */
export function faceTimeAnswerer(): Answerer {
  if (shared) return shared;
  const answerer = createAnswerer({ waiting: createWaitingApi(), openRoom: openLivekitRoom, session: faceTimeSession(), prime });
  let timer = 0;
  answerer.subscribe(() => {
    const on = answerer.state().phase !== "off";
    if (on && timer === 0) timer = window.setInterval(() => { answerer.tick(performance.now()); }, TICK_MS);
    else if (!on && timer !== 0) {
      window.clearInterval(timer);
      timer = 0;
    }
  });
  // Closing the page leaves the waiting room. (A call that is on is hung up by the session's own listener.)
  window.addEventListener("pagehide", () => { answerer.stop(performance.now()); });
  shared = answerer;
  return answerer;
}
