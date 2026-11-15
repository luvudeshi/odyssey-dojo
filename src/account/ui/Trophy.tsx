// One achievement as a trophy hung on the hall wall: won, it hangs in gilt bronze from its peg; not yet won, the peg is
// empty and the trophy's outline is chalked on the wall. The name is always shown, and a counted deed shows how far along.
import type { Achievement } from "../achievements";
import { FEAT_ICON, Icon } from "./icons";

export interface TrophyEvents {
  readonly onMouseEnter: () => void;
  readonly onMouseLeave: () => void;
  readonly onFocus: () => void;
  readonly onBlur: () => void;
}

export function Trophy(props: { feat: Achievement; active: boolean; events: TrophyEvents }) {
  const { feat } = props, p = feat.progress;
  return (
    <li>
      <button type="button" className={`acc-trophy ${feat.done ? "is-done" : "is-locked"} ${props.active ? "is-active" : ""}`}
        aria-label={`${feat.name}. ${feat.done ? "Won" : "Not won yet"}. ${feat.how}${p && !feat.done ? ` ${String(p.have)} of ${String(p.goal)} ${p.unit}.` : ""}`} {...props.events}>
        <span className="acc-trophy__peg" aria-hidden="true" />
        <Icon name={FEAT_ICON[feat.id] ?? "laurel"} className="acc-trophy__icon" />
        <span className="acc-trophy__name">{feat.name}{p && !feat.done && <small> {p.have}/{p.goal}</small>}</span>
      </button>
    </li>
  );
}
