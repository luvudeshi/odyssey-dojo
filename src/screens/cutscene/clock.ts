// The cutscene's clock, shared with the camera rig (which draws the shot). ms is null when no cutscene runs.
export const cutClock: { ms: number | null; enemyId: string } = { ms: null, enemyId: "" };

/** ?cutAt=<ms> freezes the clock there, for repeatable pictures. */
const raw = new URLSearchParams(window.location.search).get("cutAt");
export const CUT_AT: number | null = raw !== null && Number.isFinite(Number(raw)) ? Number(raw) : null;
