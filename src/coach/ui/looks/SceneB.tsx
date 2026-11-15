// Look B, the obsidian forge hall: black volcanic glass on every side, ice cracks on the defending (left) wall, lava
// cracks on the striking (right) wall and a lava channel across the floor, as in the Obsidian Rift fight HUD.
let seed = 7;
const rand = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const EMBERS = Array.from({ length: 46 }, () => ({ x: 760 + rand() * 680, y: 120 + rand() * 640, r: 0.8 + rand() * 2.4, o: 0.3 + rand() * 0.7 }));
const FROST = Array.from({ length: 30 }, () => ({ x: rand() * 560, y: 100 + rand() * 600, r: 0.8 + rand() * 1.8, o: 0.25 + rand() * 0.6 }));

const SHARDS: readonly (readonly [string, string])[] = [
  ["0,0 300,0 180,210 0,320", "#0c0f16"], ["300,0 620,0 470,140 180,210", "#10131c"], ["620,0 860,0 760,120 470,140", "#0b0d14"],
  ["860,0 1160,0 1020,190 760,120", "#11141d"], ["1160,0 1440,0 1440,300 1020,190", "#0d0f17"],
  ["0,320 180,210 260,520 0,640", "#121620"], ["180,210 470,140 520,430 260,520", "#0a0c12"], ["470,140 760,120 900,400 520,430", "#0e1119"],
  ["760,120 1020,190 1180,470 900,400", "#0a0c12"], ["1020,190 1440,300 1440,600 1180,470", "#131722"],
  ["0,640 260,520 520,430 900,400 1180,470 1440,600 1440,800 0,800", "#07080c"],
];
const ICE = ["M0 360 L90 400 L150 380 L230 450 L260 520", "M90 400 L70 470 L110 560", "M150 380 L190 300 L180 210", "M230 450 L330 470 L420 455", "M0 520 L60 560 L40 640"];
const LAVA = [
  "M1440 330 L1350 380 L1290 360 L1210 430 L1180 470", "M1350 380 L1370 470 L1330 560", "M1290 360 L1250 280 L1260 190",
  "M1210 430 L1100 450 L1010 440", "M1440 520 L1380 560 L1400 640", "M1020 190 L960 250 L900 400",
];

export function SceneB() {
  return (
    <svg className="dj-scene" viewBox="0 0 1440 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <filter id="ob-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <linearGradient id="ob-lava" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ff5a14" /><stop offset="0.5" stopColor="#ffb347" /><stop offset="1" stopColor="#ff6a1a" />
        </linearGradient>
        <radialGradient id="ob-heat" cx="0.5" cy="1" r="0.75">
          <stop offset="0" stopColor="#ff6a1a" stopOpacity="0.55" /><stop offset="0.5" stopColor="#a8300c" stopOpacity="0.18" /><stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="ob-cold" cx="0" cy="0.5" r="0.6">
          <stop offset="0" stopColor="#5fc8ff" stopOpacity="0.22" /><stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="ob-hot" cx="1" cy="0.5" r="0.6">
          <stop offset="0" stopColor="#ff6a1a" stopOpacity="0.25" /><stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1440" height="800" fill="#06070b" />
      {SHARDS.map(([points, fill]) => <polygon key={points} points={points} fill={fill} stroke="#2b3550" strokeWidth="1.5" strokeOpacity="0.7" />)}
      <rect width="1440" height="800" fill="url(#ob-cold)" />
      <rect width="1440" height="800" fill="url(#ob-hot)" />
      <rect width="1440" height="800" fill="url(#ob-heat)" />
      <g filter="url(#ob-glow)" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {ICE.map((d) => <path key={d} d={d} stroke="#7fd8ff" strokeWidth="3" />)}
        {LAVA.map((d) => <path key={d} d={d} stroke="#ff7a22" strokeWidth="3.5" />)}
      </g>
      <g fill="none" strokeLinecap="round">
        {ICE.map((d) => <path key={d} d={d} stroke="#e8f8ff" strokeWidth="1" />)}
        {LAVA.map((d) => <path key={d} d={d} stroke="#ffe0a0" strokeWidth="1.2" />)}
      </g>
      {/* Hanging shards along the roof. */}
      {[60, 220, 400, 610, 830, 1010, 1200, 1380].map((x, i) => (
        <polygon key={x} points={`${String(x - 30)},0 ${String(x + 34)},0 ${String(x + 4)},${String(70 + (i % 3) * 38)}`} fill="#0a0c12" stroke="#2b3550" strokeWidth="1.5" />
      ))}
      {/* The lava channel across the floor, with its reflection on the glass. */}
      <path d="M0 742 C240 724 420 760 720 744 S1200 728 1440 746 L1440 800 L0 800 Z" fill="url(#ob-lava)" filter="url(#ob-glow)" opacity="0.9" />
      <path d="M0 760 C300 748 520 772 760 758 S1200 750 1440 764" fill="none" stroke="#3a0e04" strokeWidth="5" strokeDasharray="40 26 12 30" opacity="0.7" />
      {EMBERS.map((e) => <circle key={`${String(e.x)}-${String(e.y)}`} cx={e.x} cy={e.y} r={e.r} fill="#ffb347" opacity={e.o} />)}
      {FROST.map((e) => <circle key={`${String(e.x)}-${String(e.y)}`} cx={e.x} cy={e.y} r={e.r} fill="#c8f0ff" opacity={e.o} />)}
    </svg>
  );
}
