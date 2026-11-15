// The notice shown beside the result panel when a fight unlocks achievements. The first few get a card each and one line
// counts the rest (unlockStack.ts); all of them go by themselves.
import { useEffect, useRef } from "react";
import type { Achievement } from "../achievements";
import { playUnlock } from "../../audio/sfx";
import { Badge } from "./Badge";
import { moreLine, stackOf } from "./unlockStack";
import "./unlockNotice.css";

export const NOTICE_MS = 6000;

export function UnlockNotice(props: { items: readonly Achievement[]; onDone: () => void }) {
  const { items } = props;
  // Kept in a ref so a parent that re-renders does not restart the clock.
  const done = useRef(props.onDone);
  useEffect(() => { done.current = props.onDone; });
  useEffect(() => {
    if (items.length === 0) return;
    playUnlock();
    const timer = setTimeout(() => { done.current(); }, NOTICE_MS);
    return () => { clearTimeout(timer); };
  }, [items]);
  const { shown, more } = stackOf(items);
  return (
    <div className="acc-notice acc-stack" role="status" aria-live="polite">
      {shown.map((feat, index) => (
        <div key={feat.id} className="acc-notice__card" style={{ animationDelay: `${String(index * 220)}ms` }}>
          <Badge id={feat.id} size={48} done />
          <div>
            <small>Achievement unlocked</small>
            <b>{feat.name}</b>
          </div>
        </div>
      ))}
      {more > 0 && (
        <div className="acc-notice__card acc-notice__more" style={{ animationDelay: `${String(shown.length * 220)}ms` }}>{moreLine(more)}</div>
      )}
    </div>
  );
}
