// The drawn pieces of the Account hall, all inline SVG: the hero's bronze helmet, the great bow on the wall, the round
// hearth, and a red Minoan column. Decoration only; none of it takes focus or holds words.

export function Column(props: { x: number }) {
  return (
    <div className="acc-col" style={{ left: props.x - 40 }} aria-hidden="true">
      <i className="acc-col__abacus" /><i className="acc-col__echinus" /><i className="acc-col__ring" /><i className="acc-col__shaft" /><i className="acc-col__base" />
    </div>
  );
}

export function Hearth() {
  return (
    <svg className="acc-hearth" viewBox="0 0 400 220" aria-hidden="true">
      <defs>
        <radialGradient id="acc-hearth-glow" cx="50%" cy="75%" r="60%"><stop offset="0" stopColor="#ffb347" stopOpacity="0.9" /><stop offset="0.5" stopColor="#ff6a1a" stopOpacity="0.35" /><stop offset="1" stopColor="#ff6a1a" stopOpacity="0" /></radialGradient>
        <linearGradient id="acc-hearth-flame" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#fff2b0" /><stop offset="0.35" stopColor="#ffb02e" /><stop offset="0.75" stopColor="#e2481a" /><stop offset="1" stopColor="#8a1a08" stopOpacity="0" /></linearGradient>
      </defs>
      <ellipse cx="200" cy="150" rx="200" ry="80" fill="url(#acc-hearth-glow)" />
      <g className="acc-hearth__flames" fill="url(#acc-hearth-flame)">
        <path d="M150,170 C130,130 160,110 152,70 C180,100 186,120 178,170 Z" />
        <path d="M176,172 C160,110 200,90 196,20 C236,70 240,120 222,172 Z" />
        <path d="M214,172 C210,130 240,120 244,84 C262,118 262,146 250,172 Z" />
      </g>
      <ellipse cx="200" cy="178" rx="150" ry="30" fill="#2a1a12" />
      <ellipse cx="200" cy="174" rx="150" ry="26" fill="none" stroke="#d3c7ad" strokeWidth="10" strokeDasharray="22 6" />
      <ellipse cx="200" cy="172" rx="118" ry="16" fill="#ff8a2a" opacity="0.55" />
    </svg>
  );
}

export function Helm() {
  return (
    <svg className="acc-helm" viewBox="0 -40 200 230" aria-hidden="true">
      <defs>
        <radialGradient id="acc-helm-bronze" cx="40%" cy="30%" r="80%"><stop offset="0" stopColor="#ffe1a0" /><stop offset="0.35" stopColor="#d09440" /><stop offset="0.75" stopColor="#7c4a16" /><stop offset="1" stopColor="#3a2008" /></radialGradient>
      </defs>
      <path d="M26,64 C34,-34 166,-34 174,64 L160,66 C150,-8 50,-8 40,66 Z" fill="#8a1c10" stroke="#3a0a04" strokeWidth="2" />
      {Array.from({ length: 13 }, (_, i) => <path key={i} d={`M${String(40 + i * 10)},60 Q${String(44 + i * 10 - (6 - i) * 3)},${String(10 + Math.abs(6 - i) * 2)} ${String(100 + (i - 6) * 7)},-14`} stroke="#c23a22" strokeWidth="2" fill="none" opacity="0.7" />)}
      <path d="M100,20 C150,20 172,55 172,100 L172,150 C172,166 160,178 145,180 L128,182 L124,140 C124,132 118,128 112,128 L108,128 L106,160 L100,168 L94,160 L92,128 L88,128 C82,128 76,132 76,140 L72,182 L55,180 C40,178 28,166 28,150 L28,100 C28,55 50,20 100,20 Z" fill="url(#acc-helm-bronze)" stroke="#2a1606" strokeWidth="2.5" />
      <path d="M52,102 Q74,94 96,102 L96,130 L90,130 Q84,116 54,114 Z M148,102 Q126,94 104,102 L104,130 L110,130 Q116,116 146,114 Z" fill="#120804" />
      <path d="M40,90 Q100,70 160,90" stroke="#ffe7b0" strokeOpacity="0.45" strokeWidth="2" fill="none" />
    </svg>
  );
}

export function Bow() {
  const limb = "M14,64 Q4,40 30,38 Q120,6 200,30 Q280,6 370,38 Q396,40 386,64";
  return (
    <svg className="acc-bow" viewBox="0 0 400 90" aria-hidden="true">
      <circle cx="96" cy="22" r="6" fill="#2a1808" /><circle cx="304" cy="22" r="6" fill="#2a1808" />
      <path d={limb} fill="none" stroke="#3a2008" strokeWidth="12" strokeLinecap="round" />
      <path d={limb} fill="none" stroke="#c88d3e" strokeWidth="7" strokeLinecap="round" />
      <path d="M186,26 L214,26 L214,36 L186,36 Z" fill="#e2b25d" />
      <path d="M16,62 L384,62" stroke="#f1e6cf" strokeWidth="1.6" />
    </svg>
  );
}
