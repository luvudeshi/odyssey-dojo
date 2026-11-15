// The painted storm behind the quest map: sky, clouds, the wind god, lightning and rows of breaking waves. It is drawn on
// the map's 1600 x 900 scene but reaches far past every edge, so a wide or tall window shows more sea and sky instead of
// cutting off a stop. Only transform and opacity move (questMap.css), and nothing that moves carries a filter.
import { makeRng } from "../ui/pebble/stones";

const HORIZON = 214, X0 = -1500, X1 = 3100;
const f = (n: number): string => String(Math.round(n * 10) / 10);

interface Row { face: string; foam: string; dash: string; o: number; w: number }

/** One row per swell: the face of the wave and the broken foam on its crest, wider and taller toward the viewer. */
const ROWS = ((): Row[] => {
  const r = makeRng(3), out: Row[] = [];
  for (let k = 0; k < 30; k++) {
    const t = k / 21, near = Math.min(t, 1.3), y = HORIZON + 6 + Math.pow(t, 1.5) * 726, a = 2 + near * 26, len = 50 + near * 300, dx = r() * len;
    let crest = `M${f(X0 - dx)} ${f(y)}`;
    for (let x = X0 - dx; x < X1 + len; x += len) crest += ` q${f(len / 4)} ${f(-a * (0.7 + r() * 0.6))} ${f(len / 2)} 0 t${f(len / 2)} 0`;
    out.push({
      face: `${crest} V${f(y + 30 + near * 120)} H${f(X0 - dx)} Z`, foam: crest, o: 0.2 + Math.min(t, 1) * 0.6, w: 0.8 + near * 4,
      dash: `${f(4 + r() * 50)} ${f(20 + r() * 70)} ${f(2 + r() * 14)} ${f(30 + r() * 90)} ${f(10 + r() * 30)} ${f(14 + r() * 40)}`,
    });
  }
  return out;
})();

const PUFFS: readonly (readonly [number, number, number])[] = [[-170, 20, 50], [-140, -20, 56], [-120, 34, 54], [-92, -44, 58], [-70, 10, 64], [-60, 52, 46], [-34, -50, 44], [-24, -8, 50], [-20, 38, 40], [4, 52, 26], [-200, 50, 36]];
const CLOUDS: readonly (readonly [number, number, number, number])[] = [[-500, 60, 420, 110], [120, 40, 300, 90], [430, 70, 260, 70], [760, 20, 340, 80], [1240, 60, 330, 100], [1500, 130, 220, 70], [2050, 50, 420, 110], [260, 170, 380, 50], [900, 160, 420, 46], [-200, -260, 700, 200], [1700, -240, 700, 200]];
const BOLT = "M1360 -60 L1344 70 L1366 82 L1330 150 L1346 158 L1318 214";

/** The wind god, blowing the storm across the sea from the clouds. */
function WindGod() {
  return (
    <g className="qm-wind" transform="translate(250 112) scale(1.3)">
      {PUFFS.map(([x, y, rad]) => <circle key={`${String(x)}|${String(y)}`} className="qm-wind__puff" cx={x} cy={y} r={rad} />)}
      <path className="qm-wind__breath" d="M74 13 C130 4 200 2 290 -8 C210 8 140 14 74 19 Z M74 17 C140 22 210 34 300 30 C220 40 140 32 74 21 Z M73 21 C120 40 170 58 240 66 C170 66 116 50 72 24 Z" />
      <path className="qm-wind__head" d="M-6 -34 C14 -46 40 -40 50 -22 C54 -14 56 -10 62 -4 C58 -1 56 2 57 5 C64 6 72 9 72 15 C72 21 64 24 57 22 C56 30 48 38 34 40 C16 44 -2 36 -10 22 C-16 8 -16 -22 -6 -34 Z" />
      <ellipse className="qm-wind__cheek" cx="50" cy="12" rx="15" ry="13" />
      <path className="qm-wind__line" d="M28 -20 C36 -27 46 -25 51 -18 M34 -9 C38 -5 44 -5 48 -9 M57 5 C60 9 60 17 57 22" />
      <ellipse className="qm-wind__lips" cx="72" cy="15" rx="3" ry="4.2" />
    </g>
  );
}

