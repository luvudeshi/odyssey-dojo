// The main menu: Story mode (the quest map), Multiplayer (rooms), the Training Dojo and the Account, as four hoplite
// shields under the logo (menuShields.tsx).
// Story mode and the dojo start the webcam, or the keyboard when the "Play with" setting says so (Account, Settings).
// Behind them: the storm in Scylla's strait (MenuScene).
import { speakLine } from "../audio/voice";
import { lookIs } from "../ui/lookSwitch";
import { Button, Logo, Panel } from "../ui/pebble";
import { SetTitle } from "../ui/set/Set";
import { BronzeDefs, DEVICES, ShieldCard } from "./menuShields";
import { MenuScene } from "./MenuScene";

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
      {lookIs("storm") ? <SetTitle as="p">Odyssey Dojo</SetTitle> : <Logo height={Math.min(250, Math.max(130, Math.round(window.innerHeight * 0.22)))} />}
      <p className="verse">Sing, Muse, of the man who fought his way home to Ithaca.</p>
      <p className="lead">{props.name.trim() ? `Welcome back, ${props.name.trim()}. ` : ""}Learn real self-defense, one monster at a time.</p>
      <nav className="menu-cards" aria-label="Main menu">
        <BronzeDefs />
        <ShieldCard primary device={DEVICES.ship} name="Story mode" line="The road home to Ithaca, fought with your body" onClick={story} />
        <ShieldCard device={DEVICES.pair} name="Multiplayer" line="Host a room or join a friend's" onClick={props.onMultiplayer} />
        <ShieldCard device={DEVICES.shield} name="Training Dojo" onClick={props.onTraining} />
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
