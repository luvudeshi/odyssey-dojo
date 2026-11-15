// Content for the end-of-fight overlay: the stop's ending, the moves learned and where to go next.
// FightScreen draws the .overlay and its title and score line; endPanel.css lays that wrapper as a pebble panel.
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { getProfile } from "../account/store";
import { DefenseLine } from "../account/ui/DefensePanel";
import { HOMECOMING_ID, NARRATION_LINES } from "../audio/narrationLines";
import { ENEMIES } from "../enemies/registry";
import { endingFor } from "../enemies/endings";
import { fallsLine } from "../enemies/wording";
import { Button, installGround } from "../ui/pebble";
import { Backdrop, SetTitle } from "../ui/set/Set";
import "./endPanel.css";
import "../ui/set/screens-end.css";
import { narrateHomecoming, narrateResult } from "./hookups";
import { practisedFrom, practisedLines } from "./practised";

/** A key pressed this soon after the panel shows is the fight's last key as well, so it does not count. */
const SETTLE_MS = 800;

export function EndPanel(props: {
  won: boolean;
  enemyId: string;
  mastery: Readonly<Record<string, number>>;
  /** What this fight's attacks came to; the line "Defended X of Y" sits above the score. Left out: no line. */
  defense?: { readonly attacksSeen: number; readonly attacksDefended: number };
  /** Called once when the panel appears, so the flow records the result. */
  onShown: () => void;
  onRetry: () => void;
  onMap: () => void;
  onStyle: () => void;
  /** The hero card and share panel. Once asked for, it takes the place of the ending and the moves learned until `close` is called. */
  card?: (close: () => void) => ReactNode;
}) {
  const { onShown, enemyId, won } = props;
  const [showCard, setShowCard] = useState(false);
  const [home, setHome] = useState(false);
  useEffect(() => narrateResult(enemyId, won), [enemyId, won]);
  useEffect(() => { onShown(); }, [onShown]);
  useEffect(() => { installGround(); }, []);
  // On the homecoming Homer speaks his closing line, the one shown; it cuts the stop's line off if that is still playing.
  useEffect(() => (home ? narrateHomecoming() : undefined), [home]);
  // Space (block) or Enter still held from the fight presses nothing here: only a key pressed after the panel has settled counts, once.
  useEffect(() => {
    const fresh = new Set<string>();
    const shownAt = performance.now();
    const guard = (event: KeyboardEvent): void => {
      if (event.key !== " " && event.key !== "Enter") return;
      if (event.type === "keydown" && !event.repeat && performance.now() - shownAt >= SETTLE_MS) fresh.add(event.key);
      else if (event.repeat || !fresh.has(event.key)) event.preventDefault();
    };
    window.addEventListener("keydown", guard, true);
    window.addEventListener("keyup", guard, true);
    return () => {
      window.removeEventListener("keydown", guard, true);
      window.removeEventListener("keyup", guard, true);
    };
  }, []);
  const learned = practisedFrom(props.mastery);
  const practised = practisedLines(learned);
  const ending = endingFor(enemyId);
  const hero = getProfile().name.trim();
  const name = ENEMIES.find((enemy) => enemy.id === enemyId)?.name ?? enemyId;
  // The last stop won: the button leads to the homecoming, shown in this same panel, before the map.
  const last = won && enemyId === ENEMIES.at(-1)?.id;
  // The Back shield does what the primary button does: out of the hero card, to the homecoming, or to the map.
  const back = showCard ? () => { setShowCard(false); } : last && !home ? () => { setHome(true); } : props.onMap;
  // The painting and the Back shield sit on the window, outside the panel (which is a transformed box), so they are portalled.
  const stage = createPortal(
    <>
      <div className="end-stage"><Backdrop src={won ? "/textures/set/storm/hall.jpg" : "/textures/set/storm/camp.jpg"} /></div>
      <button type="button" className="set-back end-back" onClick={back}>Back</button>
    </>,
    document.body,
  );
  if (home) {
    return (
      <>
        {stage}
        <div className="end-title"><SetTitle as="p">Home in Ithaca</SetTitle></div>
        <div className="end-ending">
          <p className="end-line">{NARRATION_LINES.find((line) => line.id === HOMECOMING_ID)?.text}</p>
          <p className="end-lesson">The road home is behind you. {ending.win}</p>
        </div>
        <div className="end-buttons">
          <Button primary autoFocus onClick={props.onMap}>Back to the map</Button>
        </div>
      </>
    );
  }
  return (
    <>
      {stage}
      <div className={`end-title ${won ? "" : "end-lost"}`}><SetTitle as="p">{won ? fallsLine(enemyId, name) : "You are struck down"}</SetTitle></div>
      {props.defense && <DefenseLine seen={props.defense.attacksSeen} defended={props.defense.attacksDefended} />}
      {showCard ? props.card?.(() => { setShowCard(false); }) : (
        <>
          <div className="end-ending">
            <p className="end-line">{won ? ending.win : ending.loss}</p>
            <p className="end-lesson">{ending.lesson}</p>
          </div>
          <p className="end-result">{hero ? `${hero}: ` : ""}{won ? "The way onward is open." : "The gods turn their faces away. Rise and try again."}</p>
          <div className="learned end-learned">
            <h2>Moves learned</h2>
            {learned.length === 0 ? <p>None yet.</p> : (
              <ul>{learned.map((move) => <li key={move.id}>{move.name} x{move.count}</li>)}</ul>
            )}
          </div>
          {practised.length > 0 && (
            <div className="end-practised">
              <h2>What each move is for</h2>
              <ul>{practised.map((move) => <li key={move.id}><b>{move.name}</b> {move.teaches}</li>)}</ul>
            </div>
          )}
        </>
      )}
      <div className="end-buttons">
        {!won && <Button primary autoFocus onClick={props.onRetry}>Fight again</Button>}
        <Button primary={won} autoFocus={won} onClick={last ? () => { setHome(true); } : props.onMap}>{!won ? "Map" : last ? "Home to Ithaca" : "Back to the map"}</Button>
        {props.card !== undefined && !showCard && <Button onClick={() => { setShowCard(true); }}>Your hero card</Button>}
        <Button onClick={props.onStyle}>Change style</Button>
      </div>
    </>
  );
}
