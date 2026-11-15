// Draft backgrounds for the training dojo, one per ?look. Static SVG, no filters, drawn once.
// A: a training scroll unrolled on a walnut table. B: Athena's armoury by moonlight. C: a drowned hall under Poseidon's sea.
import type { LookId } from "../../../ui/lookSwitch";

let seed = 11;
const rand = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const f = (value: number): string => value.toFixed(1);

const TICKS = Array.from({ length: 30 }, (_, i) => 90 + i * 20);
const STAINS = Array.from({ length: 9 }, () => ({ x: rand() * 1440, y: 60 + rand() * 680, r: 60 + rand() * 150, o: 0.06 + rand() * 0.1 }));

function ScrollScene() {
  return (
    <svg className="dojo-scene" viewBox="0 0 1440 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="la-sheet" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d8bf86" /><stop offset="0.07" stopColor="#f0e0b6" /><stop offset="0.5" stopColor="#f4e7c2" /><stop offset="0.93" stopColor="#ecd9a8" /><stop offset="1" stopColor="#cfb277" />
        </linearGradient>
        <linearGradient id="la-roll" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8a6a38" /><stop offset="0.35" stopColor="#e9d49c" /><stop offset="0.7" stopColor="#c8a864" /><stop offset="1" stopColor="#6a4c22" />
        </linearGradient>
        <radialGradient id="la-stain"><stop offset="0" stopColor="#a8782a" stopOpacity="0.5" /><stop offset="1" stopColor="#a8782a" stopOpacity="0" /></radialGradient>
        <radialGradient id="la-vig" cx="0.5" cy="0.5" r="0.75">
          <stop offset="0.6" stopColor="#7a4a1a" stopOpacity="0" /><stop offset="1" stopColor="#7a4a1a" stopOpacity="0.38" />
        </radialGradient>
      </defs>
      <rect width="1440" height="800" fill="#3a2515" />
      <rect y="30" width="1440" height="740" fill="url(#la-sheet)" />
      {STAINS.map((s) => <circle key={`${f(s.x)}${f(s.y)}`} cx={s.x} cy={s.y} r={s.r} fill="url(#la-stain)" opacity={s.o * 3} />)}
      <rect y="30" width="1440" height="740" fill="url(#la-vig)" />
      {/* Ink rules round the sheet and a ruler along each side, as on a drill manual. */}
      <rect x="40" y="74" width="1360" height="652" fill="none" stroke="#4a2e14" strokeWidth="3" opacity="0.7" />
      <rect x="49" y="83" width="1342" height="634" fill="none" stroke="#4a2e14" strokeWidth="1.2" opacity="0.6" />
      {TICKS.map((y, i) => (
        <g key={y} stroke="#4a2e14" strokeWidth="1.4" opacity="0.5">
          <path d={`M40 ${String(y)} h${i % 5 === 0 ? "14" : "8"}`} /><path d={`M1400 ${String(y)} h-${i % 5 === 0 ? "14" : "8"}`} />
        </g>
      ))}
      {[[40, 74], [1400, 74], [40, 726], [1400, 726]].map(([x, y]) => <rect key={`${String(x)}${String(y)}`} x={(x ?? 0) - 9} y={(y ?? 0) - 9} width="18" height="18" fill="#a8231a" transform={`rotate(45 ${String(x)} ${String(y)})`} />)}
      {/* The two rolls the sheet is wound on, with their wooden knobs. */}
      <rect y="0" width="1440" height="44" fill="url(#la-roll)" />
      <rect y="756" width="1440" height="44" fill="url(#la-roll)" />
      <path d="M0 44 H1440" stroke="#4a2e14" strokeOpacity="0.5" strokeWidth="2" />
      <path d="M0 756 H1440" stroke="#4a2e14" strokeOpacity="0.5" strokeWidth="2" />
      {[14, 1426].flatMap((x) => [22, 778].map((y) => <circle key={`${String(x)}${String(y)}`} cx={x} cy={y} r="22" fill="#5a3a1a" stroke="#2a1608" strokeWidth="3" />))}
    </svg>
  );
}

const BLOCKS = Array.from({ length: 9 }, (_, row) => {
  const out: { x: number; y: number; w: number; l: number }[] = [];
  let x = row % 2 === 0 ? -60 : -140;
  while (x < 1440) { const w = 150 + rand() * 90; out.push({ x, y: row * 92 - 6, w, l: rand() }); x += w; }
  return out;
});
const FLUTES = [0, 1, 2, 3, 4, 5].map((i) => 10 + i * 10);

