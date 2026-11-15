// The rules of the phone notice (PhoneNotice.tsx): when it is shown, and what it remembers for the tab.
import { roomFromSearch } from "../../screens/roomUrl";

/** Windows narrower than this get the notice. At this width and wider it is never shown. */
export const NARROW_BELOW = 700;

/** The key in the tab's sessionStorage that says "Continue anyway" was pressed. Nothing else is kept, and no cookie. */
export const DISMISSED_KEY = "odyssey.phone.continue";

/** True when the notice stands in front of the game: a narrow window, and "Continue anyway" not yet pressed in this tab. */
export function shouldShowNotice(width: number, dismissed: boolean): boolean {
  return !dismissed && width < NARROW_BELOW;
}

/** False for an address that asks for the FaceTime picture (`?ftframe=`): that picture is drawn for a phone and never gets the notice. */
export function noticeAllowed(search: string): boolean {
  return !new URLSearchParams(search).has("ftframe");
}

/** The room code in the address (`?room=ABCD`), cleaned, or null. The notice says it so it can be typed on the laptop. */
export function noticeRoom(search: string): string | null {
  return roomFromSearch(search);
}

type TabStore = Pick<Storage, "getItem" | "setItem">;

/** Whether "Continue anyway" was pressed in this tab. A store that is missing or throws (some private windows) reads as not pressed. */
export function readDismissed(store: TabStore | null): boolean {
  try {
    return store !== null && store.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Remembers the press for the tab. A store that refuses is ignored: the notice still closes for this page load. */
export function writeDismissed(store: TabStore | null): void {
  try {
    store?.setItem(DISMISSED_KEY, "1");
  } catch {
    // Nothing to do: the caller keeps the press in memory.
  }
}
