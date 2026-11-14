// The god scan before the style menu, for webcam play. It can be skipped by button, by Esc or S, and it ends by itself.
import { useEffect, useRef } from "react";
import { RevealScreen } from "../ai/ui/RevealScreen";
import type { GodReveal } from "../ai/revealGod";
import type { PoseTracker } from "../pose/tracker";
import { GOD_SCAN_LIMIT_MS, skipsScan } from "./hookups";
import "./godScan.css";

/** `onDone` gets the god, or null when the player skipped or the time ran out. It is called once. */
export function GodScan(props: { tracker: PoseTracker; onDone: (god: GodReveal | null) => void }) {
  const done = useRef(props.onDone);
  const finished = useRef(false);
  useEffect(() => { done.current = props.onDone; });

  const finish = useRef((god: GodReveal | null): void => {
    if (finished.current) return;
    finished.current = true;
    done.current(god);
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => { if (skipsScan(event.key)) finish.current(null); };
    window.addEventListener("keydown", onKey);
    const timer = window.setTimeout(() => { finish.current(null); }, GOD_SCAN_LIMIT_MS);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <>
      <RevealScreen tracker={props.tracker} onDone={(god) => { finish.current(god); }} />
      <button className="scan-skip" onClick={() => { finish.current(null); }}>Skip (Esc)</button>
    </>
  );
}
