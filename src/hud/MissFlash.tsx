// The MISS word: the same flash as GOOD / GREAT / PERFECT (it wears the same class for size and place), in a cold red.
import { useEffect, useState } from "react";
import "./missFlash.css";

const SHOW_MS = 700;
const listeners = new Set<() => void>();

export function noteMiss(): void {
  listeners.forEach((listen) => { listen(); });
}

export function MissFlash() {
  const [id, setId] = useState(0);
  useEffect(() => {
    let timer = 0;
    let n = 0;
    const listen = (): void => {
      n += 1;
      setId(n);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { setId(0); }, SHOW_MS);
    };
    listeners.add(listen);
    return () => { listeners.delete(listen); window.clearTimeout(timer); };
  }, []);
  return id > 0 ? <div className="hb-rating hb-miss" key={id}>MISS</div> : null;
}
