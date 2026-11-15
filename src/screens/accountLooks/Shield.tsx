// Look A, the shield of the hero: one great bronze shield, as Hephaestus forged Achilles' shield, fills the screen.
// The hero's name and tallies sit on the boss; the road home runs round the inner ring, every other deed round the outer
// one, and the river Ocean runs round the rim. Won deeds are polished gold, the rest dark patina waiting for the hammer.
import type { CSSProperties } from "react";
import type { Achievement } from "../../account/achievements";
import { FEAT_ICON, Icon } from "../../account/ui/icons";
import { Button } from "../../ui/pebble";
import { Detail, groupFeats, type LookProps, NameField, Stage, Stats, useActive, WithIcon, won } from "./shared";
import "./shield.css";

const CX = 720, CY = 400;
const deg = (a: number): number => (a * Math.PI) / 180;

function wave(r: number, amp: number, n: number): string {
  const pts: string[] = [];
  for (let i = 0; i <= 720; i++) {
    const t = (i / 720) * Math.PI * 2, rr = r + amp * Math.sin(n * t);
    pts.push(`${(rr * Math.cos(t)).toFixed(1)},${(rr * Math.sin(t)).toFixed(1)}`);
  }
  return `M${pts.join("L")}Z`;
}

// A whole circle as a text path. Clockwise from the bottom for words read round the top; anticlockwise from the top for
// words read along the bottom, so no group name sits upside down.
const circlePath = (r: number, cw: boolean): string => cw
  ? `M0,${String(r)} A${String(r)},${String(r)} 0 1 1 0,${String(-r)} A${String(r)},${String(r)} 0 1 1 0,${String(r)}`
  : `M0,${String(-r)} A${String(r)},${String(r)} 0 1 0 0,${String(r)} A${String(r)},${String(r)} 0 1 0 0,${String(-r)}`;
const pct = (n: number): string => `${((((n % 360) + 360) % 360) / 3.6).toFixed(2)}%`;

function Medal(props: { feat: Achievement; angle: number; r: number; size: number; active: boolean; bind: object }) {
  const { feat, angle, r, size } = props, p = feat.progress;
  const style = { left: CX + r * Math.cos(deg(angle)) - size / 2, top: CY + r * Math.sin(deg(angle)) - size / 2, width: size, height: size } as CSSProperties;
  const frac = p && !feat.done ? p.have / p.goal : 0, c = Math.PI * (size - 6);
  return (
    <button type="button" className={`acx-a-medal ${feat.done ? "is-done" : "is-locked"} ${props.active ? "is-active" : ""}`} style={style} {...props.bind}>
      <Icon name={FEAT_ICON[feat.id] ?? "laurel"} className="acx-a-medal__icon" />
      {frac > 0 && (
        <svg className="acx-a-medal__arc" viewBox={`0 0 ${String(size)} ${String(size)}`} aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={(size - 6) / 2} strokeDasharray={`${String(c * frac)} ${String(c)}`} />
        </svg>
      )}
    </button>
  );
}