export function SeaDefs() {
  return (
    <defs>
      <linearGradient id="qm-sky" x1="0" y1="-400" x2="0" y2={HORIZON} gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#050b0d" /><stop offset="0.7" stopColor="#1d2c30" /><stop offset="1" stopColor="#4a5a55" /></linearGradient>
      <linearGradient id="qm-sea" x1="0" y1={HORIZON} x2="0" y2="1200" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#3f6463" /><stop offset="0.2" stopColor="#1b4a4b" /><stop offset="1" stopColor="#021012" /></linearGradient>
      <linearGradient id="qm-wave" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3f7a78" stopOpacity="0.9" /><stop offset="0.25" stopColor="#14474a" stopOpacity="0.85" /><stop offset="1" stopColor="#031416" stopOpacity="0.95" /></linearGradient>
      <radialGradient id="qm-cloud"><stop offset="0" stopColor="#0d1719" stopOpacity="0.95" /><stop offset="0.6" stopColor="#1a272a" stopOpacity="0.6" /><stop offset="1" stopColor="#1a272a" stopOpacity="0" /></radialGradient>
      <radialGradient id="qm-puff" cx="0.62" cy="0.34" r="0.66"><stop offset="0" stopColor="#8fa4a0" stopOpacity="0.95" /><stop offset="0.55" stopColor="#3f5355" stopOpacity="0.9" /><stop offset="1" stopColor="#1a2729" stopOpacity="0" /></radialGradient>
      <radialGradient id="qm-face" cx="0.72" cy="0.32" r="0.8"><stop offset="0" stopColor="#c7d4cf" /><stop offset="0.5" stopColor="#7d918e" /><stop offset="1" stopColor="#334546" /></radialGradient>
      <linearGradient id="qm-breath" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#e3efeb" stopOpacity="0.7" /><stop offset="1" stopColor="#e3efeb" stopOpacity="0" /></linearGradient>
      <radialGradient id="qm-pale"><stop offset="0" stopColor="#f6efd8" stopOpacity="0.55" /><stop offset="0.5" stopColor="#c9dcd8" stopOpacity="0.16" /><stop offset="1" stopColor="#c9dcd8" stopOpacity="0" /></radialGradient>
      <radialGradient id="qm-glow"><stop offset="0" stopColor="#ffb347" stopOpacity="0.85" /><stop offset="0.4" stopColor="#ff6a1a" stopOpacity="0.35" /><stop offset="1" stopColor="#ff6a1a" stopOpacity="0" /></radialGradient>
      <linearGradient id="qm-rock" x1="0" y1="0" x2="0.2" y2="1"><stop offset="0" stopColor="#56676a" /><stop offset="0.4" stopColor="#24302f" /><stop offset="1" stopColor="#0c1414" /></linearGradient>
    </defs>
  );
}

/** Everything behind the course and the stops. */
export function Sea() {
  return (
    <g className="qm-backdrop">
      <rect className="qm-sky" x={X0} y="-1200" width={X1 - X0} height={HORIZON + 1204} />
      <circle className="qm-moon" cx="1010" cy="96" r="190" />
      {CLOUDS.map(([x, y, rx, ry]) => <ellipse key={`${String(x)}|${String(y)}`} className="qm-cloud" cx={x} cy={y} rx={rx} ry={ry} />)}
      <ellipse className="qm-cloud-lit" cx="1010" cy="128" rx="230" ry="34" />
      <g className="qm-bolt"><path className="qm-bolt__glow" d={BOLT} /><path className="qm-bolt__core" d={BOLT} /></g>
      <rect className="qm-sea" x={X0} y={HORIZON} width={X1 - X0} height="2000" />
      <rect className="qm-haze" x={X0} y={HORIZON - 10} width={X1 - X0} height="60" />
      {ROWS.map((row, k) => (
        <g key={row.face} className={`qm-swell qm-swell--${String(k % 3)}`}>
          <path className="qm-wave" d={row.face} />
          <path className="qm-sheen" d={row.foam} style={{ strokeWidth: row.w * 3 }} />
          <path className="qm-foam" d={row.foam} style={{ strokeDasharray: row.dash, opacity: row.o, strokeWidth: row.w }} />
        </g>
      ))}
      <ellipse className="qm-moonpath" cx="1010" cy="420" rx="120" ry="230" />
      <ellipse className="qm-fire-reflect" cx="300" cy="690" rx="190" ry="90" />
      <WindGod />
    </g>
  );
}
