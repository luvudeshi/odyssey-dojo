// Look C, the painted amphora: the screen is the frieze of a black-figure vase, black glaze above and below a terracotta
// band, a tongue row and a meander over it, rays under it, and two painted hoplites guarding the frieze while a style is picked.
const TONGUES = Array.from({ length: 37 }, (_, i) => i * 40);
const RAYS = Array.from({ length: 25 }, (_, i) => i * 60);

/** A hoplite in black glaze with incised lines in terracotta and a white shield device, facing right from `x`. */
function Hoplite(props: { x: number; flip?: boolean }) {
  const { x, flip } = props;
  return (
    <g transform={`translate(${String(x)} 104) scale(${flip ? "-0.85" : "0.85"} 0.85)`} fill="#120b07">
      <line x1="-40" y1="250" x2="120" y2="640" stroke="#120b07" strokeWidth="6" strokeLinecap="round" />
      <path d="M-48 236 L-30 262 L-40 258 Z" />
      <path d="M-8 520 L-46 676 L-30 680 L6 560 L26 676 L44 676 L30 520 Z" />
      <path d="M-30 380 L40 380 L34 530 L-26 530 Z" />
      <circle cx="0" cy="340" r="30" />
      <path d="M-34 312 Q0 230 50 300 Q20 280 -12 300 Z" />
      <path d="M-34 300 Q-8 252 40 290" fill="none" stroke="#c86a35" strokeWidth="2" />
      <circle cx="36" cy="460" r="86" />
      <circle cx="36" cy="460" r="74" fill="none" stroke="#c86a35" strokeWidth="2.5" />
      <path d="M44 410 L22 462 H38 L28 510 L58 448 H42 Z" fill="#f1e2c8" />
      <path d="M-40 676 L-24 676 M28 676 L46 676" stroke="#c86a35" strokeWidth="2" />
      <circle cx="10" cy="336" r="4" fill="#c86a35" />
    </g>
  );
}

export function SceneC() {
  return (
    <svg className="dj-scene" viewBox="0 0 1440 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="bf-glaze" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#060403" /><stop offset="0.22" stopColor="#2c1c13" /><stop offset="0.3" stopColor="#140c08" /><stop offset="0.8" stopColor="#100a06" /><stop offset="1" stopColor="#050302" />
        </linearGradient>
        <linearGradient id="bf-clay" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8a3e1c" /><stop offset="0.18" stopColor="#c0622f" /><stop offset="0.5" stopColor="#d9844a" /><stop offset="0.82" stopColor="#c0622f" /><stop offset="1" stopColor="#8a3e1c" />
        </linearGradient>
        <pattern id="bf-meander" width="48" height="28" patternUnits="userSpaceOnUse">
          <path d="M3 25 V3 H37 V19 H15 V11 H27 M37 25 H45 V3" fill="none" stroke="#120b07" strokeWidth="4" />
        </pattern>
      </defs>
      <rect width="1440" height="800" fill="url(#bf-glaze)" />
      {/* The shoulder: a row of tongues, then the meander, then the frieze. */}
      <rect x="0" y="96" width="1440" height="38" fill="url(#bf-clay)" />
      {TONGUES.map((x, i) => <path key={x} d={`M${String(x + 3)} 96 V112 Q${String(x + 20)} 136 ${String(x + 37)} 112 V96 Z`} fill={i % 2 ? "#120b07" : "#6e1c1a"} />)}
      <rect x="0" y="134" width="1440" height="4" fill="#120b07" />
      <rect x="0" y="138" width="1440" height="32" fill="url(#bf-clay)" />
      <rect x="0" y="140" width="1440" height="28" fill="url(#bf-meander)" />
      <rect x="0" y="170" width="1440" height="4" fill="#120b07" />
      <rect x="0" y="174" width="1440" height="520" fill="url(#bf-clay)" />
      <rect x="0" y="174" width="1440" height="520" fill="url(#bf-glaze)" opacity="0.08" />
      <g className="djc-warriors">
        <Hoplite x={58} />
        <Hoplite x={1382} flip />
      </g>
      {/* The foot: two lines and a ring of rays. */}
      <rect x="0" y="694" width="1440" height="5" fill="#120b07" />
      <rect x="0" y="704" width="1440" height="3" fill="#6e1c1a" />
      <rect x="0" y="712" width="1440" height="88" fill="url(#bf-clay)" />
      {RAYS.map((x) => <path key={x} d={`M${String(x)} 800 L${String(x + 30)} 716 L${String(x + 60)} 800 Z`} fill="#120b07" />)}
    </svg>
  );
}
