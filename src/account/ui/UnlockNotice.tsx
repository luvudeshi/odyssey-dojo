// The notice shown over the result screen when a fight unlocks achievements. Every new one gets a card; all of them go by themselves.
import { useEffect, useRef } from "react";
import type { Achievement } from "../achievements";
import { playUnlock } from "../../audio/sfx";
import { Badge } from "./Badge";

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
  return (
    <div className="acc-notice" role="status" aria-live="polite">
      {items.map((feat, index) => (
        <div key={feat.id} className="acc-notice__card" style={{ animationDelay: `${String(index * 220)}ms` }}>
          <Badge id={feat.id} size={56} done />
          <div>
            <small>Achievement unlocked</small>
            <b>{feat.name}</b>
          </div>
        </div>
      ))}
    </div>
  );
}
