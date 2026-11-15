// Look B, among the stars: a night sky over the wine-dark sea. Every deed is a star. The road home is the great arch
// across the sky, and its line draws itself from Troy toward Ithaca as the stops are won; the ship sits on the horizon
// under the last star reached. The hero's name is cut into a standing stone on the shore.
import { useMemo } from "react";
import type { Achievement } from "../../account/achievements";
import { Button } from "../../ui/pebble";
import { Detail, groupFeats, type LookProps, NameField, Stage, Stats, useActive, WithIcon, won } from "./shared";
import "./stars.css";

type Side = "r" | "l" | "b" | "t";
type Spot = readonly [x: number, y: number, side: Side];

// Hand-placed stars for each group, in the order the group lists its deeds, and where each label sits.
const SKY: Readonly<Record<string, readonly Spot[]>> = {
  road: [[440, 486, "b"], [566, 400, "b"], [700, 340, "b"], [842, 312, "b"], [986, 320, "b"], [1122, 356, "b"], [1246, 414, "b"], [1352, 490, "b"]],
  arms: [[452, 118, "r"], [586, 64, "r"], [712, 150, "r"], [616, 236, "r"], [476, 226, "l"]],
  labours: [[1030, 92, "r"], [1184, 58, "r"], [1336, 112, "l"], [1362, 226, "l"], [1206, 252, "b"], [1052, 220, "b"], [1124, 162, "r"]],
  dojo: [[96, 300, "r"], [236, 262, "r"], [190, 392, "r"]],
};
const TITLE_AT: Readonly<Record<string, readonly [number, number]>> = { road: [842, 384], arms: [570, 290], labours: [1210, 314], dojo: [190, 226] };
// Which pairs of stars a group's lines join; the road home joins in order, the others draw a figure.
const LINKS: Readonly<Record<string, readonly (readonly [number, number])[]>> = {
  road: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7]],
  arms: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0]],
  labours: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [6, 1], [6, 4]],
  dojo: [[0, 1], [1, 2], [2, 0]],
};
const MOON = [920, 104] as const;

