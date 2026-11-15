// The main menu's four cards as hoplite shields: a bronze aspis with its device in relief, a spear slung behind it and the
// name on a bronze ribbon. Each device is drawn from five kinds of mark, painted in menuShields.css: .f the figure,
// .l lines, .s incised detail, .e a bright accent, .h an opening. The quest map borrows the galley for its ship.
import type { ReactNode } from "react";
import "./menuShields.css";

/** A Corinthian helmet seen from the front, with a fan crest. */
const HELMET = (
  <>
    <path className="f" d="M3 21 C2 6 12 0 22 0 C32 0 42 6 41 21 L36 21 C36 11 30 7 22 7 C14 7 8 11 8 21 Z" />
    <path className="s" d="M12 4 L14 9 M22 1.5 V6 M32 4 L30 9" />
    <path className="f" d="M5 28 C5 15 39 15 39 28 L39 52 C39 60 34 64 29 64 L15 64 C10 64 5 60 5 52 Z" />
    <path className="s" d="M7 29 Q22 23 37 29" />
    <path className="h" d="M8 34 Q14 32 20.5 35 L20.5 41 Q14 41.5 8 40 Z M36 34 Q30 32 23.5 35 L23.5 41 Q30 41.5 36 40 Z M19 45 Q22 43 25 45 L27 64 L17 64 Z" />
  </>
);

const LEAVES = [1, -1].flatMap((side) =>
  Array.from({ length: 8 }, (_, k) => {
    const a = ((100 + k * 18) * Math.PI) / 180, out = k % 2 === 0 ? 1 : -1;
    const x = 48 + 31 * Math.cos(a) + Math.cos(a) * 4.5 * out - Math.sin(a) * 2, y = 44 + 31 * Math.sin(a) + Math.sin(a) * 4.5 * out + Math.cos(a) * 2;
    const deg = (Math.atan2(Math.cos(a), -Math.sin(a)) * 180) / Math.PI + out * 32;
    return { x: side === 1 ? x : 96 - x, y, deg: side === 1 ? deg : 180 - deg };
  }),
);

/** A war galley under sail, in a 96 x 96 box: Story mode's device and the ship on the quest map. */
export const GALLEY = (
  <>
    <path className="l" d="M46.5 9 V52 M23 15 H70" />
    <path className="f" d="M27 18 H67 L64 46 H30 Z" />
    <path className="s" d="M37 20 L38 44 M56 20 L55 44 M29 31 H65" />
    <path className="f" d="M10 34 Q6 50 18 60 L80 60 L93 65 L87 55 L89 51 L22 51 Q15 46 15 34 Z" />
    <circle className="f" cx="12.5" cy="32" r="3.5" />
    <circle className="e" cx="82" cy="55.5" r="2.3" />
    <path className="l" d="M28 61 L20 74 M38 61 L32 74 M48 61 L44 74 M58 61 L56 74 M68 61 L68 74" />
    <path className="l" d="M3 83 q7 -6 14 0 t14 0 t14 0 t14 0 t14 0 t14 0 t8 0" />
  </>
);

export const DEVICES = {
  ship: GALLEY,
  pair: (
    <>
      <g transform="translate(2 16)">{HELMET}</g>
      <g transform="translate(50 16)">{HELMET}</g>
    </>
  ),
  shield: (
    <>
      <path className="l" d="M12 88 L84 12 M84 88 L12 12" />
      <path className="f" d="M88 8 L74 14 L82 22 Z M8 8 L22 14 L14 22 Z" />
      <circle className="f" cx="48" cy="50" r="29" />
      <circle className="s" cx="48" cy="50" r="23" />
      <path className="e" d="M37 65 L48 35 L59 65 L53.5 65 L48 49 L42.5 65 Z" />
    </>
  ),
  laurel: (
    <>
      <path className="l" d="M45 76 A31 31 0 0 1 28 21 M51 76 A31 31 0 0 0 68 21" />
      {LEAVES.map((leaf) => (
        <ellipse key={`${String(leaf.x)}|${String(leaf.y)}`} className="f" cx={leaf.x} cy={leaf.y} rx="7.5" ry="3.2" transform={`rotate(${String(leaf.deg)} ${String(leaf.x)} ${String(leaf.y)})`} />
      ))}
      <path className="f" d="M43 77 L35 92 L41 89 L43 94 L48 81 L53 94 L55 89 L61 92 L53 77 Z" />
      <circle className="e" cx="48" cy="77" r="4" />
    </>
  ),
};

/** The bronze the devices are cast in. Rendered once on each screen that shows them. */
export function BronzeDefs() {
  return (
    <svg className="bronze-defs" width="0" height="0" aria-hidden="true">
      <defs>
        <linearGradient id="bronze-cast" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe6b0" />
          <stop offset="0.35" stopColor="#e0a552" />
          <stop offset="0.7" stopColor="#a86424" />
          <stop offset="1" stopColor="#5a300f" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** One card of the main menu. The name comes first in the button's text, so its accessible name starts with it. */
export function ShieldCard(props: { primary?: boolean; device: ReactNode; name: string; line?: string; className?: string; autoFocus?: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`menu-shield ${props.primary ? "menu-shield--primary" : ""} ${props.className ?? ""}`} autoFocus={props.autoFocus} onClick={props.onClick}>
      <span className="menu-shield__wrap" aria-hidden="true">
        <span className="menu-shield__spear" />
        <span className="menu-shield__aspis">
          <svg className="menu-shield__face" viewBox="0 0 120 120">
            <circle className="menu-shield__studs" cx="60" cy="60" r="54" />
            <circle className="menu-shield__dentils" cx="60" cy="60" r="49" />
            <circle className="menu-shield__band" cx="60" cy="60" r="45.5" />
            <g className="bronze-device" transform="translate(22 21) scale(0.79)">{props.device}</g>
          </svg>
          <span className="menu-shield__glint"><i /></span>
        </span>
      </span>
      <span className="menu-shield__name">{props.name}</span>
      {props.line && <small className="menu-shield__line">{props.line}</small>}
    </button>
  );
}
