// What the hoplite's gear shows, as plain data so it is unit-tested without a browser.
import { isThrust, strikeWindow } from "../heroClips";
import type { Timed } from "../heroClips";

export type SpearMode = "carry" | "thrust" | "away";

export interface GearInput {
  readonly held: ReadonlySet<string>;
  readonly struckMove: string;
  readonly sinceStrike: number;
  readonly finisherMove: string | null;
  readonly lost: boolean;
}

/** The spear leads a thrust, and is out of the way while a fist or kick is thrown (the hand must be free) and once the hero has fallen. */
export function spearMode(input: GearInput, punch: Timed, thrust: Timed): SpearMode {
  if (input.lost) return "away";
  const spear = isThrust(input.struckMove, input.finisherMove);
  const window = strikeWindow(spear ? thrust : punch);
  if (input.sinceStrike >= window) return "carry";
  return spear ? "thrust" : "away";
}

export function shieldRaised(held: ReadonlySet<string>): boolean {
  return held.has("block");
}
