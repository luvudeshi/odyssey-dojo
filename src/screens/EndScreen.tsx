// Content for the end-of-fight overlay: the stop's ending, the moves learned and where to go next.
// FightScreen draws the .overlay and its title and score line; endPanel.css lays that wrapper as a pebble panel.
import { useEffect } from "react";
import { ENEMIES } from "../enemies/registry";
import { endingFor } from "../enemies/endings";
import { Button, PebbleHeading, WaveBorder, installGround } from "../ui/pebble";
import { Ornament } from "../ui/pebble/Ornament";
import "./endPanel.css";
import { narrateResult } from "./hookups";
import { practisedFrom, practisedLines } from "./practised";

export function EndPanel(props: {
  won: boolean;
  enemyId: string;
  mastery: Readonly<Record<string, number>>;
  /** Called once when the panel appears, so the flow records the result. */
  onShown: () => void;
  onRetry: () => void;
  onMap: () => void;
  onStyle: () => void;
}) {
  const { onShown, enemyId, won } = props;
  useEffect(() => narrateResult(enemyId, won), [enemyId, won]);
  useEffect(() => { onShown(); }, [onShown]);
  useEffect(() => { installGround(); }, []);
  const learned = practisedFrom(props.mastery);
  const practised = practisedLines(learned);
  const ending = endingFor(enemyId);
  const name = ENEMIES.find((enemy) => enemy.id === enemyId)?.name ?? enemyId;
  return (
    <>
      <WaveBorder className={`end-wave ${won ? "" : "end-lost"}`} />
      <PebbleHeading as="div" className="end-title" text={won ? `${name} falls`.toUpperCase() : "YOU ARE STRUCK DOWN"} px={40} tone={won ? "ochre" : "terra"} />
      <Ornament kind={won ? "wreath" : "rosette"} size={120} className="end-ornament" />
      <div className="end-ending">
        <p className="end-line">{won ? ending.win : ending.loss}</p>
        <p className="end-lesson">{ending.lesson}</p>
      </div>
      <p className="end-result">{won ? "The way onward is open." : "The gods turn their faces away. Rise and try again."}</p>
      <div className="learned end-learned">
        <h2>Moves learned</h2>
        {learned.length === 0 ? <p>None yet.</p> : (
          <ul>{learned.map((move) => <li key={move.id}>{move.name} x{move.count}</li>)}</ul>
        )}
      </div>
      {practised.length > 0 && (
        <div className="end-practised">
          <h2>What you practised</h2>
          <ul>{practised.map((move) => <li key={move.id}><b>{move.name}</b> {move.teaches}</li>)}</ul>
        </div>
      )}
      <div className="end-buttons">
        {!won && <Button primary autoFocus onClick={props.onRetry}>Fight again</Button>}
        <Button primary={won} autoFocus={won} onClick={props.onMap}>{won ? "Back to the map" : "Map"}</Button>
        <Button onClick={props.onStyle}>Change style</Button>
      </div>
    </>
  );
}
