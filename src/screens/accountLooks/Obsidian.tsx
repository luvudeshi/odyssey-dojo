// Look D, obsidian and lava, to match the Obsidian Rift fight HUD: the whole screen is one wall of black volcanic glass,
// cracked into shards. Each deed is a shard; a won deed glows from inside with lava, a locked one stays cold glass with
// only a dim ember in its cracks. The hero's name burns in the great slab at the middle.
import type { CSSProperties } from "react";
import type { Achievement } from "../../account/achievements";
import { FEAT_ICON, Icon } from "../../account/ui/icons";
import { Button } from "../../ui/pebble";
import { groupFeats, type LookProps, NameField, Progress, Stage, Stats, useActive, WithIcon, won } from "./shared";
import "./obsidian.css";

type Pt = readonly [number, number];
const XS = [0, 180, 360, 540, 900, 1080, 1260, 1440], YS = [0, 200, 400, 600, 800];

function rng(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647 - 0.5; };
}

// A jittered lattice: corners move, and every edge gets a kinked midpoint shared by the two shards on either side.
const r = rng(11);
const P: Pt[][] = XS.map((x, i) => YS.map((y, j) => [i === 0 || i === XS.length - 1 ? x : x + r() * 40, j === 0 || j === YS.length - 1 ? y : y + r() * 44] as const));
const HM: Pt[][] = XS.slice(0, -1).map((_, i) => YS.map((_, j) => {
  const a = P[i]?.[j] ?? [0, 0], b = P[i + 1]?.[j] ?? [0, 0];
  return [(a[0] + b[0]) / 2 + r() * 30, (a[1] + b[1]) / 2 + (j === 0 || j === YS.length - 1 ? 0 : r() * 26)] as const;
}));
const VM: Pt[][] = XS.map((_, i) => YS.slice(0, -1).map((_, j) => {
  const a = P[i]?.[j] ?? [0, 0], b = P[i]?.[j + 1] ?? [0, 0];
  return [(a[0] + b[0]) / 2 + (i === 0 || i === XS.length - 1 ? 0 : r() * 26), (a[1] + b[1]) / 2 + r() * 30] as const;
}));
const pt = (grid: Pt[][], i: number, j: number): Pt => grid[i]?.[j] ?? [0, 0];

interface Shard { readonly poly: string; readonly box: CSSProperties; readonly cx: number; readonly cy: number }

/** The shard covering lattice cells [c0, c1) x [r0, r1), pulled in toward its middle so a crack shows round it. */
function shard(c0: number, r0: number, c1: number, r1: number): Shard {
  const ring: Pt[] = [];
  for (let i = c0; i < c1; i++) ring.push(pt(P, i, r0), pt(HM, i, r0));
  for (let j = r0; j < r1; j++) ring.push(pt(P, c1, j), pt(VM, c1, j));
  for (let i = c1; i > c0; i--) ring.push(pt(P, i, r1), pt(HM, i - 1, r1));
  for (let j = r1; j > r0; j--) ring.push(pt(P, c0, j), pt(VM, c0, j - 1));
  const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length, cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const poly = ring.map(([x, y]) => {
    const d = Math.hypot(x - cx, y - cy), k = Math.max(0, 1 - 4 / d);
    return `${(cx + (x - cx) * k).toFixed(1)},${(cy + (y - cy) * k).toFixed(1)}`;
  }).join(" ");
  const avg = (pts: Pt[], n: 0 | 1): number => pts.reduce((s, p) => s + p[n], 0) / pts.length;
  const left = avg([pt(P, c0, r0), pt(P, c0, r1)], 0), right = avg([pt(P, c1, r0), pt(P, c1, r1)], 0);
  const top = avg([pt(P, c0, r0), pt(P, c1, r0)], 1), bottom = avg([pt(P, c0, r1), pt(P, c1, r1)], 1);
  return { poly, cx, cy, box: { left: left + 14, top: top + 18, width: right - left - 28, height: bottom - top - 32 } };
}

const SIDE_CELLS = (c0: number): Shard[] => [0, 1, 2, 3].flatMap((row) => [0, 1, 2].map((col) => shard(c0 + col, row, c0 + col + 1, row + 1)));
const LEFT = SIDE_CELLS(0), RIGHT = SIDE_CELLS(4), SLAB = shard(3, 0, 4, 3), FOOT = shard(3, 3, 4, 4);

function veins(s: Shard, seed: number): string {
  const q = rng(seed);
  return [0, 1, 2].map(() => {
    // From low in the shard, fanning downward, so the veins stay clear of the words at its top.
    const a = Math.PI / 2 + q() * 2.2, len = 50 + q() * 50;
    return `M${(s.cx + 20).toFixed(0)},${(s.cy + 52).toFixed(0)} l${(Math.cos(a) * len * 0.5 + q() * 14).toFixed(0)},${(Math.sin(a) * len * 0.5 + q() * 14).toFixed(0)} l${(Math.cos(a) * len * 0.3 + q() * 24).toFixed(0)},${(Math.sin(a) * len * 0.3 + q() * 24).toFixed(0)} l${(Math.cos(a) * len * 0.4).toFixed(0)},${(Math.sin(a) * len * 0.4).toFixed(0)}`;
  }).join(" ");
}

