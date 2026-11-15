import { drawLayout } from "./draw";
import { lossLayout, wreathLayout } from "./ornaments";
import { PebbleCanvas } from "./PebbleCanvas";
import { makeRng, newLayout } from "./stones";

/** The result-panel ornament: the win wreath or the loss rosette, `size` px square, drawn once per size and cached. */
export function Ornament(props: { kind: "wreath" | "rosette"; size?: number; className?: string }) {
  const size = props.size ?? 130;
  return (
    <span className={`pb-ornament ${props.className ?? ""}`} aria-hidden="true" style={{ display: "inline-block", lineHeight: 0 }}>
      <PebbleCanvas width={size} height={size} cacheKey={`ornament|${props.kind}`} draw={(ctx) => {
        const l = newLayout(), r = makeRng(props.kind === "wreath" ? 11 : 12);
        if (props.kind === "wreath") wreathLayout(l, r, size); else lossLayout(l, r, size);
        drawLayout(ctx, l);
      }} />
    </span>
  );
}
