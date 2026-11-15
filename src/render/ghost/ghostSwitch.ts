/** The one switch for the gold move ghost (GhostFigure). Off by default: toyeshhm saw it on and off on Saturday 6:55 PM and chose off. Flip the default here, or override per page with ?ghost=0 / ?ghost=1. */
export const MOVE_GHOST_DEFAULT = false;

export function moveGhostEnabled(search: string, fallback: boolean = MOVE_GHOST_DEFAULT): boolean {
  const value = new URLSearchParams(search).get("ghost");
  return value === "1" ? true : value === "0" ? false : fallback;
}

export const MOVE_GHOST_ON = moveGhostEnabled(typeof window === "undefined" ? "" : window.location.search);
