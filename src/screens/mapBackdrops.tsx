// Draft round two (?look=a|b|c): the sea and sky behind the quest map scene, one per look, on the 1600 x 900 scene.
// A: a night sea of black volcanic glass. B: a storm painted in the menu's colours. C: a floor mosaic in stones.
import type { ReactNode } from "react";
import { makeRng } from "../ui/pebble/stones";

const W = 1600, H = 900, HORIZON = 214;
const f = (n: number): string => String(Math.round(n * 10) / 10);

/** A: the glass sea as facets, rows widening toward the viewer. */
const FACETS = ((): { d: string; tone: number }[] => {
  const r = makeRng(41), ys = [HORIZON, 230, 250, 276, 308, 348, 398, 460, 534, 622, 726, 846, 960], cols = 17, out: { d: string; tone: number }[] = [];
  const pts = ys.map((y, row) => Array.from({ length: cols + 1 }, (_, c) => [
    (c * W) / cols + (c > 0 && c < cols ? (r() - 0.5) * (W / cols) * 0.7 : 0),
    y + (row > 0 && row < ys.length - 1 ? (r() - 0.5) * (y - (ys[row - 1] ?? y)) * 0.6 : 0),
  ] as const));
  for (let row = 0; row < ys.length - 1; row++) {
    for (let c = 0; c < cols; c++) {
      const a = pts[row]?.[c], b = pts[row]?.[c + 1], d = pts[row + 1]?.[c + 1], e = pts[row + 1]?.[c];
      if (!a || !b || !d || !e) continue;
      const tri = (p: readonly (readonly [number, number])[]): string => `M${p.map(([x, y]) => `${f(x)} ${f(y)}`).join(" L")} Z`;
      const [t1, t2] = (row + c) % 2 === 0 ? [[a, b, d], [a, d, e]] : [[a, b, e], [b, d, e]];
      out.push({ d: tri(t1), tone: Math.floor(r() * 5) }, { d: tri(t2), tone: Math.floor(r() * 5) });
    }
  }
  return out;
})();

/** A: hairline cracks of lava in the glass, as short random walks. */
const CRACKS = ((): string => {
  const r = makeRng(7);
  return [[300, 560], [700, 720], [1180, 520], [560, 330], [1480, 420]].map(([x0 = 0, y0 = 0]) => {
    let x = x0, y = y0, d = `M${f(x)} ${f(y)}`;
    for (let k = 0; k < 5; k++) { x += (r() - 0.3) * 46; y += (r() - 0.5) * 22; d += ` L${f(x)} ${f(y)}`; }
    return d;
  }).join(" ");
})();

function Obsidian() {
  return (
    <g className="lk-bd-a">
      <rect className="sky" width={W} height={HORIZON + 4} />
      <ellipse className="sky-fire" cx="240" cy={HORIZON} rx="420" ry="190" />
      <circle className="moon-glow" cx="1340" cy="110" r="120" />
      <circle className="moon" cx="1340" cy="110" r="30" />
      <path className="peaks" d={`M0 ${String(HORIZON)} L60 186 L110 196 L170 160 L220 190 L300 178 L360 200 L520 196 L600 176 L660 194 L900 200 L1020 182 L1080 170 L1130 190 L1300 186 L1380 158 L1440 176 L1500 168 L1600 190 V${String(HORIZON + 2)} H0 Z`} />
      <path className="peak-lava" d="M170 160 L176 184 L172 200 M1380 158 L1386 178 L1380 196" />
      {FACETS.map((t) => <path key={t.d} className={`facet t${String(t.tone)}`} d={t.d} />)}
      <ellipse className="fire-reflect" cx="250" cy="700" rx="200" ry="120" />
      <path className="crack" d={CRACKS} />
      <path className="crack-hot" d={CRACKS} />
      <path className="glints" d="M240 300 L330 286 M700 470 L790 452 M1040 300 L1100 292 M1300 560 L1400 540 M560 800 L700 770 M1500 360 L1560 352" />
      <g className="lk-compass" transform="translate(1440 780)">
        <circle r="58" className="ring" />
        <circle r="44" className="ring" />
        <path className="star" d="M0 -70 L9 -9 L70 0 L9 9 L0 70 L-9 9 L-70 0 L-9 -9 Z" />
        <path className="star2" d="M36 -36 L6 0 L36 36 L0 6 L-36 36 L-6 0 L-36 -36 L0 -6 Z" />
        <text className="north" y="-76" textAnchor="middle">N</text>
      </g>
    </g>
  );
}

