// The edge pieces of the HUD: the two health bars and the score plate. Bars fill stone by stone; a hit knocks pebbles loose below.
import { PebbleBar, Panel, type MeterTone } from "../ui/pebble";
import { useBoxSize } from "../ui/pebble/hooks";
import { useLandedScore } from "./RatingFlash";

/** A name tag over a bar. `value` is 0 to 1. The monster's bar empties toward the right edge. */
export function HpBar(props: { label: string; value: number; side: "left" | "right" }) {
  const { label, side } = props;
  const [ref, box] = useBoxSize<HTMLDivElement>();
  const tone: MeterTone = side === "left" ? "player" : "enemy";
  return (
    <div className={`hb-bar hb-bar--${side}`}>
      <span className="hb-name">{label}</span>
      <div className="hb-bar__frame">
        <div ref={ref} className="hb-bar__inner">
          {box.w > 40 && (
            <PebbleBar value={Math.max(0, Math.min(1, props.value))} width={box.w} tone={tone} dir={side === "left" ? 1 : -1} seed={side === "left" ? 11 : 12} label={`${label} health`} />
          )}
        </div>
      </div>
    </div>
  );
}

export function ScorePlate({ score, combo }: { score: number; combo: number }) {
  const shown = useLandedScore(score);
  return (
    <div className="hb-score-wrap">
      <Panel as="div" tone="dusk" className="hb-score">{shown}</Panel>
      {combo > 1 && <span className="hb-combo">x{combo} combo</span>}
    </div>
  );
}
