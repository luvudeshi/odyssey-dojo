// "Fight together": host a room or join one.
export function RoomMenu(props: { onHost: () => void; onJoin: () => void; onBack: () => void }) {
  return (
    <main className="menu room">
      <h1>Fight together</h1>
      <p>Two fighters, one monster. Strike the same move together to hit twice as hard.</p>
      <button onClick={props.onHost}>Host a room</button>
      <button onClick={props.onJoin}>Join a room</button>
      <button className="quiet" onClick={props.onBack}>Back</button>
    </main>
  );
}
