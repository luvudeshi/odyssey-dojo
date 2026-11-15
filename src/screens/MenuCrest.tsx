// The logo crest over the main menu title: Athena's owl in a bronze disc inside a laurel wreath, on a golden sunburst.
// Drawn in code, so it needs no image file. The look lives in menuCrest.css, scoped to .menu--title.
const LEAVES = Array.from({ length: 9 }, (_, i) => 112 - i * 21);

function Sprig(props: { side: 1 | -1 }) {
  return (
    <g transform={props.side === 1 ? undefined : "translate(200 0) scale(-1 1)"}>
      {LEAVES.map((deg, i) => {
        const a = (deg * Math.PI) / 180;
        const x = 100 + 82 * Math.cos(a), y = 100 + 82 * Math.sin(a);
        const tan = deg + 90;
        const size = 1 - i * 0.045;
        return (
          <g key={deg}>
            <ellipse cx={x} cy={y} rx={20 * size} ry={8.4 * size} transform={`rotate(${tan - 28} ${x} ${y})`} fill="url(#crest-leaf)" stroke="#2a1406" strokeWidth="1.6" />
            <ellipse cx={x} cy={y} rx={18 * size} ry={7.4 * size} transform={`rotate(${tan + 30} ${x} ${y}) translate(6 -9)`} fill="url(#crest-leaf)" stroke="#2a1406" strokeWidth="1.6" />
          </g>
        );
      })}
      <path d="M100 180 A80 80 0 0 0 28 66" fill="none" stroke="#2a1406" strokeWidth="3" strokeLinecap="round" />
    </g>
  );
}

export function MenuCrest() {
  return (
    <div className="crest" aria-hidden="true">
      <i className="crest__rays" />
      <i className="crest__halo" />
      <svg className="crest__svg" viewBox="0 0 200 200" focusable="false">
        <defs>
          <linearGradient id="crest-leaf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffe6b0" /><stop offset=".5" stopColor="#d79a45" /><stop offset="1" stopColor="#7a4416" /></linearGradient>
          <radialGradient id="crest-disc" cx=".4" cy=".3" r=".95"><stop offset="0" stopColor="#1f5a5e" /><stop offset="1" stopColor="#061a1d" /></radialGradient>
          <linearGradient id="crest-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff1c2" /><stop offset=".55" stopColor="#f4c56a" /><stop offset="1" stopColor="#c98f37" /></linearGradient>
        </defs>
        <Sprig side={1} />
        <Sprig side={-1} />
        <circle cx="100" cy="100" r="58" fill="#1a0d06" />
        <circle cx="100" cy="100" r="55" fill="url(#crest-disc)" stroke="#e8b25a" strokeWidth="4" />
        <circle cx="100" cy="100" r="46" fill="none" stroke="#c98f37" strokeOpacity=".5" strokeWidth="1" strokeDasharray="1.5 3.5" strokeLinecap="round" />
        <g transform="translate(66 60) scale(.68)" stroke="#2a1406" strokeWidth="1.5" strokeLinejoin="round">
          <path fill="url(#crest-gold)" d="M20 14L36 28H64L80 14L84 44C90 70 82 100 66 112L66 120H34L34 112C18 100 10 70 16 44Z" />
          <path fill="url(#crest-gold)" d="M30 118L24 128H44L38 118ZM62 118L56 128H76L70 118Z" />
          <circle cx="37" cy="42" r="12" fill="#061a1d" /><circle cx="63" cy="42" r="12" fill="#061a1d" />
          <circle cx="37" cy="42" r="6" fill="#ffd57e" stroke="none" /><circle cx="63" cy="42" r="6" fill="#ffd57e" stroke="none" />
          <path d="M50 48L44 60H56Z" fill="#c98f37" />
          <path fill="none" stroke="#7a4416" strokeWidth="2.4" strokeLinecap="round" d="M30 68q8 6 16 0M54 68q8 6 16 0M28 82q10 8 20 0M52 82q10 8 20 0M32 96q8 6 16 0M52 96q8 6 16 0" />
        </g>
      </svg>
    </div>
  );
}
