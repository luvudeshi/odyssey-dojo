// Draft round only: `?look=a|b|c|d` picks one of the look directions being compared. Read once at load and set as
// data-look on <html>, so each direction is a block of CSS scoped to html[data-look="x"]. No query: the screens as they are.
const raw = new URLSearchParams(window.location.search).get("look");

export type Look = "a" | "b" | "c" | "d";

export const look: Look | null = raw === "a" || raw === "b" || raw === "c" || raw === "d" ? raw : null;

if (look) document.documentElement.dataset.look = look;
