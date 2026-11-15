// Reads ?look=<letter> once at load and marks <html data-look>. With no ?look the game is as on main.
const look = new URLSearchParams(window.location.search).get("look");
if (look) document.documentElement.dataset.look = look;

/** The draft look this page was opened with, or null. */
export const LOOK: string | null = look;