function rng(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

function Sky() {
  const stars = useMemo(() => {
    const r = rng(7), out: { x: number; y: number; s: number; o: number }[] = [];
    for (let i = 0; i < 420; i++) {
      const x = r() * 1440, y = Math.pow(r(), 1.4) * 586, s = r() < 0.08 ? 1.6 : 0.5 + r() * 0.8;
      out.push({ x, y, s, o: 0.25 + r() * 0.6 });
    }
    return out;
  }, []);
  return (
    <svg className="acx-b-sky" viewBox="0 0 1440 800" aria-hidden="true">
      <defs>
        <radialGradient id="acxB-milk" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#b9a6e8" stopOpacity="0.22" /><stop offset="1" stopColor="#b9a6e8" stopOpacity="0" /></radialGradient>
        <linearGradient id="acxB-sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4a1434" /><stop offset="0.25" stopColor="#2a0a1e" /><stop offset="1" stopColor="#0e0309" /></linearGradient>
        <radialGradient id="acxB-moonglow"><stop offset="0" stopColor="#ffe9b8" stopOpacity="0.35" /><stop offset="1" stopColor="#ffe9b8" stopOpacity="0" /></radialGradient>
        <linearGradient id="acxB-glint" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffd88a" stopOpacity="0.75" /><stop offset="1" stopColor="#ffd88a" stopOpacity="0" /></linearGradient>
      </defs>
      <ellipse cx="760" cy="250" rx="760" ry="120" fill="url(#acxB-milk)" transform="rotate(-14 760 250)" />
      {stars.map((st, i) => <circle key={i} cx={st.x} cy={st.y} r={st.s} fill="#f4ecff" opacity={st.o} />)}
      <circle cx={MOON[0]} cy={MOON[1]} r="110" fill="url(#acxB-moonglow)" />
      <mask id="acxB-crescent"><rect width="1440" height="800" fill="#fff" /><circle cx={MOON[0] + 16} cy={MOON[1] - 10} r="36" fill="#000" /></mask>
      <circle cx={MOON[0]} cy={MOON[1]} r="40" fill="#fff4d8" mask="url(#acxB-crescent)" />
      <rect x="0" y="590" width="1440" height="210" fill="url(#acxB-sea)" />
      <rect x="0" y="588" width="1440" height="3" fill="#c25a7a" opacity="0.45" />
    </svg>
  );
}

function Sea(props: { road: readonly Achievement[] }) {
  const r = rng(3), waves = Array.from({ length: 60 }, () => ({ x: r() * 1440, y: 600 + Math.pow(r(), 0.8) * 190, w: 30 + r() * 120 }));
  const reached = props.road.reduce((last, feat, i) => (feat.done ? i : last), -1);
  const ship = reached >= 0 ? (SKY.road?.[reached]?.[0] ?? 440) : 380;
  return (
    <svg className="acx-b-sea" viewBox="0 0 1440 800" aria-hidden="true">
      {props.road.map((feat, i) => {
        const spot = SKY.road?.[i];
        return feat.done && spot ? <line key={feat.id} x1={spot[0]} y1={596} x2={spot[0]} y2={730 - i * 8} stroke="url(#acxB-glint)" strokeWidth="5" strokeDasharray="10 5 4 7 14 6" /> : null;
      })}
      {Array.from({ length: 16 }, (_, i) => <rect key={i} x={MOON[0] - 40 + Math.sin(i * 2.3) * 16} y={600 + i * 12} width={80 - i * 2.5} height="3" rx="1.5" fill="#ffe9b8" opacity={0.5 - i * 0.025} />)}
      {waves.map((w, i) => <path key={i} d={`M${String(w.x)},${String(w.y)} q${String(w.w / 4)},-3 ${String(w.w / 2)},0 t${String(w.w / 2)},0`} stroke="#d77a98" strokeOpacity={0.12 + (w.y - 600) / 900} strokeWidth="1.4" fill="none" />)}
      <g transform={`translate(${String(ship - 34)} 556)`} fill="#07020a">
        <path d="M0,30 L68,30 L60,40 L10,40 Z" />
        <path d="M33,30 V0 M33,2 L56,8 L33,24 Z" stroke="#07020a" strokeWidth="2.5" />
        <path d="M33,2 Q12,12 10,26 L33,26 Z" />
      </g>
    </svg>
  );
}

function Star(props: { feat: Achievement; spot: Spot; active: boolean; bind: object }) {
  const { feat, spot } = props, [x, y, side] = spot;
  return (
    <button type="button" className={`acx-b-star acx-b-star--${side} ${feat.done ? "is-done" : "is-locked"} ${props.active ? "is-active" : ""}`} style={{ left: x, top: y }} {...props.bind}>
      <svg className="acx-b-star__glyph" viewBox="-16 -16 32 32" aria-hidden="true">
        {feat.done
          ? <><circle r="13" fill="#ffd88a" opacity="0.28" /><path d="M0,-15 L3,-3 L15,0 L3,3 L0,15 L-3,3 L-15,0 L-3,-3 Z" fill="#fff6dc" /></>
          : <><circle r="8" fill="none" stroke="#b8a9d8" strokeOpacity="0.6" strokeWidth="1.4" strokeDasharray="2 3" /><circle r="2.6" fill="#cfc4ea" /></>}
      </svg>
      <span className="acx-b-star__name">{feat.name}</span>
    </button>
  );
}

export function Stars(props: LookProps) {
  const { feats, profile } = props, groups = groupFeats(feats);
  const { shown, picked, activeId, bind } = useActive(feats);
  const road = groups.find((group) => group.key === "road")?.feats ?? [];
  return (
    <Stage look="b">
      <Sky />
      <Sea road={road} />
      <svg className="acx-b-lines" viewBox="0 0 1440 800" aria-hidden="true">
        {groups.flatMap((group) => (LINKS[group.key] ?? []).map(([a, b]) => {
          const p = SKY[group.key]?.[a], q = SKY[group.key]?.[b], fa = group.feats[a], fb = group.feats[b];
          if (!p || !q || !fa || !fb) return null;
          const lit = fa.done && fb.done;
          return <line key={`${group.key}${String(a)}-${String(b)}`} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} className={lit ? "is-lit" : ""} />;
        }))}
      </svg>
      {groups.map((group) => {
        const at = TITLE_AT[group.key] ?? [0, 0];
        return <span key={group.key} className="acx-b-title" style={{ left: at[0], top: at[1] }}>{group.title} <b>{won(group.feats)} of {group.feats.length}</b></span>;
      })}
      {groups.flatMap((group) => group.feats.map((feat, i) => {
        const spot = SKY[group.key]?.[i];
        return spot ? <Star key={feat.id} feat={feat} spot={spot} active={activeId === feat.id} bind={bind(feat)} /> : null;
      }))}
      <header className="acx-b-head">
        <span>Account</span>
        <h1>Written in the stars</h1>
        <p><b>{won(feats)}</b> of {feats.length} stars lit</p>
      </header>
      <div className="acx-b-rock">
        <NameField name={profile.name} />
        <Stats profile={profile} />
      </div>
      <Detail feat={shown} picked={picked} className="acx-b-detail" />
      <div className="acx-b-actions">
        <Button onClick={props.onSettings}><WithIcon icon="sliders">Open settings</WithIcon></Button>
        <Button primary onClick={props.onBack}><WithIcon icon="house">Main menu</WithIcon></Button>
      </div>
    </Stage>
  );
}
