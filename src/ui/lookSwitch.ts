// Draft switch: ?look=<letter> is read once at load and set as data-look on <html>. With no ?look nothing changes.
const raw = new URLSearchParams(window.location.search).get("look");

/** The letter after ?look=, or null when the address has none. */
export const LOOK: string | null = raw !== null && /^[a-z]$/.test(raw) ? raw : null;

if (LOOK !== null) document.documentElement.dataset["look"] = LOOK;

/** Capture aid, only under ?look: ?cutAt=<ms> freezes a draft's animation clock at that time. */
export const CUT_AT: number | null = (() => {
  const at = new URLSearchParams(window.location.search).get("cutAt");
  const ms = at === null ? Number.NaN : Number(at);
  return LOOK !== null && Number.isFinite(ms) && ms >= 0 ? ms : null;
})();
