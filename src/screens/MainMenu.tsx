// The main menu: Story mode (the quest map), Multiplayer (rooms), the Training Dojo and the Account, as four hoplite
// shields under the logo (menuShields.tsx).
// Story mode and the dojo start the webcam, or the keyboard when the "Play with" setting says so (Account, Settings).
// Behind them: the storm in Scylla's strait (MenuScene).
import { speakLine } from "../audio/voice";
import { Button, Panel } from "../ui/pebble";
import { SetTitle } from "../ui/set/Set";
import { BronzeDefs, DEVICES, ShieldCard } from "./menuShields";
import { MenuScene } from "./MenuScene";

/** A gilded palmette fan, drawn here, one at each end of the name plate. */
function Palmette(props: { flip?: boolean }) {
  return (
    <svg className={props.flip ? "menu-plaque__mark menu-plaque__mark--flip" : "menu-plaque__mark"} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={props.flip ? "pl-g2" : "pl-g1"} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff1c2" /><stop offset="0.55" stopColor="#e0a552" /><stop offset="1" stopColor="#8a4e1a" />
        </linearGradient>
      </defs>
      <g fill={`url(#${props.flip ? "pl-g2" : "pl-g1"})`} stroke="#1a0d06" strokeWidth="1.6">
        {[-72, -48, -24, 0, 24, 48, 72].map((a) => (
          <ellipse key={a} cx="32" cy="22" rx="5.2" ry="17" transform={`rotate(${a} 32 52)`} />
        ))}
        <path d="M14 60a18 18 0 0 1 36 0Z" />
      </g>
    </svg>
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
      <div className="menu-plaque">
        <Palmette />
        <SetTitle as="p">Odyssey Dojo</SetTitle>
        <Palmette flip />
      </div>
      <p className="lead">{props.name.trim() ? `Welcome back, ${props.name.trim()}. ` : ""}Learn real self-defense, one monster at a time.</p>
      <nav className="menu-cards" aria-label="Main menu">
        <BronzeDefs />
        <ShieldCard primary device={DEVICES.ship} name="Story mode" line="The road home to Ithaca, fought with your body" onClick={story} />
        <ShieldCard device={DEVICES.pair} name="Multiplayer" line="Host a room or join a friend's" onClick={props.onMultiplayer} />
        <ShieldCard device={DEVICES.shield} name="Training Dojo" line="Learn each move, with a grade and a tip" onClick={props.onTraining} />
        <ShieldCard device={DEVICES.laurel} name="Account" line="Your name, achievements and settings" onClick={props.onAccount} />
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
