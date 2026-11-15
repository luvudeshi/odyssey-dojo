// The god scan screen: one picture of the player, then the god hiding in them. Mount it and wait for onDone.
// Works with no camera, no server and no network: each missing piece only shortens the path to the reveal.
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { PoseFrame } from "../../core/types";
import { JOINT } from "../../pose/signals";
import type { PoseTracker } from "../../pose/tracker";
import { emblemPortrait, firstPortrait } from "../gods/emblem";
import { GODS } from "../gods/gods";
import type { GodId } from "../gods/gods";
import { renderPortrait } from "../gods/portrait";
import { clothingTint } from "../gods/tint";
import { revealGod } from "../revealGod";
import type { GodReveal } from "../revealGod";
import { Button, Panel, PebbleHeading, installGround } from "../../ui/pebble";
import "./reveal.css";

type Step =
  | { readonly kind: "ask" }
  | { readonly kind: "pose"; readonly left: number }
  | { readonly kind: "reading" }
  | { readonly kind: "revealed"; readonly reveal: GodReveal; readonly portrait: string | null };

interface Shot {
  readonly snapshot: string;
  readonly pixels: ImageData;
  /** The picture itself, kept so the marble portrait is of the pose the player struck, not of a later moment. */
  readonly canvas: HTMLCanvasElement;
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
      canvas,
    };
  } catch {
    return null;
  }
}

/** The player as a marble bust in the god's colours: what they see when the AI's portrait does not arrive. */
function marblePortrait(god: GodId, shot: Shot, pose: PoseFrame | null): string {
  const nose = pose?.image[JOINT.nose];
  const leftShoulder = pose?.image[JOINT.leftShoulder];
  const rightShoulder = pose?.image[JOINT.rightShoulder];
  const options = { accent: GODS[god].accent };
  const marble = renderPortrait(
    shot.canvas,
    shot.canvas.width,
    shot.canvas.height,
    nose && leftShoulder && rightShoulder ? { ...options, pose: { nose, leftShoulder, rightShoulder } } : options,
  );
  return marble ?? shot.snapshot;
}

export function RevealScreen(props: {
  /** The running camera, or null for keyboard play: the god is then drawn by lot. */
  tracker: PoseTracker | null;
  onDone: (reveal: GodReveal) => void;
  /** Called once the god is on screen, so a host can stop its own time limit. */
  onRevealed?: () => void;
}) {
  const { tracker, onDone, onRevealed } = props;
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
    void revealGod(
      {
        snapshot: shot?.snapshot ?? null,
        frame: pose,
        tint: shot ? clothingTint(shot.pixels, pose) : null,
        seed: Date.now(),
      },
      // No picture (the lot, or a camera with nothing to show yet): the god's own emblem stands in for the portrait.
      { drawPortrait: (god) => (shot ? marblePortrait(god, shot, pose) : emblemPortrait(god)) },
    ).then((reveal) => {
      if (!alive.current) return;
      setStep({ kind: "revealed", reveal, portrait: firstPortrait(reveal.god, shot !== null) });
      onRevealed?.();
      void reveal.portrait.then((portrait) => {
        const picture = portrait ?? emblemPortrait(reveal.god);
        if (alive.current) setStep((now) => (now.kind === "revealed" && now.reveal === reveal ? { ...now, portrait: picture } : now));
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
  }, [step, tracker]);

  if (step.kind === "ask") {
    return (
      <Frame title="Which god hides in you?">
        <p className="reveal-kicker">In the Odyssey the gods walk among mortals in disguise.</p>
        {tracker ? (
          <>
            <p>Strike a pose worthy of Olympus. The oracle reads your stance and your colours.</p>
            <div className="reveal-buttons">
              <Button primary onClick={() => { setStep({ kind: "pose", left: COUNTDOWN_SECONDS }); }}>Reveal my god</Button>
              <Button className="reveal-quiet" onClick={() => { scan(null); }}>Cast the lot instead (no picture)</Button>
            </div>
            <p className="reveal-small">
              One picture is taken and sent to Google Gemini to choose your god. It is not saved. With no network, the
              choice is made on this laptop.
            </p>
          </>
        ) : (
          <>
            <p>No camera, so the lots are shaken in a bronze helmet, as Odysseus&apos;s crew cast them.</p>
            <div className="reveal-buttons"><Button primary onClick={() => { scan(null); }}>Cast the lot</Button></div>
          </>
        )}
      </Frame>
    );
  }

  if (step.kind === "pose") {
    return (
      <Frame title="Strike your pose">
        <div className="reveal-preview" ref={preview} />
        <div className="reveal-count" key={step.left}>{step.left}</div>
      </Frame>
    );
  }

  if (step.kind === "reading") {
    return (
      <Frame title="The oracle is reading you" titleClass="reveal-pulse">
        <p>A god stirs behind the disguise.</p>
      </Frame>
    );
  }

  // A null portrait here only ever means "still coming": with no picture taken the emblem is there from the start.
  const { reveal, portrait } = step;
  const god = GODS[reveal.god];
  return (
    <Frame title={god.name} titleClass="reveal-name" accent={god.accent} kicker="A god walks among us in disguise">
      <div className={`reveal-portrait${portrait === null ? " reveal-empty" : ""}`}>
        {portrait !== null && <img src={portrait} alt="" />}
      </div>
      <p className="reveal-epithet">{reveal.epithet}</p>
      <p className="reveal-domain">{god.domain}</p>
      <p className="reveal-reason">{reveal.reason}</p>
      <p className="reveal-power">
        <strong>{god.power.name}</strong> is yours: {god.power.blurb}
      </p>
      <p className="reveal-small">{GODS[reveal.rivalGod].name} has seen you, and sends monsters against you.</p>
      <div className="reveal-buttons"><Button primary onClick={() => { onDone(reveal); }}>Begin the journey</Button></div>
    </Frame>
  );
}

/** One pebble panel on the dark ground; the title is the page's h1, set in stones. */
function Frame(props: { title: string; titleClass?: string; accent?: string; kicker?: string; children: ReactNode }) {
  useEffect(() => { installGround(); }, []);
  return (
    <main className="reveal" style={props.accent === undefined ? undefined : { ["--god" as string]: props.accent }}>
      <Panel ornament className="reveal-panel">
        {props.kicker !== undefined && <p className="reveal-kicker">{props.kicker}</p>}
        <PebbleHeading as="h1" className={props.titleClass ?? ""} text={props.title} px={props.title.length <= 12 ? 52 : props.title.length > 22 ? 32 : 40} tone="ochre" />
        {props.children}
      </Panel>
    </main>
  );
}