export function Shield(props: LookProps) {
  const { feats, profile } = props;
  const groups = groupFeats(feats), [road, ...rest] = groups;
  const { shown, picked, activeId, bind } = useActive(feats);
  // The outer ring: each group in its own arc, a blank slot between groups.
  const outer: { feat: Achievement; slot: number }[] = [], arcs: { title: string; mid: number; count: string }[] = [];
  let slot = 0;
  for (const group of rest) {
    const start = slot;
    for (const feat of group.feats) outer.push({ feat, slot: slot++ });
    arcs.push({ title: group.title, mid: (start + slot - 1) / 2, count: `${String(won(group.feats))} of ${String(group.feats.length)}` });
    slot++;
  }
  const step = 360 / slot, a0 = -90 - ((rest[0]?.feats.length ?? 1) - 1) * step / 2;
  const roadFeats = road?.feats ?? [];
  return (
    <Stage look="a">
      <div className="acx-a-embers" aria-hidden="true" />
      <svg className="acx-a-shield" viewBox="-400 -400 800 800" aria-hidden="true">
        <defs>
          <radialGradient id="acxA-rim" cx="38%" cy="30%" r="80%"><stop offset="0" stopColor="#f1c879" /><stop offset="0.45" stopColor="#a8702c" /><stop offset="0.8" stopColor="#5c3812" /><stop offset="1" stopColor="#2c190a" /></radialGradient>
          <radialGradient id="acxA-field" cx="40%" cy="32%" r="75%"><stop offset="0" stopColor="#7a5124" /><stop offset="0.6" stopColor="#4a2f14" /><stop offset="1" stopColor="#2a1a0b" /></radialGradient>
          <radialGradient id="acxA-boss" cx="38%" cy="30%" r="75%"><stop offset="0" stopColor="#ffe7a8" /><stop offset="0.35" stopColor="#d49a45" /><stop offset="0.8" stopColor="#7a4c18" /><stop offset="1" stopColor="#3a2208" /></radialGradient>
          <path id="acxA-top" d={circlePath(342, true)} />
          <path id="acxA-low" d={circlePath(354, false)} />
          <path id="acxA-inner" d={circlePath(238, true)} />
        </defs>
        <circle r="398" fill="#0b0604" opacity="0.7" transform="translate(6 10)" />
        <circle r="394" fill="url(#acxA-rim)" />
        <circle r="392" fill="none" stroke="#ffe2a0" strokeOpacity="0.55" strokeWidth="2" />
        <path d={wave(377, 8, 40)} fill="none" stroke="#2c190a" strokeWidth="5" opacity="0.55" />
        <path d={wave(377, 8, 40)} fill="none" stroke="#ffe4a6" strokeWidth="2.2" />
        <circle r="362" fill="url(#acxA-field)" stroke="#2c190a" strokeWidth="4" />
        {[268, 290, 312, 334].map((r) => <circle key={r} r={r} fill="none" stroke="#e8b866" strokeOpacity="0.08" strokeWidth="1.5" />)}
        <circle r="252" fill="none" stroke="#2c190a" strokeWidth="10" />
        {Array.from({ length: 72 }, (_, i) => <circle key={i} cx={252 * Math.cos(deg(i * 5))} cy={252 * Math.sin(deg(i * 5))} r="3.4" fill="#f3cd85" />)}
        <circle r="246" fill="url(#acxA-field)" />
        {Array.from({ length: 48 }, (_, i) => <path key={i} d="M0,-152 Q5,-162 0,-172 Q-5,-162 0,-152Z" fill="#e8b866" fillOpacity="0.32" transform={`rotate(${String(i * 7.5)})`} />)}
        <circle r="148" fill="#2c190a" />
        <circle r="142" fill="url(#acxA-boss)" />
        <circle r="142" fill="none" stroke="#fff1c4" strokeOpacity="0.6" strokeWidth="2" />
        <circle r="128" fill="none" stroke="#3a2208" strokeOpacity="0.35" strokeWidth="2" />
        <text className="acx-a-arc acx-a-arc--inner"><textPath href="#acxA-inner" startOffset="50%" textAnchor="middle">{`The road home · ${String(won(roadFeats))} of ${String(roadFeats.length)}`}</textPath></text>
        {arcs.map((arc) => {
          const angle = a0 + arc.mid * step, low = Math.sin(deg(angle)) > 0.2;
          return <text key={arc.title} className="acx-a-arc"><textPath href={low ? "#acxA-low" : "#acxA-top"} startOffset={pct(low ? 270 - angle : angle - 90)} textAnchor="middle">{`${arc.title} · ${arc.count}`}</textPath></text>;
        })}
      </svg>
      {roadFeats.map((feat, i) => <Medal key={feat.id} feat={feat} angle={-90 + (i + 0.5) * (360 / roadFeats.length)} r={194} size={66} active={activeId === feat.id} bind={bind(feat)} />)}
      {outer.map(({ feat, slot: s }) => <Medal key={feat.id} feat={feat} angle={a0 + s * step} r={299} size={74} active={activeId === feat.id} bind={bind(feat)} />)}
      <div className="acx-a-boss">
        <NameField name={profile.name} />
        <Stats profile={profile} />
      </div>
      <header className="acx-a-head">
        <span>Account</span>
        <h1>The Shield of the Hero</h1>
      </header>
      <p className="acx-a-count"><b>{won(feats)}</b><span>of {feats.length} deeds<br />hammered in</span></p>
      <Detail feat={shown} picked={picked} className="acx-a-detail" />
      <ul className="acx-a-legend">
        {groups.map((group) => (
          <li key={group.key}><span>{group.title}</span><b>{won(group.feats)}<small>/{group.feats.length}</small></b></li>
        ))}
      </ul>
      <div className="acx-a-actions">
        <Button onClick={props.onSettings}><WithIcon icon="sliders">Open settings</WithIcon></Button>
        <Button primary onClick={props.onBack}><WithIcon icon="house">Main menu</WithIcon></Button>
      </div>
    </Stage>
  );
}
