// More moves and more styles for the Training Dojo only. Nothing here is in the game's registries
// (src/moves/registry.ts, src/styles/registry.ts), so the fights never ask for these moves.
// docs/dojo-moves.md has the table of moves, what each one is for, and the sources.
import type { MoveDef } from "../../core/types";
import type { Measure } from "../../moves/measures";
import * as elbowStrike from "./moves/elbowStrike";
import * as highBlock from "./moves/highBlock";
import * as lowBlock from "./moves/lowBlock";
import * as lowKick from "./moves/lowKick";
import * as palmHeel from "./moves/palmHeel";
import * as roundhouseKick from "./moves/roundhouseKick";
import * as sideKick from "./moves/sideKick";
import * as wristRelease from "./moves/wristRelease";

export type { DojoStyleDef } from "./styles";
export { EXTRA_STYLES } from "./styles";
export { EXTRA_GUIDES, extraGuideFor } from "./guides";
export { EXTRA_NEEDS_LEGS, EXTRA_TIPS, judgeExtraRep } from "./tips";

const ALL = [roundhouseKick, sideKick, lowKick, elbowStrike, palmHeel, wristRelease, highBlock, lowBlock];

/** The extra moves: kicks first, then hand moves, then the two blocks. */
export const EXTRA_MOVES: readonly MoveDef[] = ALL.map((each) => each.move);

/**
 * What each extra move's detector checks, in the shape of MEASURES in src/moves/measures.ts: one list per side.
 * Pass `{ ...MEASURES, ...EXTRA_MEASURES }` as the `table` of `liveChecks` (../guide.ts) for the live checklist.
 */
export const EXTRA_MEASURES: Readonly<Record<string, readonly (readonly Measure[])[]>> = Object.fromEntries(
  ALL.map((each) => [each.move.id, each.measures]),
);

/** An extra move by id, in the shape of the `moveOf` lookup that ../dojo.ts takes. */
export function extraMove(id: string): MoveDef | undefined {
  return EXTRA_MOVES.find((move) => move.id === id);
}
