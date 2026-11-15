// The 3D figure slot of the move guide: an empty box that borrows the one shared canvas (./guideStage) while it is on
// screen. It is the part of MoveGuide that is replaced by the flat SVG when WebGL is missing or lost.
import { useEffect, useRef } from "react";
import type { Guide } from "../guide";
import { stage } from "./guideStage";

export function MoveGuide3D(props: { guide: Guide; mirrored: boolean; onFail: () => void }) {
  const { guide, mirrored, onFail } = props;
  const slot = useRef<HTMLDivElement>(null);
  // The newest callback, so a parent that re-renders does not restart the figure.
  const fail = useRef(onFail);
  useEffect(() => { fail.current = onFail; }, [onFail]);
  useEffect(() => {
    const holder = slot.current;
    if (!holder) return;
    stage.attach(holder, guide, mirrored, () => { fail.current(); });
    return () => { stage.detach(holder); };
  }, [guide, mirrored]);
  return <div ref={slot} className="mg-3d" role="img" aria-label={`${guide.title}, acted out by a 3D figure`} />;
}
