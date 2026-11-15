// Draft looks: a page opened with ?look=<key> sets data-look on <html> once, at load. Without it every screen is as on main.
const look = new URLSearchParams(window.location.search).get("look") ?? "";
if (look !== "") document.documentElement.dataset.look = look;

/** True when the page was opened with ?look=<key>. */
export const lookIs = (key: string): boolean => look === key;
