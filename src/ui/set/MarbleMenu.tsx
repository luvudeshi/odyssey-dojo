// The main menu in the marble and gold look (?look=marble): a sunlit Aegean behind, a marble sheet with the title, and the
// four choices as marble plaques in one row, Story mode in solid gold and larger. Same labels and handlers as MainMenu.
import { speakLine } from "../../audio/voice";
import { DEVICES } from "../../screens/menuShields";
import { SetBackdrop, SetButton, SetDefs, SetPanel, SetPlaque, SetTitle } from "./index";

export interface MenuProps {
  name: string;
  notice: string;
  problem: string;
  onStory: () => void;
  onCamera: () => void;
  onKeyboard: () => void;
  onMultiplayer: () => void;
  onTraining: () => void;
  onAccount: () => void;
}

export function MarbleMenu(props: MenuProps) {
  const story = (): void => { speakLine("homer_title"); props.onStory(); };
  const who = props.name.trim();
  return (
    <main className="menu--title set-screen set-menu">
      <SetBackdrop src="/textures/set/marble/day-menu.jpg" position="50% 60%" />
      <SetDefs />
      <SetPanel className="set-menu__head set-panel--head">
        <SetTitle kicker="A game of the Odyssey">Odyssey Dojo</SetTitle>
        <p className="set-menu__verse">Sing, Muse, of the man who fought his way home to Ithaca.</p>
        <p className="set-menu__lead">{who ? `Welcome back, ${who}. ` : ""}Learn real self-defense, one monster at a time.</p>
      </SetPanel>
      <nav className="set-menu__cards" aria-label="Main menu">
        <SetPlaque primary device={DEVICES.ship} name="Story mode" line="The road home to Ithaca, fought with your body" onClick={story} />
        <SetPlaque device={DEVICES.pair} name="Multiplayer" line="Host a room or join a friend's" onClick={props.onMultiplayer} />
        <SetPlaque device={DEVICES.shield} name="Training Dojo" line="Learn each move, one at a time" onClick={props.onTraining} />
        <SetPlaque device={DEVICES.laurel} name="Account" line="Your name, achievements and settings" onClick={props.onAccount} />
      </nav>
      <p className="notice set-menu__notice">{props.notice}</p>
      {props.problem && (
        <div className="overlay set-overlay">
          <SetPanel className="set-overlay__card">
            <h1 className="set-title">The camera did not start</h1>
            <p>{props.problem}</p>
            <SetButton primary onClick={props.onCamera}>Try the camera again</SetButton>
            <SetButton onClick={props.onKeyboard}>Play on the keyboard</SetButton>
          </SetPanel>
        </div>
      )}
    </main>
  );
}
