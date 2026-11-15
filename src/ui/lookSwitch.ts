// Draft switch for the fight HUD options: ?look=a, ?look=b or ?look=c is read once at load and set as data-look on <html>.
// With no ?look nothing is set and the HUD renders as it does. Delete this file and src/hud/sky/looks/ when one is picked.
export type Look = "a" | "b" | "c";

const asked = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("look");
const look: Look | null = asked === "a" || asked === "b" || asked === "c" ? asked : null;
if (look !== null) document.documentElement.dataset.look = look;

/** The look asked for in the address, or null for the HUD as it stands. */
export const currentLook = (): Look | null => look;
