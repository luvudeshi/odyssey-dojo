// Shows the new phase's name ("The Club", "Blinded") for a moment. FightScreen feeds it every combat event.
import { useEffect, useState } from "react";
import type { CombatEvent } from "../core/types";

const SHOW_MS = 1800;
const listeners = new Set<(name: string) => void>();

/** The name to show for an event, or null. Index 0 is the fight's start, not a change. */
export function phaseName(event: CombatEvent): string | null {
  return event.type === "phaseChanged" && event.index > 0 ? event.name : null;
}

export function notePhase(event: CombatEvent): void {
  const name = phaseName(event);
  if (name) listeners.forEach((listen) => { listen(name); });
}

export function PhaseBanner() {
  const [shown, setShown] = useState<{ name: string; id: number } | null>(null);
  useEffect(() => {
    let id = 0;
    let timer = 0;
    const listen = (name: string): void => {
      id += 1;
      setShown({ name, id });
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { setShown(null); }, SHOW_MS);
    };
    listeners.add(listen);
    return () => {
      listeners.delete(listen);
      window.clearTimeout(timer);
    };
  }, []);
  return shown && <div className="hb-phase" key={shown.id}>{shown.name}</div>;
}