/** B: one row of the painted sea: the face of the wave and the broken foam on its crest. */
const ROWS = ((): { face: string; foam: string; dash: string; o: number; w: number }[] => {
  const r = makeRng(3), out: { face: string; foam: string; dash: string; o: number; w: number }[] = [];
  for (let k = 0; k < 22; k++) {
    const t = k / 21, y = HORIZON + 6 + Math.pow(t, 1.5) * (H - HORIZON + 40), a = 2 + t * 26, len = 50 + t * 300, dx = r() * len;
    let crest = `M${f(-len - dx)} ${f(y)}`;
    for (let x = -len - dx; x < W + len; x += len) crest += ` q${f(len / 4)} ${f(-a * (0.7 + r() * 0.6))} ${f(len / 2)} 0 t${f(len / 2)} 0`;
    out.push({ face: `${crest} V${f(y + 30 + t * 120)} H${f(-len - dx)} Z`, foam: crest, dash: `${f(4 + r() * 50)} ${f(20 + r() * 70)} ${f(2 + r() * 14)} ${f(30 + r() * 90)} ${f(10 + r() * 30)} ${f(14 + r() * 40)}`, o: 0.2 + t * 0.6, w: 0.8 + t * 4 });
  }
  return out;
})();

function Storm() {
  return (
    <g className="lk-bd-b">
      <rect className="sky" width={W} height={HORIZON + 4} />
      <circle className="moon-glow" cx="1010" cy="96" r="190" />
      {[[120, 40, 300, 90], [430, 70, 260, 70], [760, 20, 340, 80], [1240, 60, 330, 100], [1500, 130, 220, 70], [260, 170, 380, 50], [900, 160, 420, 46]].map(([x, y, rx, ry]) => (
        <ellipse key={`${String(x)}|${String(y)}`} className="cloud" cx={x} cy={y} rx={rx} ry={ry} />
      ))}
      <ellipse className="cloud-lit" cx="1010" cy="128" rx="230" ry="34" />
      <path className="bolt-glow" d="M1360 0 L1344 70 L1366 82 L1330 150 L1346 158 L1318 214" />
      <path className="bolt" d="M1360 0 L1344 70 L1366 82 L1330 150 L1346 158 L1318 214" />
      <rect className="sea" y={HORIZON} width={W} height={H - HORIZON} />
      <rect className="horizon-haze" y={HORIZON - 10} width={W} height="60" />
      {ROWS.map((row) => (
        <g key={row.face}>
          <path className="wave-face" d={row.face} />
          <path className="wave-sheen" d={row.foam} style={{ strokeWidth: row.w * 3 }} />
          <path className="wave-foam" d={row.foam} style={{ strokeDasharray: row.dash, opacity: row.o, strokeWidth: row.w }} />
        </g>
      ))}
      <ellipse className="moon-path" cx="1010" cy="420" rx="120" ry="230" />
      <ellipse className="fire-reflect" cx="250" cy="690" rx="190" ry="90" />
      <g className="lk-wind" transform="translate(270 112) scale(1.35)">
        <path className="puff" d="M-120 30 C-150 0 -110 -40 -76 -26 C-66 -64 -6 -66 10 -34 C40 -48 74 -24 62 6 C86 18 78 52 48 54 C30 76 -20 74 -34 54 C-70 72 -122 62 -120 30 Z" />
        <path className="cheek" d="M8 -20 C34 -30 60 -12 64 8 C70 10 74 14 72 18 C66 20 62 18 60 22 C54 36 26 40 10 26 Z" />
        <path className="face" d="M40 -14 C54 -10 62 0 64 8 C70 10 74 14 72 18 C66 20 62 18 60 22 C56 30 46 32 40 28 M30 -18 C40 -24 50 -22 56 -16" />
        <circle className="eye" cx="48" cy="2" r="3" />
        <path className="blow" d="M76 16 C140 6 200 24 260 12 M74 24 C150 30 210 54 300 40 M72 30 C130 50 170 70 240 72" />
      </g>
      <rect className="rain" width={W} height={H} />
    </g>
  );
}

