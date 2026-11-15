// Whether the player can see the game. A hidden tab plays nothing: the game stands still there, so its sound would be heard with no picture.

/** True while the tab is hidden: another tab is in front, or the window is minimised or fully covered. False where there is no page. */
export function tabHidden(): boolean {
  return typeof document !== "undefined" && document.hidden;
}

/** Calls `listener` every time the tab is hidden or shown again, with true for hidden. Does nothing where there is no page. */
export function watchTab(listener: (hidden: boolean) => void): void {
  if (typeof document === "undefined") return;
  document.addEventListener("visibilitychange", () => {
    listener(document.hidden);
  });
}
