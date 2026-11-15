// Keys whose keydown the cutscene swallowed. After it ends, only these keys are held back from the fight: their
// auto-repeat keydowns and the one keyup that finishes the press. Every other key passes straight through.
export interface Swallowed { readonly keys: Set<string> }

export function newSwallowed(): Swallowed { return { keys: new Set() }; }

/** Records a swallowed keydown. */
export function noteDown(s: Swallowed, code: string): void { s.keys.add(code); }

/** True when this event must be swallowed after the cutscene ended. A matching keyup is swallowed once and forgotten. */
export function swallowAfter(s: Swallowed, type: "keydown" | "keyup", code: string, repeat: boolean): boolean {
  if (!s.keys.has(code)) return false;
  if (type === "keyup") { s.keys.delete(code); return true; }
  return repeat;
}
