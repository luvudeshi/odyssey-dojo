// Look A, the palaestra at dusk: a Doric colonnade backlit by the sunset, raked sand and a pebble ring in the floor.
// Drawn once in SVG behind the dojo; the stelae, the tondo and the wax tablet are CSS in lookA.css.
const COLS = [70, 214, 358, 502, 646, 794, 938, 1082, 1226, 1370];
const RAKE = [0, 1, 2, 3, 4, 5, 6];

function Column(props: { x: number; top: number; bottom: number; w: number }) {
  const { x, top, bottom, w } = props;
  const half = w / 2;
  return (
    <g>
      <path d={`M${String(x - half)} ${String(bottom)} L${String(x - half * 0.86)} ${String(top + 18)} L${String(x + half * 0.86)} ${String(top + 18)} L${String(x + half)} ${String(bottom)} Z`} fill="url(#pa-col)" />
      {[-0.5, -0.17, 0.17, 0.5].map((k) => (
        <line key={k} x1={x + k * half * 1.6} y1={bottom} x2={x + k * half * 1.4} y2={top + 18} stroke="#2a1c1a" strokeWidth="2" opacity="0.45" />
      ))}
      <path d={`M${String(x + half)} ${String(bottom)} L${String(x + half * 0.86)} ${String(top + 18)}`} stroke="#ffcf8a" strokeWidth="3" opacity="0.8" />
      <path d={`M${String(x - half * 0.95)} ${String(top + 18)} Q${String(x)} ${String(top + 30)} ${String(x + half * 0.95)} ${String(top + 18)} L${String(x + half * 1.2)} ${String(top + 6)} L${String(x - half * 1.2)} ${String(top + 6)} Z`} fill="#5a4238" />
      <rect x={x - half * 1.3} y={top - 6} width={w * 1.3} height="12" fill="#6b5044" />
    </g>
  );
}

export function SceneA() {
  return (
    <svg className="dj-scene" viewBox="0 0 1440 800" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <linearGradient id="pa-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a1d33" /><stop offset="0.45" stopColor="#4d3050" /><stop offset="0.78" stopColor="#c86a45" /><stop offset="1" stopColor="#f3b86e" />
        </linearGradient>
        <linearGradient id="pa-col" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#3a2a2c" /><stop offset="0.55" stopColor="#6a4e46" /><stop offset="0.9" stopColor="#8f6a52" /><stop offset="1" stopColor="#b9875e" />
        </linearGradient>
        <linearGradient id="pa-sand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d9a866" /><stop offset="0.35" stopColor="#b98a52" /><stop offset="1" stopColor="#6d4a2c" />
        </linearGradient>
        <linearGradient id="pa-ent" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#efe2c6" /><stop offset="1" stopColor="#c9b08a" />
        </linearGradient>
        <radialGradient id="pa-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff1c8" stopOpacity="0.95" /><stop offset="0.35" stopColor="#ffc87a" stopOpacity="0.55" /><stop offset="1" stopColor="#ff9a50" stopOpacity="0" />
        </radialGradient>
        <pattern id="pa-meander" width="40" height="20" patternUnits="userSpaceOnUse">
          <path d="M2 18 V2 H30 V14 H12 V8 H22 M30 18 H38 V2" fill="none" stroke="#3a2418" strokeWidth="3" />
        </pattern>
      </defs>
      <rect width="1440" height="800" fill="url(#pa-sky)" />
      <circle cx="720" cy="470" r="260" fill="url(#pa-sun)" />
      <path d="M0 470 L120 440 L260 452 L420 420 L560 446 L700 430 L860 448 L1010 418 L1180 446 L1300 432 L1440 448 L1440 480 L0 480 Z" fill="#3a2436" opacity="0.85" />
      <path d="M0 470 Q360 455 720 462 T1440 466 L1440 482 L0 482 Z" fill="#e7a35e" opacity="0.6" />
      {/* The stoa: a roof beam with a meander frieze, then backlit columns on a stepped base. */}
      <rect x="0" y="0" width="1440" height="104" fill="url(#pa-ent)" />
      <rect x="0" y="80" width="1440" height="22" fill="#d6c19c" />
      <rect x="0" y="82" width="1440" height="18" fill="url(#pa-meander)" opacity="0.85" />
      <rect x="0" y="102" width="1440" height="8" fill="#4d362c" />
      {COLS.map((x) => <Column key={x} x={x} top={116} bottom={470} w={58} />)}
      <rect x="0" y="470" width="1440" height="10" fill="#7b5a44" />
      <rect x="0" y="480" width="1440" height="8" fill="#5a3f30" />
      {/* Sand, the long shadows of the columns, the rake marks and a ring of pebbles set in the floor. */}
      <rect x="0" y="488" width="1440" height="312" fill="url(#pa-sand)" />
      {COLS.map((x) => <path key={x} d={`M${String(x - 26)} 488 L${String(x + 26)} 488 L${String((x - 720) * 2.2 + 760)} 800 L${String((x - 720) * 2.2 + 640)} 800 Z`} fill="#3a2414" opacity="0.28" />)}
      {RAKE.map((i) => <ellipse key={i} cx="720" cy="760" rx={260 + i * 120} ry={60 + i * 34} fill="none" stroke="#5a3a1e" strokeWidth="2" opacity="0.22" />)}
      <ellipse cx="720" cy="690" rx="560" ry="96" fill="none" stroke="#efe2c6" strokeWidth="12" strokeDasharray="0.1 17" strokeLinecap="round" opacity="0.85" />
      <ellipse cx="720" cy="690" rx="530" ry="84" fill="none" stroke="#b8553a" strokeWidth="9" strokeDasharray="0.1 14" strokeLinecap="round" opacity="0.8" />
      <ellipse cx="720" cy="690" rx="590" ry="108" fill="none" stroke="#3a5560" strokeWidth="9" strokeDasharray="0.1 14" strokeLinecap="round" opacity="0.7" />
      {/* Two near columns frame the court. */}
      <g opacity="0.96">
        <path d="M-40 800 L-30 96 L70 96 L80 800 Z" fill="url(#pa-col)" />
        <path d="M1360 800 L1370 96 L1470 96 L1480 800 Z" fill="url(#pa-col)" />
        <path d="M70 96 L80 800" stroke="#ffcf8a" strokeWidth="4" opacity="0.7" />
        <path d="M1360 800 L1370 96" stroke="#ffcf8a" strokeWidth="3" opacity="0.4" />
      </g>
    </svg>
  );
}
