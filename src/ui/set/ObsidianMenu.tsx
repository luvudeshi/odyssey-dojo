// The main menu in the Obsidian set: four tall glass slabs in one row under a molten title, the galley's strait behind them.
import type { ReactNode } from "react";
import { speakLine } from "../../audio/voice";
import { DEVICES } from "../../screens/menuShields";
import { SetBackdrop, SetTitle } from "./parts";
import "./screens.css";

function Slab(props: { primary?: boolean; device: ReactNode; name: string; line?: string; onClick: () => void }) {
  return (
    <button type="button" className={`set-slab ${props.primary ? "set-slab--primary" : ""}`} onClick={props.onClick}>
      <svg className="set-slab__icon" viewBox="0 0 96 96" aria-hidden="true">{props.device}</svg>
      <span className="set-slab__name">{props.name}</span>
      {props.line && <small className="set-slab__line">{props.line}</small>}
    </button>
  );
}

export function ObsidianMenu(props: {
  name: string;
  notice: string;
  problem: string;
  onStory: () => void;
  onCamera: () => void;
  onKeyboard: () => void;
  onMultiplayer: () => void;
  onTraining: () => void;
  onAccount: () => void;
}) {
  const hero = props.name.trim();
  const story = (): void => { speakLine("homer_title"); props.onStory(); };
  return (
    <main className="menu--title set-menu">
      <SetBackdrop src="/textures/set/obsidian/menu.jpg" />
      <h1 className="sr-only">Odyssey Dojo</h1>
      <header className="set-menu__head">
        <SetTitle kicker="Sing, Muse, of the man who fought his way home">Odyssey Dojo</SetTitle>
        <p className="set-menu__lead">{hero ? `Welcome back, ${hero}. ` : ""}Learn real self-defense, one monster at a time.</p>
      </header>
      <nav className="set-menu__row" aria-label="Main menu">
        <Slab primary device={DEVICES.ship} name="Story mode" line="The road home to Ithaca, fought with your body" onClick={story} />
        <Slab device={DEVICES.pair} name="Multiplayer" line="Host a room or join a friend's" onClick={props.onMultiplayer} />
        <i className="set-menu__gap" aria-hidden="true" />
        <Slab device={DEVICES.shield} name="Training Dojo" line="Learn each move, with a grade and a tip" onClick={props.onTraining} />
        <Slab device={DEVICES.laurel} name="Account" line="Your name, achievements and settings" onClick={props.onAccount} />
      </nav>
      <p className="notice set-menu__notice">{props.notice}</p>
      {props.problem && (
        <div className="overlay set-menu__problem">
          <div className="set-panel set-panel--lava">
            <h2>The camera did not start</h2>
            <p>{props.problem}</p>
            <div className="set-menu__problem-row">
              <button type="button" className="set-btn set-btn--primary" onClick={props.onCamera}>Try the camera again</button>
              <button type="button" className="set-btn" onClick={props.onKeyboard}>Play on the keyboard</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
