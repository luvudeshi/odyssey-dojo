// The star-chart banners: the phase line, the intro name card, and the GOOD / GREAT / PERFECT and Together flashes.
import { useEffect, useState } from "react";
import type { EnemySpec } from "../../core/types";
import { RatingFlash } from "../RatingFlash";
import { MissFlash } from "../MissFlash";
import { TogetherFlash } from "../TogetherFlash";
import { RiftPlate } from "./rift/RiftPlate";

const SHOW_MS = 1800;
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"] as const;

/** "II" for 2. Past the table it falls back to the plain number. */
export function roman(n: number): string {
  return ROMAN[n - 1] ?? String(n);
}

export function PhaseLine({ index, name }: { index: number; name: string }) {
  return <div className="sk-phase"><RiftPlate tone="glass" blades /><small>{roman(index + 1)}</small>{name}</div>;
}

/**
 * What the phase line shows after the fight's phase index moves from `last` to `index`: a new phase shows its line, a
 * move back to 0 (a restart) clears it, and no move keeps what is shown.
 */
export function phaseShown(last: number, index: number, shown: number | null): number | null {
  if (index === last) return shown;
  return index > 0 ? index : null;
}

/** Shows the new phase's numeral and name for a moment, like PhaseBanner. Index 0 (the fight's start) is not a change. */
export function SkyPhase({ enemy, index }: { enemy: EnemySpec; index: number }) {
  const [shown, setShown] = useState<number | null>(null);
  const [last, setLast] = useState(index);
  if (index !== last) {
    setLast(index);
    setShown(phaseShown(last, index, shown));
  }
  useEffect(() => {
    if (shown === null) return undefined;
    const timer = window.setTimeout(() => { setShown(null); }, SHOW_MS);
    return () => { window.clearTimeout(timer); };
  }, [shown]);
  const name = shown === null ? undefined : enemy.phases?.[shown]?.name;
  return shown !== null && name !== undefined ? <PhaseLine key={shown} index={shown} name={name} /> : null;
}

export function SkyIntro({ enemy }: { enemy: EnemySpec }) {
  return (
    <div className="sk-intro">
      <RiftPlate tone="glass" blades />
      <h2>{enemy.name.toUpperCase()}</h2>
      <small>{enemy.title}</small>
    </div>
  );
}

/** The rating word and the two-player flashes reuse the pebble components' logic; top.css gives them the star-chart look. */
export function SkyFlashes({ two }: { two: boolean }) {
  return (
    <>
      <RatingFlash />
      <MissFlash />
      <TogetherFlash two={two} />
    </>
  );
}
