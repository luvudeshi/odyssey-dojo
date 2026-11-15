// A design direction chosen by the page address (?look=marble), read once at load and set as data-look on <html>.
// With no ?look nothing is set and every screen renders as before.
const read = (): string | null => {
  try {
    return new URLSearchParams(window.location.search).get("look");
  } catch {
    return null;
  }
};

export const LOOK: string | null = read();
if (LOOK) document.documentElement.dataset.look = LOOK;

/** True when the page was opened with ?look=marble. */
export const MARBLE = LOOK === "marble";
