// Draft looks: ?look=a, ?look=b or ?look=c is read once at load and set as data-look on <html>. No ?look means today's screen.
export type Look = "a" | "b" | "c";
const raw = new URLSearchParams(window.location.search).get("look");
export const LOOK: Look | null = raw === "a" || raw === "b" || raw === "c" ? raw : null;
if (LOOK) document.documentElement.dataset.look = LOOK;
