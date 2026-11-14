// The god scan screen: one picture of the player, then the god hiding in them. Mount it and wait for onDone.
// Works with no camera, no server and no network: each missing piece only shortens the path to the reveal.
import { useEffect, useRef, useState } from "react";
import type { PoseFrame } from "../../core/types";
import type { PoseTracker } from "../../pose/tracker";
import { GODS } from "../gods/gods";
import type { GodId } from "../gods/gods";
import { clothingTint } from "../gods/tint";
import { revealGod } from "../revealGod";
import type { GodReveal } from "../revealGod";
import "./reveal.css";

type Step =
  | { readonly kind: "ask" }
  | { readonly kind: "pose"; readonly left: number }
  | { readonly kind: "reading" }
  | { readonly kind: "revealed"; readonly reveal: GodReveal; readonly portrait: string | null };

interface Shot {
  readonly snapshot: string;
  readonly pixels: ImageData;
}

const COUNTDOWN_SECONDS = 3;
const SNAPSHOT_WIDTH = 640;

/** One JPEG of what the camera sees now, small enough to send. Null if the camera has no picture yet. */
function capture(video: HTMLVideoElement): Shot | null {
  try {
    const scale = Math.min(1, SNAPSHOT_WIDTH / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context || canvas.width < 2 || canvas.height < 2) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return {
      snapshot: canvas.toDataURL("image/jpeg", 0.85),
      pixels: context.getImageData(0, 0, canvas.width, canvas.height),
    };
  } catch {
    return null;
  }
}

export function RevealScreen(props: {
  /** The running camera, or null for keyboard play: the god is then drawn by lot. */
  tracker: PoseTracker | null;
  onDone: (reveal: GodReveal) => void;
  /** Draws the portrait in the browser when the AI's does not arrive. Left out: the plain snapshot is shown. */
  drawPortrait?: (god: GodId, video: HTMLVideoElement, frame: PoseFrame | null) => string | null;
}) {
  const { tracker, onDone, drawPortrait } = props;
  const [step, setStep] = useState<Step>({ kind: "ask" });
  const frame = useRef<PoseFrame | null>(null);
  const preview = useRef<HTMLDivElement>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // Show the player to themselves while they pose, and keep their latest pose for the scan.
  useEffect(() => {
    const holder = preview.current;
    if (!tracker || !holder || step.kind !== "pose") return;
    holder.append(tracker.video);
    let handle = requestAnimationFrame(function watch() {
      frame.current = tracker.read() ?? frame.current;
      handle = requestAnimationFrame(watch);
    });
    return () => {
      cancelAnimationFrame(handle);
      tracker.video.remove();
    };
  }, [tracker, step.kind]);

  const scan = (shot: Shot | null): void => {
    setStep({ kind: "reading" });
    const pose = frame.current;
    const video = tracker?.video;
    void revealGod(
      {
        snapshot: shot?.snapshot ?? null,
        frame: pose,
        tint: shot ? clothingTint(shot.pixels, pose) : null,
        seed: Date.now(),
      },
      { drawPortrait: (god) => (video ? (drawPortrait?.(god, video, pose) ?? shot?.snapshot ?? null) : null) },
    ).then((reveal) => {
      if (!alive.current) return;
      setStep({ kind: "revealed", reveal, portrait: null });
      void reveal.portrait.then((portrait) => {
        if (alive.current) setStep((now) => (now.kind === "revealed" && now.reveal === reveal ? { ...now, portrait } : now));
      });
    });
  };

  // The countdown: one tick a second, then the picture.
  useEffect(() => {
    if (step.kind !== "pose") return;
    const timer = setTimeout(() => {
      if (step.left > 1) setStep({ kind: "pose", left: step.left - 1 });
      else scan(tracker ? capture(tracker.video) : null);
    }, 1000);
    return () => { clearTimeout(timer); };
    // scan only reads refs and props that cannot change during a countdown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, tracker]);

  if (step.kind === "ask") {
    return (
      <main className="menu reveal">
        <p className="reveal-kicker">In the Odyssey the gods walk among mortals in disguise.</p>
        <h1>Which god hides in you?</h1>
        {tracker ? (
          <>
            <p>Strike a pose worthy of Olympus. The oracle reads your stance and your colours.</p>
            <button onClick={() => { setStep({ kind: "pose", left: COUNTDOWN_SECONDS }); }}>Reveal my god</button>
            <button className="reveal-quiet" onClick={() => { scan(null); }}>Cast the lot instead (no picture)</button>
            <p className="reveal-small">
              One picture is taken and sent to Google Gemini to choose your god. It is not saved. With no network, the
              choice is made on this laptop.
            </p>
          </>
        ) : (
          <>
            <p>No camera, so the lots are shaken in a bronze helmet, as Odysseus&apos;s crew cast them.</p>
            <button onClick={() => { scan(null); }}>Cast the lot</button>
          </>
        )}
      </main>
    );
  }

  if (step.kind === "pose") {
    return (
      <main className="menu reveal">
        <h1>Strike your pose</h1>
        <div className="reveal-preview" ref={preview} />
        <div className="reveal-count" key={step.left}>{step.left}</div>
      </main>
    );
  }

  if (step.kind === "reading") {
    return (
      <main className="menu reveal">
        <h1 className="reveal-pulse">The oracle is reading you</h1>
        <p>A god stirs behind the disguise.</p>
      </main>
    );
  }

  const { reveal, portrait } = step;
  const god = GODS[reveal.god];
  return (
    <main className="menu reveal" style={{ ["--god" as string]: god.accent }}>
      <p className="reveal-kicker">A god walks among us in disguise</p>
      <div className={`reveal-portrait${portrait === null ? " reveal-empty" : ""}`}>
        {portrait !== null && <img src={portrait} alt="" />}
      </div>
      <h1 className="reveal-name">{god.name}</h1>
      <p className="reveal-epithet">{reveal.epithet}</p>
      <p className="reveal-domain">{god.domain}</p>
      <p className="reveal-reason">{reveal.reason}</p>
      <p className="reveal-power">
        <strong>{god.power.name}</strong> is yours: {god.power.blurb}
      </p>
      <p className="reveal-small">{GODS[reveal.rivalGod].name} has seen you, and sends monsters against you.</p>
      <button onClick={() => { onDone(reveal); }}>Begin the journey</button>
    </main>
  );
}
