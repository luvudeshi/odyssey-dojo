// Draft rounds: ?look=a|b|c is read once at load and set as data-look on <html>. Delete with the losing looks.
const value = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("look");
export const LOOK: "a" | "b" | "c" | "d" | null = value === "a" || value === "b" || value === "c" || value === "d" ? value : null;
if (LOOK) document.documentElement.dataset.look = LOOK;
