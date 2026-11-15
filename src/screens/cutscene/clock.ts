// The cutscene's clock, shared with the camera rig (which draws the shot). ms is null when no cutscene runs.
import { LOOK } from "../../ui/lookSwitch";

export const cutClock: { ms: number | null; enemyId: string } = { ms: null, enemyId: "" };

/** The cutscene is a draft: it plays only when the page was opened with ?look=b. */
export const CUTSCENE_ON = LOOK === "b";

/** ?cutAt=<ms> freezes the clock there for repeatable pictures. Only under ?look. */
const raw = LOOK ? new URLSearchParams(window.location.search).get("cutAt") : null;
export const CUT_AT: number | null = raw !== null && Number.isFinite(Number(raw)) ? Number(raw) : null;
