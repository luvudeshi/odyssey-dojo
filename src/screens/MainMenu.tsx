// The main menu: Story mode (the quest map), the Training Dojo and the Account, as three cards under the logo.
// Story mode and the dojo start the webcam; the small link under the cards plays on the keyboard instead.
import type { ReactNode } from "react";
import { speakLine } from "../audio/voice";
import { Button, Logo, Panel } from "../ui/pebble";

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
const LAUREL = (
  <>
    <path d="M30 56 C12 50 8 30 18 10 M34 56 C52 50 56 30 46 10" />
    <path d="M13 40 l-8 -3 M11 30 l-8 0 M13 20 l-7 3 M51 40 l8 -3 M53 30 l8 0 M51 20 l7 3 M20 48 l-7 3 M44 48 l7 3" />
  </>
);

function Card(props: { primary?: boolean; icon: ReactNode; name: string; line: string; onClick: () => void }) {
  return (
    <button className={`style-card menu-card ${props.primary ? "menu-card--primary" : ""}`} onClick={props.onClick}>
      <svg className="menu-card__icon" viewBox="0 0 64 64" aria-hidden="true">{props.icon}</svg>
      <span className="style-card__name">{props.name}</span>
      <small>{props.line}</small>
    </button>
  );
}

export function MainMenu(props: {
  /** The hero name from the Account, or "" when none was typed. */
  name: string;
  notice: string;
  problem: string;
  onStory: () => void;
  onKeyboard: () => void;
  onTraining: () => void;
  onAccount: () => void;
}) {
  const story = (): void => { speakLine("homer_title"); props.onStory(); };
  const keyboard = (): void => { speakLine("homer_title"); props.onKeyboard(); };
  return (
    <Panel as="main" ornament className="menu menu--title">
      <h1 className="sr-only">Odyssey Fighter</h1>
      <Logo height={Math.min(220, Math.max(140, Math.round(window.innerHeight * 0.27)))} />
      <p className="verse">Sing, Muse, of the man who fought his way home to Ithaca.</p>
      <p className="lead">{props.name.trim() ? `Welcome back, ${props.name.trim()}. ` : ""}Your body is the controller.</p>
      <nav className="menu-cards" aria-label="Main menu">
        <Card primary icon={SHIP} name="Story mode" line="The road home to Ithaca, fought with your body" onClick={story} />
        <Card icon={SHIELD} name="Training Dojo" line="Learn each move and get a grade for every try" onClick={props.onTraining} />
        <Card icon={LAUREL} name="Account" line="Your name, achievements, friends and settings" onClick={props.onAccount} />
      </nav>
      <button className="menu-link" onClick={keyboard}>Play on the keyboard instead</button>
      <p className="notice">{props.notice}</p>
      {props.problem && (
        <div className="overlay">
          <h1>The camera did not start</h1>
          <p>{props.problem}</p>
          <Button primary onClick={props.onStory}>Try the camera again</Button>
          <Button onClick={props.onKeyboard}>Play on the keyboard</Button>
        </div>
      )}
    </Panel>
  );
}
