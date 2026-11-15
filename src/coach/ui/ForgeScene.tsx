// The forge hall behind the training dojo: black volcanic glass on every side, ice cracks on the defending (left) wall,
// lava cracks on the striking (right) wall and a lava channel across the floor. The glass, ice and lava are the fight
// HUD's own colours (src/hud/sky/rift.css, card.css), copied so the dojo and the fight read as one game.
// Static SVG drawn once, with no filters: a glow is a wide, faint stroke under the bright one.
let seed = 7;
const rand = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const EMBERS = Array.from({ length: 46 }, () => ({ x: 760 + rand() * 680, y: 120 + rand() * 640, r: 0.8 + rand() * 2.4, o: 0.3 + rand() * 0.7 }));
const FROST = Array.from({ length: 30 }, () => ({ x: rand() * 560, y: 100 + rand() * 600, r: 0.8 + rand() * 1.8, o: 0.25 + rand() * 0.6 }));

const SHARDS: readonly (readonly [string, string])[] = [
  ["0,0 300,0 180,210 0,320", "#0d0b12"], ["300,0 620,0 470,140 180,210", "#14111a"], ["620,0 860,0 760,120 470,140", "#0b0910"],
  ["860,0 1160,0 1020,190 760,120", "#1a1622"], ["1160,0 1440,0 1440,300 1020,190", "#0d0b12"],
  ["0,320 180,210 260,520 0,640", "#1a1622"], ["180,210 470,140 520,430 260,520", "#09080c"], ["470,140 760,120 900,400 520,430", "#14111a"],
  ["760,120 1020,190 1180,470 900,400", "#09080c"], ["1020,190 1440,300 1440,600 1180,470", "#1a1622"],
  ["0,640 260,520 520,430 900,400 1180,470 1440,600 1440,800 0,800", "#06050a"],
];
const ICE = ["M0 360 L90 400 L150 380 L230 450 L260 520", "M90 400 L70 470 L110 560", "M150 380 L190 300 L180 210", "M230 450 L330 470 L420 455", "M0 520 L60 560 L40 640"];
const LAVA = [
  "M1440 330 L1350 380 L1290 360 L1210 430 L1180 470", "M1350 380 L1370 470 L1330 560", "M1290 360 L1250 280 L1260 190",
  "M1210 430 L1100 450 L1010 440", "M1440 520 L1380 560 L1400 640", "M1020 190 L960 250 L900 400",
];
const ROOF = [60, 220, 400, 610, 830, 1010, 1200, 1380];

export function ForgeScene() {
  return (
    <svg className="dojo-scene" viewBox="0 0 1440 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="dj-lava" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff4c0" /><stop offset="0.3" stopColor="#ffd040" /><stop offset="0.62" stopColor="#ff8410" /><stop offset="1" stopColor="#c8300a" />
        </linearGradient>
        <linearGradient id="dj-lava-glow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff6a10" stopOpacity="0" /><stop offset="1" stopColor="#ff6a10" stopOpacity="0.55" />
        </linearGradient>
        <radialGradient id="dj-heat" cx="0.5" cy="1" r="0.75">
          <stop offset="0" stopColor="#ff6a14" stopOpacity="0.5" /><stop offset="0.5" stopColor="#a8300c" stopOpacity="0.16" /><stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="dj-cold" cx="0" cy="0.5" r="0.6">
          <stop offset="0" stopColor="#4aa0ff" stopOpacity="0.2" /><stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="dj-hot" cx="1" cy="0.5" r="0.6">
          <stop offset="0" stopColor="#ff6a14" stopOpacity="0.22" /><stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1440" height="800" fill="#050407" />
      {SHARDS.map(([points, fill]) => <polygon key={points} points={points} fill={fill} stroke="#d6c8ff" strokeWidth="1.3" strokeOpacity="0.22" />)}
      <rect width="1440" height="800" fill="url(#dj-cold)" />
      <rect width="1440" height="800" fill="url(#dj-hot)" />
      <rect width="1440" height="800" fill="url(#dj-heat)" />
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {ICE.map((d) => <path key={`g${d}`} d={d} stroke="#4aa0ff" strokeWidth="12" strokeOpacity="0.18" />)}
        {ICE.map((d) => <path key={`m${d}`} d={d} stroke="#9fd8ff" strokeWidth="3.6" strokeOpacity="0.7" />)}
        {ICE.map((d) => <path key={d} d={d} stroke="#e6f6ff" strokeWidth="1.2" />)}
        {LAVA.map((d) => <path key={`g${d}`} d={d} stroke="#ff6a10" strokeWidth="12" strokeOpacity="0.2" />)}
        {LAVA.map((d) => <path key={`m${d}`} d={d} stroke="#ff6a10" strokeWidth="3.6" strokeOpacity="0.6" />)}
        {LAVA.map((d) => <path key={d} d={d} stroke="#ffd890" strokeWidth="1.2" />)}
      </g>
      {/* Hanging shards along the roof. */}
      {ROOF.map((x, i) => (
        <polygon key={x} points={`${String(x - 30)},0 ${String(x + 34)},0 ${String(x + 4)},${String(70 + (i % 3) * 38)}`} fill="#06050a" stroke="#d6c8ff" strokeOpacity="0.3" strokeWidth="1.2" />
      ))}
      {/* The lava channel across the floor, its heat on the glass above it, and a crust floating on it. */}
      <rect x="0" y="680" width="1440" height="70" fill="url(#dj-lava-glow)" />
      <path d="M0 742 C240 724 420 760 720 744 S1200 728 1440 746 L1440 800 L0 800 Z" fill="url(#dj-lava)" />
      <path d="M0 760 C300 748 520 772 760 758 S1200 750 1440 764" fill="none" stroke="#4a1608" strokeWidth="5" strokeDasharray="40 26 12 30" opacity="0.8" />
      {EMBERS.map((e) => <circle key={`${String(e.x)}-${String(e.y)}`} cx={e.x} cy={e.y} r={e.r} fill="#ffd06a" opacity={e.o} />)}
      {FROST.map((e) => <circle key={`${String(e.x)}-${String(e.y)}`} cx={e.x} cy={e.y} r={e.r} fill="#e6f6ff" opacity={e.o} />)}
    </svg>
  );
}
