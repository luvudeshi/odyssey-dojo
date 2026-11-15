// On a window narrower than about 700 px (a phone), a full-screen notice in front of the game: open this on a laptop.
// "Continue anyway" closes it for the tab. It is drawn beside the app, so it covers whichever screen the address opens.
import { useState, useSyncExternalStore } from "react";
import { SetTitle } from "../set/Set";
import { noticeAllowed, noticeRoom, readDismissed, shouldShowNotice, writeDismissed } from "./noticeRules";
import "./phoneNotice.css";

function tabStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function onResize(change: () => void): () => void {
  window.addEventListener("resize", change);
  return () => { window.removeEventListener("resize", change); };
}

/** The notice itself. `room` is the code from the address, or null. */
export function PhoneNoticeView(props: { room: string | null; onContinue: () => void }) {
  return (
    <div className="phone-notice" role="dialog" aria-modal="true" aria-label="Open this on a laptop">
      <div className="set-panel phone-notice__panel">
        <SetTitle kicker="Best on a laptop">Odyssey Dojo</SetTitle>
        <p className="set-sub">You play this game standing in front of a laptop's webcam, or on its keyboard. A phone is too small for it.</p>
        <p className="set-sub">Open <b>odysseydojo.club</b> on a laptop.</p>
        {props.room !== null && <p className="set-sub phone-notice__room">Your room code is <b>{props.room}</b>. Type it on the laptop to join.</p>}
        <button type="button" className="set-btn set-btn--primary" onClick={props.onContinue}>Continue anyway</button>
      </div>
    </div>
  );
}

export function PhoneNotice() {
  const width = useSyncExternalStore(onResize, () => window.innerWidth);
  const [dismissed, setDismissed] = useState(() => readDismissed(tabStore()));
  const search = window.location.search;
  if (!noticeAllowed(search) || !shouldShowNotice(width, dismissed)) return null;
  return <PhoneNoticeView room={noticeRoom(search)} onContinue={() => { writeDismissed(tabStore()); setDismissed(true); }} />;
}