function Deed(props: { feat: Achievement; group: string; s: Shard; bind: object }) {
  const { feat, s } = props;
  return (
    <button type="button" className={`acx-d-deed ${feat.done ? "is-done" : "is-locked"}`} style={s.box} {...props.bind}>
      <span className="acx-d-deed__top"><Icon name={FEAT_ICON[feat.id] ?? "laurel"} className="acx-d-deed__icon" /><small>{feat.done ? "Won" : props.group}</small></span>
      <b>{feat.name}</b>
      <span className="acx-d-deed__how">{feat.how}</span>
      {feat.progress && !feat.done && <Progress feat={feat} />}
    </button>
  );
}

export function Obsidian(props: LookProps) {
  const { feats, profile } = props, groups = groupFeats(feats);
  const { activeId, bind } = useActive(feats);
  const placed = (key: string): Achievement[] => [...(groups.find((group) => group.key === key)?.feats ?? [])];
  const left = [...placed("road"), ...placed("dojo")], right = [...placed("arms"), ...placed("labours")];
  const SHORT: Readonly<Record<string, string>> = { road: "Road home", arms: "Feat of arms", labours: "Long labour", dojo: "Dojo and rooms" };
  const group = (feat: Achievement): string => SHORT[groups.find((g) => g.feats.includes(feat))?.key ?? ""] ?? "";
  const cells = [...left.map((feat, i) => ({ feat, s: LEFT[i] })), ...right.map((feat, i) => ({ feat, s: RIGHT[i] }))];
  const spare = [...LEFT.slice(left.length), ...RIGHT.slice(right.length)];
  return (
    <Stage look="d">
      <svg className="acx-d-wall" viewBox="0 0 1440 800" aria-hidden="true">
        <defs>
          <linearGradient id="acxD-glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#24222c" /><stop offset="0.45" stopColor="#111016" /><stop offset="1" stopColor="#060509" /></linearGradient>
          <radialGradient id="acxD-lava" cx="50%" cy="55%" r="70%"><stop offset="0" stopColor="#4a0e05" /><stop offset="0.55" stopColor="#5e1406" /><stop offset="0.85" stopColor="#8a2408" /><stop offset="1" stopColor="#b8380c" /></radialGradient>
          <linearGradient id="acxD-sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffffff" stopOpacity="0" /><stop offset="0.36" stopColor="#ffffff" stopOpacity="0" /><stop offset="0.42" stopColor="#ffffff" stopOpacity="0.07" /><stop offset="0.5" stopColor="#ffffff" stopOpacity="0" /></linearGradient>
          <filter id="acxD-hot" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="3" /></filter>
          <radialGradient id="acxD-slab" cx="50%" cy="42%" r="70%"><stop offset="0" stopColor="#2a1410" /><stop offset="0.6" stopColor="#120a0c" /><stop offset="1" stopColor="#060509" /></radialGradient>
          <filter id="acxD-glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7" /></filter>
        </defs>
        {cells.map(({ feat, s }) => s && feat.done ? <polygon key={`g${feat.id}`} points={s.poly} fill="none" stroke="#ff7a1a" strokeWidth="10" filter="url(#acxD-glow)" /> : null)}
        {[SLAB, FOOT, ...spare].map((s, i) => <polygon key={`p${String(i)}`} points={s.poly} fill={s === SLAB ? "url(#acxD-slab)" : "url(#acxD-glass)"} />)}
        {cells.map(({ feat, s }) => s ? (
          <g key={feat.id} className={`acx-d-shard ${feat.done ? "is-done" : ""} ${activeId === feat.id ? "is-active" : ""}`}>
            <polygon points={s.poly} fill={feat.done ? "url(#acxD-lava)" : "url(#acxD-glass)"} />
            {feat.done ? <>
              <clipPath id={`acxD-c-${feat.id}`}><polygon points={s.poly} /></clipPath>
              <g clipPath={`url(#acxD-c-${feat.id})`}>
                <polygon points={s.poly} fill="none" stroke="#ff7a1a" strokeWidth="30" filter="url(#acxD-glow)" />
                <path d={veins(s, feat.id.length * 97)} stroke="#ff6a10" strokeWidth="7" fill="none" filter="url(#acxD-hot)" />
                <path d={veins(s, feat.id.length * 97)} stroke="#ffe08a" strokeWidth="1.8" fill="none" />
              </g>
              <polygon points={s.poly} fill="none" stroke="#ffc060" strokeWidth="2" />
            </> : <polygon points={s.poly} fill="url(#acxD-sheen)" stroke="#ffffff" strokeOpacity="0.07" strokeWidth="1.5" />}
          </g>
        ) : null)}
        <path d={`${veins(SLAB, 5)} ${veins(SLAB, 9)}`} stroke="#ff7a1a" strokeWidth="2" fill="none" opacity="0.5" filter="url(#acxD-glow)" />
      </svg>
      {cells.map(({ feat, s }) => s ? <Deed key={feat.id} feat={feat} group={group(feat)} s={s} bind={bind(feat)} /> : null)}
      <div className="acx-d-slab" style={SLAB.box}>
        <h1>Account</h1>
        <NameField name={profile.name} />
        <Stats profile={profile} />
        <p className="acx-d-total"><b>{won(feats)}</b> of {feats.length} shards burning</p>
        <ul>{groups.map((g) => <li key={g.key}><span>{g.title}</span><b>{won(g.feats)}/{g.feats.length}</b></li>)}</ul>
      </div>
      <div className="acx-d-foot" style={FOOT.box}>
        <Button onClick={props.onSettings}><WithIcon icon="sliders">Open settings</WithIcon></Button>
        <Button primary onClick={props.onBack}><WithIcon icon="house">Main menu</WithIcon></Button>
      </div>
    </Stage>
  );
}
