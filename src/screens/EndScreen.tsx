// Content for the end-of-fight overlay: the moves learned and where to go next.
import { useEffect } from "react";
import { MOVES } from "../moves/registry";

export function EndPanel(props: {
  won: boolean;
  mastery: Readonly<Record<string, number>>;
  /** Called once when the panel appears, so the flow records the result. */
  onShown: () => void;
  onRetry: () => void;
  onMap: () => void;
  onStyle: () => void;
}) {
  const { onShown } = props;
  useEffect(() => { onShown(); }, [onShown]);
  const learned = Object.entries(props.mastery)
    .filter(([, count]) => count > 0)
    .map(([id, count]) => ({ name: MOVES.get(id)?.name ?? id, count }));
  return (
    <>
      <p>{props.won ? "The way onward is open." : "The gods turn their faces away. Rise and try again."}</p>
      <div className="learned">
        <h2>Moves learned</h2>
        {learned.length === 0 ? <p>None yet.</p> : (
          <ul>{learned.map((move) => <li key={move.name}>{move.name} x{move.count}</li>)}</ul>
        )}
      </div>
      {!props.won && <button autoFocus onClick={props.onRetry}>Fight again</button>}
      <button autoFocus={props.won} onClick={props.onMap}>{props.won ? "Back to the map" : "Map"}</button>
      <button onClick={props.onStyle}>Change style</button>
    </>
  );
}