const DOLPHIN = "M2 34 C18 16 48 8 74 10 L84 -8 L92 12 C102 14 110 17 114 21 L128 24 L114 28 C104 34 86 40 60 42 C46 43 34 42 26 40 L10 52 L14 38 L-2 22 Z";

function Mosaic() {
  return (
    <g className="lk-bd-c">
      <rect className="sea" width={W} height={H} />
      {[120, 250, 360, 480, 560, 700, 790].map((y, i) => (
        <path key={y} className="wavelet" d={`M${String(-40 + (i % 2) * 30)} ${String(y)}${" q18 -12 36 0 t36 0".repeat(1)}${" t36 0".repeat(46)}`} />
      ))}
      <g className="dolphin" transform="translate(500 270) rotate(-8)"><path d={DOLPHIN} /><circle className="eye" cx="98" cy="20" r="2.4" /><path className="belly" d="M30 37 C50 40 76 36 92 28" /></g>
      <g className="dolphin" transform="translate(1180 250) scale(-1 1) rotate(-6)"><path d={DOLPHIN} /><circle className="eye" cx="98" cy="20" r="2.4" /><path className="belly" d="M30 37 C50 40 76 36 92 28" /></g>
      <g className="dolphin" transform="translate(820 560) rotate(10) scale(0.8)"><path d={DOLPHIN} /><circle className="eye" cx="98" cy="20" r="2.4" /><path className="belly" d="M30 37 C50 40 76 36 92 28" /></g>
      <g className="ketos" transform="translate(250 790)">
        <path className="body" d="M0 0 C30 -40 70 -40 90 -10 C110 20 150 20 170 -6 C182 -22 196 -24 206 -14 C196 -8 190 4 196 14 C170 40 120 42 96 16 C80 -2 50 -6 30 16 C20 26 6 22 0 0 Z" />
        <path className="fin" d="M70 -34 L84 -58 L96 -24 Z M120 26 L118 50 L140 30 Z" />
        <circle className="eye" cx="190" cy="-10" r="2.6" />
      </g>
      <g className="lk-rosette" transform="translate(1440 780)">
        <circle r="64" className="ring-a" />
        <circle r="50" className="ring-b" />
        <path className="star" d="M0 -62 L12 -12 L62 0 L12 12 L0 62 L-12 12 L-62 0 L-12 -12 Z" />
        <circle r="10" className="hub" />
      </g>
    </g>
  );
}

/** Seamless stone patterns for the mosaic: a staggered grid of jittered pebbles on grout. */
function stones(id: string, cols: readonly string[], grout: string, cell: number, seed: number): ReactNode {
  const r = makeRng(seed), n = 3, step = cell / n, out: ReactNode[] = [<rect key="g" width={cell} height={cell} fill={grout} />];
  for (let row = 0; row < n; row++) {
    for (let c = 0; c < n; c++) {
      const x = (c + (row % 2) * 0.5 + 0.5) * step + (r() - 0.5) * step * 0.18, y = (row + 0.5) * step + (r() - 0.5) * step * 0.18;
      const col = cols[Math.floor(r() * cols.length)] ?? "#888";
      out.push(<ellipse key={`${String(row)}|${String(c)}`} cx={f(x % cell)} cy={f(y)} rx={f(step * (0.4 + r() * 0.06))} ry={f(step * (0.34 + r() * 0.06))} fill={col} />);
    }
  }
  return <pattern key={id} id={id} width={cell} height={cell} patternUnits="userSpaceOnUse">{out}</pattern>;
}

