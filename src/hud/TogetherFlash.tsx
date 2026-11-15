// "Together!" for a moment when both players' strikes landed in one frame, and a tag while two people fight.
import { useEffect, useState } from "react";
import type { CombatEvent } from "../core/types";
import { RiftPlate } from "./sky/rift/RiftPlate";

const SHOW_MS = 900;
const listeners = new Set<() => void>();

export function noteTogether(event: CombatEvent): void {
  if (event.type === "enemyHit" && event.together) listeners.forEach((listen) => { listen(); });
}

export function TogetherFlash({ two }: { two: boolean }) {
  const [id, setId] = useState(0);
  useEffect(() => {
    let timer = 0;
    const listen = (): void => {
      setId((n) => n + 1);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { setId(0); }, SHOW_MS);
    };
    listeners.add(listen);
    return () => { listeners.delete(listen); window.clearTimeout(timer); };
  }, []);
  return (
    <>
      {two && <div className="hb-duo"><RiftPlate tone="glass" />You + Friend</div>}
      {id > 0 && <div className="hb-together" key={id}><RiftPlate tone="lava" />Together! x2</div>}
    </>
  );
}
