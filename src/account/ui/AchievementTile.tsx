// One achievement: badge, name, how to get it, and a stone bar for the ones that count something.
import type { Achievement } from "../achievements";
import { PebbleBar } from "../../ui/pebble";
import { look } from "../../ui/lookSwitch";
import { Badge } from "./Badge";

// Draft looks: A hangs bigger bronze medallions, C bigger mosaic badges.
const BADGE = look === "a" ? 72 : look === "c" ? 64 : 56;

export function AchievementTile(props: { feat: Achievement }) {
  const { feat } = props, { progress } = feat;
  return (
    <li className={`acc-feat ${feat.done ? "is-done" : "is-locked"}`}>
      <Badge id={feat.id} size={BADGE} done={feat.done} />
      <div className="acc-feat__text">
        <b>{feat.name}</b>
        <span className="acc-feat__state">{feat.done ? "Unlocked" : "Locked"}</span>
        {progress && !feat.done ? (
          <span className="acc-feat__progress">
            <PebbleBar value={progress.have / progress.goal} width={96} d={7} tone="ochre" label={`${feat.name}: ${String(progress.have)} of ${String(progress.goal)} ${progress.unit}`} />
            <span aria-hidden="true">{progress.have}/{progress.goal}</span>
          </span>
        ) : (
          <small>{feat.how}</small>
        )}
      </div>
    </li>
  );
}
