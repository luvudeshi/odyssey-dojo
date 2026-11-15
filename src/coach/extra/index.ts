import type { MoveDef } from "../../core/types";
/** A style the Dojo can train. Dojo-only styles live here, not in src/styles. */
export interface DojoStyleDef { readonly id: string; readonly name: string; readonly line: string; readonly strikes: readonly string[] }
/** Moves only the Dojo knows. Never registered with the fights. */
export const EXTRA_MOVES: readonly MoveDef[] = [];
export const EXTRA_STYLES: readonly DojoStyleDef[] = [];
