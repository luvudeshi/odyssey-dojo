import { speakLine } from "../audio/voice";
import { Button, Logo, Panel } from "../ui/pebble";

export function TitleScreen(props: { notice: string; onCamera: () => void; onKeyboard: () => void; onSettings: () => void; onTogether?: () => void }) {
  return (
    <Panel as="main" ornament className="menu menu--title">
      <h1 className="sr-only">Odyssey Fighter</h1>
      <Logo height={Math.min(240, Math.max(150, Math.round(window.innerHeight * 0.3)))} />
      <p className="verse">Sing, Muse, of the man who fought his way home to Ithaca.</p>
      <p className="lead">Your body is the controller.</p>
      <div className="menu__row">
        <Button primary onClick={() => { speakLine("homer_title"); props.onCamera(); }}>Fight with your body (webcam)</Button>
      </div>
      <div className="menu__row">
        <Button onClick={() => { speakLine("homer_title"); props.onKeyboard(); }}>Keyboard only</Button>
        {props.onTogether && <Button onClick={props.onTogether}>Fight together</Button>}
        <Button onClick={props.onSettings}>Settings</Button>
      </div>
      <p className="notice">{props.notice}</p>
    </Panel>
  );
}
