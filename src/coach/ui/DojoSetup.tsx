// The training dojo's setup step: what to practise. A row of style buttons, the moves to tick in groups (the style's
// strikes, kicks and knees, defends, more moves), Select all and Clear, the tries at each move, and Start training.
// Real buttons, checkboxes and radio buttons with labels, so all of it works from the keyboard.
// What the list holds and what is ticked at first is ../catalog (pure, tested in tests/dojoCatalog.test.ts). The last
// choice is kept in this browser. The dojo screen (./Dojo) shows this before every session.
import { useMemo, useState } from "react";
import { REPS_CHOICES, dojoMenu, dojoMoveOf, loadChoice, menuIds, pickedInOrder, saveChoice, startingSetup, usualMoves } from "../catalog";
import type { DojoChoice, DojoStyleDef } from "../catalog";
import { DOJO_REPS } from "../dojo";
import "./dojoSetup.css";

/** What the player chose: the style, the ticked moves in the order they are trained, and the tries at each. */
export interface DojoPick extends DojoChoice {
  /** The style's name, for a title. */
  readonly styleName: string;
}

export interface DojoSetupProps {
  /** The style preselected. Left out or null: the one chosen last time, else the first. */
  style?: Pick<DojoStyleDef, "name" | "strikes"> | null;
  /** Move ids ticked at first. Left out: last time's for this style, else its strikes, then block, duck and both dodges. */
  moves?: readonly string[];
  /** Tries at each move at first. Left out: last time's, else 3. */
  reps?: number;
  /** What this player picked a moment ago (they pressed Change moves): shown as it was, whatever else was handed in. */
  last?: DojoChoice | null;
  /** True when a camera is watching: the note under the list says where to stand. */
  camera: boolean;
  /** The player pressed Start training. Never called with no moves. */
  onStart: (pick: DojoPick) => void;
}

export function DojoSetup(props: DojoSetupProps) {
  const { camera, onStart } = props;
  // What is shown first: read once.
  const [first] = useState(() => startingSetup(props.last
    ? { saved: props.last }
    : { style: props.style ?? null, ...(props.moves ? { moves: props.moves } : {}), ...(props.reps === undefined ? {} : { reps: props.reps }), saved: loadChoice() },
  DOJO_REPS));
  const [styleId, setStyleId] = useState(first.style.id);
  const [ticked, setTicked] = useState<readonly string[]>(first.ticked);
  const [reps, setReps] = useState(first.reps);
  const style = first.styles.find((each) => each.id === styleId) ?? first.style;
  // The list to tick. Whatever was ticked at first is on it, even a move no group would offer.
  const menu = useMemo(() => dojoMenu(style, { include: first.ticked }), [style, first]);
  const picked = useMemo(() => pickedInOrder(menu, ticked), [menu, ticked]);
  const repsChoices = useMemo(() => [...new Set([...REPS_CHOICES, first.reps])].sort((a, b) => a - b), [first]);

  const chooseStyle = (next: DojoStyleDef): void => {
    if (next.id === styleId) return;
    setStyleId(next.id);
    // A new style starts on its own usual list.
    setTicked(usualMoves(next).filter((id) => dojoMoveOf(id) !== undefined));
  };
  const tick = (id: string, on: boolean): void => {
    setTicked((before) => (on ? [...before.filter((each) => each !== id), id] : before.filter((each) => each !== id)));
  };
  const begin = (): void => {
    if (picked.length === 0) return;
    const choice: DojoChoice = { style: style.id, moves: picked, reps };
    saveChoice(choice);
    onStart({ ...choice, styleName: style.name });
  };

  return (
    <div className="dojo-setup">
      <h1 id="dojo-setup-title" className="dojo-setup-title set-sub">Pick what to practise</h1>
      <section className="dojo-set-panel set-panel" aria-labelledby="dojo-setup-title">
        <fieldset className="dojo-set-group dojo-set-styles">
          <legend>Fighting style</legend>
          <div className="dojo-set-row">
            {first.styles.map((each) => (
              <button key={each.id} type="button" className="set-btn dojo-set-button dojo-set-style" aria-pressed={each.id === style.id} onClick={() => { chooseStyle(each); }}>{each.name}</button>
            ))}
          </div>
          {style.line && <p className="dojo-set-note">{style.line}</p>}
        </fieldset>
        <div className="dojo-set-row dojo-set-tools">
          <button type="button" className="set-btn dojo-set-button" onClick={() => { setTicked(menuIds(menu)); }}>Select all</button>
          <button type="button" className="set-btn dojo-set-button" onClick={() => { setTicked([]); }}>Clear</button>
          <p className="dojo-set-count" aria-live="polite">{picked.length === 0 ? "Tick at least one move." : `${String(picked.length)} ${picked.length === 1 ? "move" : "moves"} picked`}</p>
        </div>
        <div className="dojo-set-moves">
          {menu.map((group) => (
            <fieldset key={group.id} className="dojo-set-group" data-group={group.id}>
              <legend>{group.title}</legend>
              {group.note && <p className="dojo-set-note">{group.note}</p>}
              <ul className="dojo-set-list">
                {group.moves.map((each) => (
                  <li key={each.id}>
                    <label className="dojo-set-move">
                      <input type="checkbox" value={each.id} checked={ticked.includes(each.id)} onChange={(event) => { tick(each.id, event.target.checked); }} />
                      <span>{each.name}</span>
                      {each.wholeBody && group.id !== "kicks" && <small>whole body in view</small>}
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          ))}
        </div>
        <fieldset className="dojo-set-group dojo-set-reps">
          <legend>Tries at each move</legend>
          <div className="dojo-set-row">
            {repsChoices.map((count) => (
              <label key={count} className="dojo-set-move">
                <input type="radio" name="dojo-reps" value={count} checked={count === reps} onChange={() => { setReps(count); }} />
                <span>{String(count)}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <p className="dojo-set-camera">{camera ? "The camera is on: stand where it sees your whole body." : "No camera: you will press a key for each move."}</p>
        <button type="button" className="set-btn set-btn--primary dojo-set-button dojo-set-start" autoFocus disabled={picked.length === 0} onClick={begin}>Start training</button>
      </section>
    </div>
  );
}
