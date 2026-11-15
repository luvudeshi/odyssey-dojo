// Keys the cutscene swallowed on keydown. Once it ends, only these keys stay swallowed: repeats while held, and the one keyup.
// Every other key passes straight through. Returns true when the event must be swallowed.
export function swallowAfterCut(pending: Set<string>, type: "keydown" | "keyup", code: string, repeat: boolean): boolean {
  if (!pending.has(code)) return false;
  if (type === "keyup") { pending.delete(code); return true; }
  return repeat;
}
