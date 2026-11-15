// Flashes GOOD, GREAT or PERFECT for a moment after a strike lands. FightScreen feeds it every combat event.
// A counted strike sends the hero leaping at the monster, so the word (and the score, see HudBars) waits for his blow
// to land: battle.enemyHitAt, when the scene shows the monster struck.
import { useEffect, useState, useSyncExternalStore } from "react";
import type { CombatEvent } from "../core/types";
import { rating } from "../pose/quality";
import { battle, nowSeconds } from "../render/battle";
import { noteTogether } from "./TogetherFlash";

const SHOW_MS = 700;
/** Shown anyway after this long, in case no scene is drawing the fight. */
const GIVE_UP_SECONDS = 1;
const listeners = new Set<(word: string) => void>();
const landings = new Set<() => void>();
let airborne = 0;

/**
 * Calls `show` once the hero's blow lands: when the scene has synced this hit (it sets battle.enemyHitAt, on the same
 * clock) and that moment has come. A power hits at once, so it shows on the next frame.
 */
function whenLanded(show: () => void): void {
  const since = nowSeconds();
  const tick = (): void => {
    const now = nowSeconds();
    const at = battle.enemyHitAt;
    if ((at >= since && now >= at) || now - since > GIVE_UP_SECONDS) show();
    else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function noteHit(event: CombatEvent): void {
  if (event.type !== "enemyHit") return;
  noteTogether(event);
  const word = rating(event.quality);
  airborne += 1;
  landings.forEach((land) => { land(); });
  whenLanded(() => {
    airborne = Math.max(0, airborne - 1);
    landings.forEach((land) => { land(); });
    if (word) listeners.forEach((listen) => { listen(word); });
  });
}

function subscribeLandings(onChange: () => void): () => void {
  landings.add(onChange);
  return () => { landings.delete(onChange); };
}

function hitInFlight(): boolean {
  return airborne > 0;
}

/** The score to show: held at its old value while a counted blow is still in the air, so it rises as the blow lands. */
export function useLandedScore(score: number): number {
  const flying = useSyncExternalStore(subscribeLandings, hitInFlight, hitInFlight);
  const [shown, setShown] = useState(score);
  if (!flying && shown !== score) setShown(score);
  return flying ? shown : score;
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
  return shown && <div className="hb-rating" key={shown.id}>{shown.word}</div>;
}
