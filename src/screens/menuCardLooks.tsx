// Draft round two (?look=a|b|c): the four main menu cards as obsidian shards (A), hoplite shields (B) or the doorways
// of a temple front (C), with richer icons.
// Every icon is drawn from four kinds of mark, so each look paints the same picture its own way:
// .f solid figure, .l figure lines, .s incised detail, .e accent, .h an opening. The styles are in menuCardLooks.css.
import type { ReactNode } from "react";
import { look } from "../ui/lookSwitch";

/** A Corinthian helmet seen from the front, with a fan crest; .h marks the openings, painted in the card's own colour. */
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

export const RICH_ICONS = {
  ship: (
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
  ),
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

/** Paint servers the marks use. One per page. */
export function LookDefs() {
  return (
    <svg className="lk-defs" width="0" height="0" aria-hidden="true">
      <defs>
        <linearGradient id="lk-bronze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe6b0" />
          <stop offset="0.35" stopColor="#e0a552" />
          <stop offset="0.7" stopColor="#a86424" />
          <stop offset="1" stopColor="#5a300f" />
        </linearGradient>
        <linearGradient id="lk-gold" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor="#fff4cf" />
          <stop offset="0.45" stopColor="#f2c56e" />
          <stop offset="1" stopColor="#9a6420" />
        </linearGradient>
        <linearGradient id="lk-glass" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#2a3142" />
          <stop offset="0.3" stopColor="#10131c" />
          <stop offset="0.75" stopColor="#07080d" />
          <stop offset="1" stopColor="#1a0d08" />
        </linearGradient>
        <radialGradient id="lk-heat" cx="0.5" cy="1" r="0.75">
          <stop offset="0" stopColor="#ff7a1e" stopOpacity="0.55" />
          <stop offset="0.45" stopColor="#c8400f" stopOpacity="0.18" />
          <stop offset="1" stopColor="#c8400f" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

const SHARDS = [
  "M30 40 L92 2 L150 22 L186 64 L194 250 L160 298 L40 296 L8 246 L6 90 Z",
  "M8 70 L56 18 L120 0 L176 34 L196 110 L190 262 L150 298 L36 290 L4 230 Z",
  "M20 30 L70 12 L132 4 L170 40 L196 84 L192 238 L172 296 L30 298 L6 252 L4 100 Z",
  "M6 50 L78 4 L118 16 L190 58 L194 240 L168 296 L44 298 L10 260 Z",
];
const FACETS = "M6 90 L36 70 L92 2 M36 70 L164 66 L186 64 M164 66 L166 254 L194 250 M166 254 L36 256 L8 246 M36 256 L36 70 M36 256 L40 296 M166 254 L160 298";
// Cracks keep out of the band the name and line sit in.
const CRACKS = "M100 4 L96 22 L108 34 L100 50 L106 60 M196 96 L178 104 L170 92 L156 100 M4 104 L20 96 L30 110 L42 104 M60 296 L70 272 L86 264 L82 246 M150 298 L144 276 L156 262 L150 250 M196 250 L178 244 L172 256";

/** Look A: a shard of black glass with lava in its cracks. */
function Shard(props: { index: number; icon: ReactNode }) {
  const flip = props.index % 2 === 1 ? "translate(200 0) scale(-1 1)" : undefined;
  return (
    <>
      <svg className="lk-shard" viewBox="0 0 200 300" preserveAspectRatio="none" aria-hidden="true">
        <path className="lk-shard__glass" d={SHARDS[props.index] ?? SHARDS[0]} />
        <path className="lk-shard__heat" d={SHARDS[props.index] ?? SHARDS[0]} />
        <path className="lk-shard__facet" d={FACETS} />
        <path className="lk-shard__crack" d={CRACKS} transform={flip} />
        <path className="lk-shard__hot" d={CRACKS} transform={flip} />
        <path className="lk-shard__edge" d={SHARDS[props.index] ?? SHARDS[0]} />
      </svg>
      <svg className="lk-icon" viewBox="0 0 96 96" aria-hidden="true">{props.icon}</svg>
      <span className="lk-embers" aria-hidden="true">{[12, 26, 41, 55, 68, 80, 90].map((x, i) => <i key={x} style={{ left: `${String(x)}%`, animationDelay: `${String(i * -0.37)}s` }} />)}</span>
    </>
  );
}

/** Look B: a hoplite shield with the device in relief. */
function Shield(props: { icon: ReactNode }) {
  return (
    <span className="lk-shieldwrap" aria-hidden="true">
      <span className="lk-spear" />
      <span className="lk-aspis">
        <svg className="lk-face" viewBox="0 0 120 120">
          <circle className="lk-studs" cx="60" cy="60" r="54" />
          <circle className="lk-dentils" cx="60" cy="60" r="49" />
          <circle className="lk-band" cx="60" cy="60" r="45.5" />
          <g className="lk-icon" transform="translate(22 21) scale(0.79)">{props.icon}</g>
        </svg>
        <span className="lk-glint"><i /></span>
      </span>
    </span>
  );
}

/** Look C: one doorway of a temple front, with its gilded relief and the torches on its columns. */
function Doorway(props: { index: number; icon: ReactNode }) {
  return (
    <>
      <span className="lk-col lk-col--l" aria-hidden="true"><i className="lk-torch" /></span>
      {props.index === 3 && <span className="lk-col lk-col--r" aria-hidden="true"><i className="lk-torch" /></span>}
      <svg className="lk-relief" viewBox="0 0 120 104" aria-hidden="true">
        <g className="lk-icon" transform="translate(12 6) scale(1)">{props.icon}</g>
        <path className="lk-ground" d="M4 100 H116" />
      </svg>
    </>
  );
}

/** What a card shows above its name, in the look picked by ?look. */
export function CardArt(props: { index: number; icon: ReactNode }) {
  if (look === "a") return <Shard index={props.index} icon={props.icon} />;
  if (look === "b") return <Shield icon={props.icon} />;
  return <Doorway index={props.index} icon={props.icon} />;
}
