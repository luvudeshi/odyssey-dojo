import { useEffect } from "react";
import type { EnemySpec } from "../core/types";
import { narrateIntro } from "./hookups";
import { holdFastLine } from "../enemies/wording";

export function IntroScreen(props: { enemy: EnemySpec; onBegin: () => void; onBack: () => void }) {
  const { enemy, onBegin, onBack } = props;
  useEffect(() => narrateIntro(enemy.id), [enemy.id]);
  return (
    <main className="menu">
      {enemy.place && <p className="notice">{enemy.place}{enemy.book ? `, Book ${String(enemy.book)}` : ""}</p>}
      <h1>{enemy.name}</h1>
      <p className="verse">{enemy.title}. {holdFastLine(enemy.id)}</p>
      <button autoFocus onClick={onBegin}>Face {enemy.name}</button>
      <button className="quiet" onClick={onBack}>Back to the map</button>
    </main>
  );
}
