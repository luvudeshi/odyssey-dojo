// The divine power meter: a row of ochre stones that glows when full. Shown once it has started to fill.
import { PebbleDots } from "../ui/pebble";

export function PowerBar({ power }: { power: number }) {
  if (power <= 0) return null;
  return (
    <div className="hb-power">
      <span>Power</span>
      <PebbleDots value={power} n={20} d={12} tone="power" glow={power >= 1} label="Divine power" />
    </div>
  );
}
