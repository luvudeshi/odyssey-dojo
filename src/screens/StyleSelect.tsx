import { useEffect } from "react";
import type { FightingStyle } from "../core/types";
import { Button, installGround } from "../ui/pebble";
import { Backdrop, SetTitle } from "../ui/set/Set";
import { STYLE_DEVICES } from "../ui/set/styleDevices";
import { BronzeDefs, DEVICES, ShieldCard } from "./menuShields";
import "../ui/set/screens-flow.css";

export function StyleSelect(props: { styles: readonly FightingStyle[]; notice: string; onPick: (style: FightingStyle) => void; onBack?: () => void; onCharacter?: () => void }) {
  useEffect(() => { installGround(); }, []);
  return (
    <main className="menu menu--style flow">
      <Backdrop src="/textures/set/storm/armoury.jpg" />
      {props.onBack && <button type="button" className="set-back" onClick={props.onBack}>Back</button>}
      <SetTitle>Choose your fighting style</SetTitle>
      <p className="notice set-sub">{props.notice}</p>
      <div className="flow-styles">
        <BronzeDefs />
        {props.styles.map((style) => (
          <ShieldCard key={style.id} className="flow-style" device={STYLE_DEVICES[style.id] ?? DEVICES.shield} name={style.name} line={style.blurb} onClick={() => { props.onPick(style); }} />
        ))}
      </div>
      {props.onCharacter && <Button onClick={props.onCharacter}>Change character</Button>}
    </main>
  );
}
