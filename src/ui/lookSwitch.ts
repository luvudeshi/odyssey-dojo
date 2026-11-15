// Draft round only: `?look=a|b|c` picks one of the look directions being compared. Read once at load and set as
// data-look on <html>, so each direction is a block of CSS scoped to html[data-look="x"]. No query: the screens as they are.
const raw = new URLSearchParams(window.location.search).get("look");

export const look: "a" | "b" | "c" | null = raw === "a" || raw === "b" || raw === "c" ? raw : null;

if (look) document.documentElement.dataset.look = look;

// Draft round only: `?cleared=3` or `?cleared=all` (with a ?look) marks the first stops of the quest map won, so the
// pictures can show cleared stops and the lit Ithaca. Remove with the looks.
const rawCleared = new URLSearchParams(window.location.search).get("cleared");
export const draftCleared: number | null = rawCleared === "all" ? Infinity : rawCleared && /^\d+$/.test(rawCleared) ? Number(rawCleared) : null;
