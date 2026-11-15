// Draft switch: the address's ?look=<letter> is read once at load and set as data-look on <html>. With no ?look the game is unchanged.
// ?cutAt=<ms> (only read under a look) freezes the cutscene clock at that time, for repeatable pictures.
const params = new URLSearchParams(window.location.search);
const raw = params.get("look") ?? "";

export const LOOK: string = /^[a-z]$/.test(raw) ? raw : "";
const frozen = Number(params.get("cutAt"));
export const CUT_AT: number | null = LOOK !== "" && params.has("cutAt") && Number.isFinite(frozen) && frozen >= 0 ? frozen : null;

if (LOOK !== "") document.documentElement.dataset["look"] = LOOK;
