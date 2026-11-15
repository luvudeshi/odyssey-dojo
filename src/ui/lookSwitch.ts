// Draft looks: ?look=a, ?look=b or ?look=c is read once at load and set as data-look on <html>. Without it, nothing changes.
export type LookId = "a" | "b" | "c";

const raw = new URLSearchParams(window.location.search).get("look");
export const look: LookId | null = raw === "a" || raw === "b" || raw === "c" ? raw : null;
if (look) document.documentElement.dataset.look = look;
