// Tells the player a defend counted, the moment it counts: a small chip with one word for the defend made (DODGED,
// BLOCKED, DUCKED, JUMPED) and a green rim round the screen. Getting hit is red and shakes the picture, so the two cannot be mixed up.
// It reads the fight state only, so the camera, the keyboard and a guest's copy of the fight all show the same thing.
import { useEffect, useState } from "react";
import type { CombatPhase } from "../core/types";

const SHOW_MS = 1100;
const WORDS: Readonly<Record<string, string>> = {
  dodge_left: "DODGED", dodge_right: "DODGED", block: "BLOCKED", duck: "DUCKED", jump: "JUMPED",
};

/** What the callout needs from a phase: its kind, the defend asked for, and whether that defend has already been made. */
export interface DefendSeen { readonly kind: CombatPhase["kind"]; readonly counter: string | null; readonly met: boolean }

export function defendSeen(phase: CombatPhase): DefendSeen {
  const defend = phase.kind === "defend";
  return { kind: phase.kind, counter: defend ? phase.attack.counter : null, met: defend && phase.seen === "met" };
}

/**
 * The defend that has just counted, or null. It counts when it is made while the attack is coming (the phase turns
 * "met", well before the attack lands) or, for one still held from before, when the attack lands on it and the strike opens.
 */
export function defendCounted(last: DefendSeen, now: DefendSeen): string | null {
  if (now.met && !(last.met && last.counter === now.counter)) return now.counter;
  if (last.kind === "defend" && !last.met && now.kind === "strike") return last.counter;
  return null;
}

export const defendWord = (move: string): string => WORDS[move] ?? "DEFENDED!";

export function DefendFlash({ phase }: { phase: CombatPhase }) {
  const now = defendSeen(phase);
  const [last, setLast] = useState(now);
  const [shown, setShown] = useState<{ move: string; id: number } | null>(null);
  if (now.kind !== last.kind || now.counter !== last.counter || now.met !== last.met) {
    setLast(now);
    const move = defendCounted(last, now);
    if (move !== null) setShown({ move, id: (shown?.id ?? 0) + 1 });
  }
  useEffect(() => {
    if (shown === null) return undefined;
    const timer = window.setTimeout(() => { setShown(null); }, SHOW_MS);
    return () => { window.clearTimeout(timer); };
  }, [shown]);
  if (shown === null) return null;
  return (
    <div className="hb-defend" key={shown.id} data-move={shown.move} role="status">
      <div className="hb-defend__rim" />
      <div className="hb-defend__word">{defendWord(shown.move)}</div>
    </div>
  );
}
