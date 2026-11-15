// The guest's side of an online fight: no engine here. It draws the state the host sends (same Scene and HUD)
// and sends back this player's strikes from the webcam, the keyboard or the touch buttons.
import { useEffect, useRef, useState } from "react";
import { playEvent } from "../audio/sfx";
import { playVoice } from "../audio/voice";
import type { CombatState, PoseFrame, PoseHistory } from "../core/types";
import { ENEMIES } from "../enemies/registry";
import { PowerCircle } from "../hud/PowerCircle";
import { SkyHud } from "../hud/sky/SkyHud";
import { notePhase } from "../hud/PhaseBanner";
import { noteHit } from "../hud/RatingFlash";
import { TouchPad } from "../hud/TouchPad";
import { createKeyboard } from "../input/keyboard";
import { createPoseInput, mergeInputs } from "../input/poseInput";
import { MOVES } from "../moves/registry";
import type { GuestLink } from "../net/guest";
import { pushFrame } from "../pose/signals";
import type { PoseTracker } from "../pose/tracker";
import { noteInput } from "../render/battle";
import { Scene } from "../render/Scene";
import { STYLES } from "../styles/registry";
import { Button, WaveBorder, installGround } from "../ui/pebble";
import "./endPanel.css";
import type { Joined } from "./RoomJoin";
import { forgetSeat, tabStore } from "./seatStore";

interface Fight { readonly enemyId: string; readonly styleId: string; readonly seed: number }

function Notice(props: { line: string; onLeave: () => void; button: string }) {
  return (
    <main className="menu room">
      <h1>Fight together</h1>
      <p className="notice" role="status">{props.line}</p>
      <Button primary onClick={props.onLeave}>{props.button}</Button>
    </main>
  );
}

function Fighting(props: { link: GuestLink; fight: Fight; mode: Joined["mode"]; tracker: PoseTracker | null; onOver: () => void; onLeave: () => void }) {
  const { link, fight, mode, tracker, onLeave } = props;
  const enemy = ENEMIES.find((candidate) => candidate.id === fight.enemyId);
  const style = STYLES.find((candidate) => candidate.id === fight.styleId);
  const [state, setState] = useState<CombatState | null>(null);
  const poseRef = useRef<PoseFrame | null>(null);
  const touched = useRef<string[]>([]);
  useEffect(() => { installGround(); }, []);

  useEffect(() => {
    const keyboard = createKeyboard(MOVES);
    const readPose = createPoseInput(MOVES);
    let history: PoseHistory = { frames: [], baseline: null };
    let handle = 0;
    const tick = (now: number): void => {
      const frame = tracker?.read() ?? null;
      if (frame) {
        poseRef.current = frame;
        history = pushFrame(history, frame);
      }
      const taps = touched.current.map((move) => ({ move, quality: 0.7, player: 1 as const }));
      touched.current = [];
      const input = mergeInputs(mergeInputs(keyboard.read(), tracker ? readPose(history) : { held: new Set(), struck: [] }), { held: new Set(), struck: taps });
      noteInput(input, now / 1000);
      link.sendInput(input);
      const view = link.view();
      if (view) {
        view.events.forEach((event) => { playEvent(event); noteHit(event); notePhase(event); });
        playVoice(view.events, view.state.phase);
        setState(view.state);
      }
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(handle); keyboard.dispose(); };
  }, [link, tracker, fight]);

  // Told once per fight, when it is won or lost: the Account counts a room fight for the guest too.
  const ended = state?.phase.kind === "won" || state?.phase.kind === "lost";
  const onOver = useRef(props.onOver);
  useEffect(() => { onOver.current = props.onOver; });
  useEffect(() => { if (ended) onOver.current(); }, [ended]);

  const holder = useRef<HTMLDivElement>(null);
  const started = state !== null;
  useEffect(() => {
    const node = holder.current;
    if (!tracker || !node) return;
    node.append(tracker.video);
    return () => { tracker.video.remove(); };
    // The preview box only exists once the first state has arrived, so run again then.
  }, [tracker, started]);

  if (!enemy || !style) return <Notice line="This stop is not in your copy of the game." onLeave={onLeave} button="Leave the room" />;
  if (!state) return <Notice line="The fight is starting..." onLeave={onLeave} button="Leave the room" />;
  const over = state.phase.kind === "won" || state.phase.kind === "lost";
  return (
    <div className="fight">
      <Scene enemy={enemy} state={state} poseRef={poseRef} />
      <SkyHud enemy={enemy} state={state} />
      {!over && <PowerCircle power={state.power} />}
      <div className="preview mirror" ref={holder} />
      {!over && <Button className="room-leave" onClick={onLeave}>Leave the room</Button>}
      {mode === "touch" && !over && <TouchPad state={state} strikes={style.strikes} onStrike={(move) => { touched.current.push(move); }} />}
      {over && (
        <div className="overlay guest-over">
          <WaveBorder className="guest-wave" />
          <h1>{state.phase.kind === "won" ? `${enemy.name} falls` : "You are struck down"}</h1>
          <p className="notice">Waiting for the host to go on.</p>
          <div className="end-buttons"><Button primary onClick={onLeave}>Leave the room</Button></div>
        </div>
      )}
    </div>
  );
}

export function GuestFight(props: { joined: Joined; onOver: () => void; onLeave: () => void }) {
  const { link, mode, tracker } = props.joined;
  const [, tick] = useState(0);
  const [sawHost, setSawHost] = useState(false);
  const [fight, setFight] = useState<Fight | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (link.hostHere()) setSawHost(true);
      const next = link.fight();
      setFight((old) => (old !== null && old.seed === next?.seed ? old : next));
      tick((n) => n + 1);
    }, 200);
    return () => { window.clearInterval(timer); };
  }, [link]);

  // peer:false also comes on a host reload or blip, so the seat is kept until the guest leaves; a dead seat is dropped when its rejoin is refused.
  const hostGone = sawHost && !link.hostHere();

  const leave = (): void => {
    forgetSeat(tabStore());
    link.close();
    tracker?.stop();
    props.onLeave();
  };
  if (hostGone) return <Notice line="The host left the room." onLeave={leave} button="Back to the start" />;
  if (link.stopped()) return <Notice line="The host ended the fight. Stay here for the next one, or leave." onLeave={leave} button="Leave the room" />;
  if (!fight) return <Notice line={sawHost ? "You are in. Waiting for the host to start." : "Joining..."} onLeave={leave} button="Leave the room" />;
  return <Fighting key={fight.seed} link={link} fight={fight} mode={mode} tracker={tracker} onOver={props.onOver} onLeave={leave} />;
}
