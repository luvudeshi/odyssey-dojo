export function TitleScreen(props: { notice: string; onCamera: () => void; onKeyboard: () => void; onSettings: () => void }) {
  return (
    <main className="menu">
      <h1>Odyssey Fighter</h1>
      <p className="verse">Sing, Muse, of the man who fought his way home to Ithaca.</p>
      <p>Your body is the controller.</p>
      <button onClick={props.onCamera}>Fight with your body (webcam)</button>
      <button onClick={props.onKeyboard}>Keyboard only</button>
      <button onClick={props.onSettings}>Settings</button>
      <p className="notice">{props.notice}</p>
    </main>
  );
}