function ArmouryScene() {
  return (
    <svg className="dojo-scene" viewBox="0 0 1440 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="lb-moon" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#cfe3ff" stopOpacity="0.5" /><stop offset="1" stopColor="#cfe3ff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="lb-col" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#6c7a99" /><stop offset="0.4" stopColor="#dfe8f7" /><stop offset="1" stopColor="#4a5675" />
        </linearGradient>
        <linearGradient id="lb-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a4868" /><stop offset="1" stopColor="#0c1220" />
        </linearGradient>
        <radialGradient id="lb-glow" cx="0.5" cy="0" r="0.8">
          <stop offset="0" stopColor="#8fb4ff" stopOpacity="0.28" /><stop offset="1" stopColor="#8fb4ff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1440" height="800" fill="#141b2b" />
      {BLOCKS.flatMap((row, r) => row.map((b) => (
        <rect key={`${String(r)}${f(b.x)}`} x={b.x} y={r * 92 - 6} width={b.w - 4} height="88" rx="3" fill={`hsl(222 ${f(24 + b.l * 8)}% ${f(15 + b.l * 8)}%)`} stroke="#0a0f1a" strokeWidth="3" />
      )))}
      <rect width="1440" height="800" fill="url(#lb-glow)" />
      {/* Moonlight from a high window falls across the wall to the floor. */}
      <polygon points="610,0 830,0 1130,720 330,720" fill="url(#lb-moon)" />
      <rect y="690" width="1440" height="110" fill="url(#lb-floor)" />
      {[0, 160, 340, 540, 720, 900, 1100, 1280].map((x) => <path key={x} d={`M${String(x)} 690 L${String(x - 60 + (x % 200))} 800`} stroke="#0c1220" strokeWidth="3" opacity="0.7" />)}
      <path d="M0 690 H1440" stroke="#9fb6e8" strokeWidth="2" opacity="0.5" />
      {/* The frieze: a bronze meander along the lintel. */}
      <rect width="1440" height="56" fill="#0e1424" />
      <path d={Array.from({ length: 48 }, (_, i) => `M${String(i * 30)} 44 v-28 h20 v18 h-10 v-8`).join(" ")} fill="none" stroke="#c98a3a" strokeWidth="3" opacity="0.85" />
      <path d="M0 56 H1440" stroke="#c98a3a" strokeWidth="4" />
      {/* Fluted columns at both edges. */}
      {[0, 1370].map((x) => (
        <g key={x}>
          <rect x={x} y="56" width="70" height="634" fill="url(#lb-col)" />
          {FLUTES.map((dx) => <path key={dx} d={`M${String(x + dx)} 56 V690`} stroke="#27324c" strokeWidth="2" opacity="0.7" />)}
          <rect x={x - 6} y="56" width="82" height="22" fill="#c9d4ea" /><rect x={x - 6} y="668" width="82" height="22" fill="#c9d4ea" />
        </g>
      ))}
    </svg>
  );
}

const RAYS = [120, 330, 560, 790, 1010, 1230, 1400];
const BUBBLES = Array.from({ length: 44 }, () => ({ x: rand() * 1440, y: rand() * 760, r: 2 + rand() * 9, o: 0.2 + rand() * 0.45 }));
const KELP = [90, 190, 1210, 1330, 1400].map((x) => ({ x, h: 160 + rand() * 120 }));

function SeaScene() {
  return (
    <svg className="dojo-scene" viewBox="0 0 1440 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="lc-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1fb8c6" /><stop offset="0.3" stopColor="#0b7c98" /><stop offset="0.7" stopColor="#06405c" /><stop offset="1" stopColor="#031a2c" />
        </linearGradient>
        <linearGradient id="lc-ray" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d8fbff" stopOpacity="0.45" /><stop offset="1" stopColor="#d8fbff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="lc-col" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#0a3a4c" /><stop offset="0.5" stopColor="#1a6a7c" /><stop offset="1" stopColor="#082c3c" />
        </linearGradient>
        <linearGradient id="lc-sand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a8a8c" /><stop offset="1" stopColor="#0a3040" />
        </linearGradient>
      </defs>
      <rect width="1440" height="800" fill="url(#lc-sea)" />
      {RAYS.map((x, i) => <polygon key={x} points={`${String(x - 30)},0 ${String(x + 40)},0 ${String(x + 150 - i * 12)},760 ${String(x - 190 + i * 14)},760`} fill="url(#lc-ray)" opacity={0.55 - (i % 3) * 0.12} />)}
      {/* Drowned columns, far and near, and a broken lintel. */}
      {([[170, 70, 150, 0.5], [1180, 70, 170, 0.5], [60, 110, 40, 0.9], [1270, 110, 60, 0.9]] as const).map(([x, w, y, o]) => (
        <g key={x} opacity={o}><rect x={x} y={y} width={w} height={760 - y} fill="url(#lc-col)" /><rect x={x - 10} y={y} width={w + 20} height="26" fill="#1a6a7c" /></g>
      ))}
      <path d="M0 740 C220 700 420 760 720 736 S1180 706 1440 740 V800 H0 Z" fill="url(#lc-sand)" />
      <path d="M0 770 C300 752 520 782 800 768 S1200 756 1440 772" fill="none" stroke="#6fe0d0" strokeOpacity="0.35" strokeWidth="3" />
      {KELP.map((k) => <path key={k.x} d={`M${String(k.x)} 760 C${String(k.x - 30)} ${f(760 - k.h * 0.4)} ${String(k.x + 30)} ${f(760 - k.h * 0.7)} ${String(k.x)} ${f(760 - k.h)}`} fill="none" stroke="#2fb89a" strokeWidth="9" strokeLinecap="round" opacity="0.8" />)}
      {BUBBLES.map((b) => <circle key={`${f(b.x)}${f(b.y)}`} cx={b.x} cy={b.y} r={b.r} fill="none" stroke="#e8fbff" strokeWidth="1.6" opacity={b.o} />)}
    </svg>
  );
}

export function LookScene(props: { look: LookId }) {
  return props.look === "a" ? <ScrollScene /> : props.look === "b" ? <ArmouryScene /> : <SeaScene />;
}
