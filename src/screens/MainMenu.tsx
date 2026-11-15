// The main menu: Story mode (the quest map), Multiplayer (rooms), the Training Dojo and the Account, as four cards under the logo.
// Story mode and the dojo start the webcam, or the keyboard when the "Play with" setting says so (Account, Settings).
// Behind them: the storm in Scylla's strait (MenuScene).
import type { ReactNode } from "react";
import { speakLine } from "../audio/voice";
import { Button, Logo, Panel } from "../ui/pebble";
import { MenuScene } from "./MenuScene";
import { look } from "../ui/lookSwitch";
import { LookDefs, PebbleFrame, RICH_ICONS } from "./menuCardLooks";
import "./menuCardLooks.css";

const SHIP = (
  <>
    <path d="M8 40 Q32 54 56 40 L51 48 Q32 57 13 48 Z" />
    <path d="M32 40 V10 M32 13 Q50 24 32 35 M32 16 Q20 24 32 32" />
    <path d="M4 59 q7 -5 14 0 t14 0 t14 0 t14 0" />
  </>
);
const SHIELD = (
  <>
    <circle cx="32" cy="32" r="24" />
    <circle cx="32" cy="32" r="15" />
    <path d="M22 41 L32 20 L42 41" />
  </>
);
const PAIR = (
  <>
    <circle cx="22" cy="20" r="9" />
    <circle cx="44" cy="22" r="8" />
    <path d="M6 54 C6 40 13 34 22 34 C31 34 38 40 38 54" />
    <path d="M40 36 C51 34 58 42 58 54" />
  </>
);
const LAUREL = (
  <>
    <path d="M30 56 C12 50 8 30 18 10 M34 56 C52 50 56 30 46 10" />
    <path d="M13 40 l-8 -3 M11 30 l-8 0 M13 20 l-7 3 M51 40 l8 -3 M53 30 l8 0 M51 20 l7 3 M20 48 l-7 3 M44 48 l7 3" />
  </>
);

function Card(props: { primary?: boolean; icon: ReactNode; rich: ReactNode; name: string; line?: string; onClick: () => void }) {
  return (
    <button className={`style-card menu-card ${props.primary ? "menu-card--primary" : ""}`} onClick={props.onClick}>
      {look === "b" && <PebbleFrame />}
      {look
        ? <svg className="lk-icon" viewBox="0 0 96 96" aria-hidden="true">{props.rich}</svg>
        : <svg className="menu-card__icon" viewBox="0 0 64 64" aria-hidden="true">{props.icon}</svg>}
      <span className="style-card__name">{props.name}</span>
      {props.line && <small>{props.line}</small>}
    </button>
  );
}

export function MainMenu(props: {
  /** The hero name from the Account, or "" when none was typed. */
  name: string;
  notice: string;
  problem: string;
  /** Story mode: the camera or the keyboard, as the setting says. */
  onStory: () => void;
  /** The two ways on from the camera problem card. */
  onCamera: () => void;
  onKeyboard: () => void;
  onMultiplayer: () => void;
  onTraining: () => void;
  onAccount: () => void;
}) {
  const story = (): void => { speakLine("homer_title"); props.onStory(); };
  return (
    <Panel as="main" className="menu menu--title">
      <MenuScene />
      <h1 className="sr-only">Odyssey Dojo</h1>
      <Logo height={Math.min(250, Math.max(130, Math.round(window.innerHeight * 0.22)))} />
      <p className="verse">Sing, Muse, of the man who fought his way home to Ithaca.</p>
      <p className="lead">{props.name.trim() ? `Welcome back, ${props.name.trim()}. ` : ""}Your body is the controller.</p>
      <nav className="menu-cards" aria-label="Main menu">
        {look && <LookDefs />}
        <Card primary icon={SHIP} rich={RICH_ICONS.ship} name="Story mode" line="The road home to Ithaca, fought with your body" onClick={story} />
        <Card icon={PAIR} rich={RICH_ICONS.pair} name="Multiplayer" line="Host a room or join a friend's" onClick={props.onMultiplayer} />
        <Card icon={SHIELD} rich={RICH_ICONS.shield} name="Training Dojo" onClick={props.onTraining} />
        <Card icon={LAUREL} rich={RICH_ICONS.laurel} name="Account" line="Your name, achievements and settings" onClick={props.onAccount} />
      </nav>
      <p className="notice">{props.notice}</p>
      {props.problem && (
        <div className="overlay">
          <h1>The camera did not start</h1>
          <p>{props.problem}</p>
          <Button primary onClick={props.onCamera}>Try the camera again</Button>
          <Button onClick={props.onKeyboard}>Play on the keyboard</Button>
        </div>
      )}
    </Panel>
  );
}
