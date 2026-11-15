// Which key events the cutscene still eats after it swallowed a key's keydown: that key's auto-repeats, and its one keyup.
// Everything else passes, so a key tapped at the start of the fight is never left held.
export function swallowAfter(held: Set<string>, type: "keydown" | "keyup", code: string, repeat: boolean): boolean {
  if (!held.has(code)) return false;
  if (type === "keyup") { held.delete(code); return true; }
  return repeat;
}
