// Flashes GOOD, GREAT or PERFECT for a moment after a strike lands. FightScreen feeds it every combat event.
import { useEffect, useState } from "react";
import type { CombatEvent } from "../core/types";
import { rating } from "../pose/quality";

const SHOW_MS = 700;
const listeners = new Set<(word: string) => void>();

export function noteHit(event: CombatEvent): void {
  if (event.type !== "enemyHit") return;
  const word = rating(event.quality);
  if (word) listeners.forEach((listen) => { listen(word); });
}

export function RatingFlash() {
  const [shown, setShown] = useState<{ word: string; id: number } | null>(null);
  useEffect(() => {
    let id = 0;
    let timer = 0;
    const listen = (word: string): void => {
      id += 1;
      setShown({ word, id });
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { setShown(null); }, SHOW_MS);
    };
    listeners.add(listen);
    return () => {
      listeners.delete(listen);
      window.clearTimeout(timer);
    };
  }, []);
  return shown && <div className="banner" key={shown.id}><small>{shown.word}</small></div>;
}
