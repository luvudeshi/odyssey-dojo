import { useEffect } from "react";
import type { FightingStyle } from "../core/types";
import { Button, installGround, PebbleHeading, Panel } from "../ui/pebble";

export function StyleSelect(props: { styles: readonly FightingStyle[]; notice: string; onPick: (style: FightingStyle) => void; onCharacter?: () => void }) {
  useEffect(() => { installGround(); }, []);
  return (
    <Panel as="main" ornament className="menu menu--style">
      <PebbleHeading as="h1" text="Choose your fighting style" px={42} tone="ochre" />
      <p className="notice">{props.notice}</p>
      <div className="styles">
        {props.styles.map((style) => (
          <button key={style.id} className="style-card" onClick={() => { props.onPick(style); }}>
            <span className="style-card__name">{style.name}</span>
            <small>{style.blurb}</small>
          </button>
        ))}
      </div>
      {props.onCharacter && <Button onClick={props.onCharacter}>Change character</Button>}
    </Panel>
  );
}