/** Paint the scene's marks use, for every look. */
export function SceneDefs() {
  return (
    <defs>
      <linearGradient id="lk-a-glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2a3142" /><stop offset="0.35" stopColor="#10131c" /><stop offset="1" stopColor="#05060a" /></linearGradient>
      <linearGradient id="lk-b-rock" x1="0" y1="0" x2="0.2" y2="1"><stop offset="0" stopColor="#56676a" /><stop offset="0.4" stopColor="#24302f" /><stop offset="1" stopColor="#0c1414" /></linearGradient>
      <linearGradient id="lk-b-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#081013" /><stop offset="0.7" stopColor="#1d2c30" /><stop offset="1" stopColor="#4a5a55" /></linearGradient>
      <linearGradient id="lk-b-wave" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3f7a78" stopOpacity="0.9" /><stop offset="0.25" stopColor="#14474a" stopOpacity="0.85" /><stop offset="1" stopColor="#031416" stopOpacity="0.95" /></linearGradient>
      <linearGradient id="lk-b-sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3f6463" /><stop offset="0.25" stopColor="#1b4a4b" /><stop offset="1" stopColor="#031416" /></linearGradient>
      <linearGradient id="lk-a-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#030408" /><stop offset="0.7" stopColor="#0e0a10" /><stop offset="1" stopColor="#2c0f07" /></linearGradient>
      <radialGradient id="lk-glow"><stop offset="0" stopColor="#ffb347" stopOpacity="0.85" /><stop offset="0.4" stopColor="#ff6a1a" stopOpacity="0.35" /><stop offset="1" stopColor="#ff6a1a" stopOpacity="0" /></radialGradient>
      <radialGradient id="lk-pale"><stop offset="0" stopColor="#f6efd8" stopOpacity="0.55" /><stop offset="0.5" stopColor="#c9dcd8" stopOpacity="0.16" /><stop offset="1" stopColor="#c9dcd8" stopOpacity="0" /></radialGradient>
      <radialGradient id="lk-cloud"><stop offset="0" stopColor="#0d1719" stopOpacity="0.95" /><stop offset="0.6" stopColor="#1a272a" stopOpacity="0.6" /><stop offset="1" stopColor="#1a272a" stopOpacity="0" /></radialGradient>
      <pattern id="lk-rain" width="60" height="90" patternUnits="userSpaceOnUse" patternTransform="rotate(12)"><path d="M10 4 V34 M40 50 V84 M28 20 V40" stroke="#d7e9f2" strokeWidth="1" opacity="0.5" /></pattern>
      {stones("lk-c-sea", ["#5f97a6", "#4f8899", "#76abb7", "#6aa0ad", "#3f7686", "#5890a0"], "#1d2e33", 24, 11)}
      {stones("lk-c-cream", ["#efe4cc", "#e2d4b6", "#f6eedd", "#d9c9a8"], "#5a4a3a", 16, 12)}
      {stones("lk-c-ochre", ["#d9a34a", "#c98f37", "#e2b25d", "#b97f2f"], "#2a1d12", 16, 13)}
      {stones("lk-c-terra", ["#b8553a", "#a64630", "#c9684a", "#93402c"], "#2a1410", 16, 14)}
      {stones("lk-c-olive", ["#8d9a5b", "#79864b", "#a0ab6c"], "#1e2312", 16, 15)}
      {stones("lk-c-black", ["#1b1714", "#24201c", "#121010", "#2c2622"], "#0a0807", 14, 16)}
      {stones("lk-c-slate", ["#6f7d80", "#5d6a6d", "#86959a"], "#1e2426", 16, 17)}
    </defs>
  );
}

export function Backdrop(props: { look: "a" | "b" | "c" }) {
  return props.look === "a" ? <Obsidian /> : props.look === "b" ? <Storm /> : <Mosaic />;
}
