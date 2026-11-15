// Look C, the hall of the hero: the megaron at Ithaca seen straight on. Red Minoan columns, the round hearth burning in
// the middle, the great bow on the wall, and the hero's helmet on a marble herm with the name cut into it. Every deed is
// a trophy hung on the painted walls; a deed not yet won is an empty peg with its outline chalked where it will hang.
import type { Achievement } from "../../account/achievements";
import { FEAT_ICON, Icon } from "../../account/ui/icons";
import { Button } from "../../ui/pebble";
import { Detail, type Group, groupFeats, type LookProps, NameField, Stage, Stats, useActive, WithIcon, won } from "./shared";
import "./hall.css";

function Trophy(props: { feat: Achievement; active: boolean; bind: object }) {
  const { feat } = props, p = feat.progress;
  return (
    <li>
      <button type="button" className={`acx-c-trophy ${feat.done ? "is-done" : "is-locked"} ${props.active ? "is-active" : ""}`} {...props.bind}>
        <span className="acx-c-trophy__peg" aria-hidden="true" />
        <Icon name={FEAT_ICON[feat.id] ?? "laurel"} className="acx-c-trophy__icon" />
        <span className="acx-c-trophy__name">{feat.name}{p && !feat.done && <small> {p.have}/{p.goal}</small>}</span>
      </button>
    </li>
  );
}

function Wall(props: { groups: readonly Group[]; side: "l" | "r"; activeId: string | null; bind: (feat: Achievement) => object }) {
  return (
    <div className={`acx-c-wall acx-c-wall--${props.side}`}>
      {props.groups.map((group) => (
        <section key={group.key}>
          <h2 className="acx-c-beam">{group.title}<b>{won(group.feats)} / {group.feats.length}</b></h2>
          <ul>{group.feats.map((feat) => <Trophy key={feat.id} feat={feat} active={props.activeId === feat.id} bind={props.bind(feat)} />)}</ul>
        </section>
      ))}
    </div>
  );
}

function Column(props: { x: number }) {
  return (
    <svg className="acx-c-col" style={{ left: props.x - 40 }} viewBox="0 0 80 560" aria-hidden="true">
      <defs><linearGradient id={`acxC-shaft${String(props.x)}`} x1="0" x2="1"><stop offset="0" stopColor="#5a160c" /><stop offset="0.35" stopColor="#c0412a" /><stop offset="0.6" stopColor="#a8321e" /><stop offset="1" stopColor="#3e0e07" /></linearGradient></defs>
      <rect x="4" y="0" width="72" height="16" fill="#1a0d08" />
      <ellipse cx="40" cy="34" rx="38" ry="18" fill="#140906" />
      <rect x="10" y="46" width="60" height="8" fill="#e2b25d" />
      <path d="M12,54 L68,54 L60,540 L20,540 Z" fill={`url(#acxC-shaft${String(props.x)})`} />
      <rect x="12" y="538" width="56" height="22" rx="3" fill="#140906" />
    </svg>
  );
}

function Hearth() {
  return (
    <svg className="acx-c-hearth" viewBox="0 0 400 220" aria-hidden="true">
      <defs>
        <radialGradient id="acxC-glow" cx="50%" cy="75%" r="60%"><stop offset="0" stopColor="#ffb347" stopOpacity="0.9" /><stop offset="0.5" stopColor="#ff6a1a" stopOpacity="0.35" /><stop offset="1" stopColor="#ff6a1a" stopOpacity="0" /></radialGradient>
        <linearGradient id="acxC-flame" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#fff2b0" /><stop offset="0.35" stopColor="#ffb02e" /><stop offset="0.75" stopColor="#e2481a" /><stop offset="1" stopColor="#8a1a08" stopOpacity="0" /></linearGradient>
      </defs>
      <ellipse cx="200" cy="150" rx="200" ry="80" fill="url(#acxC-glow)" />
      <g className="acx-c-flames" fill="url(#acxC-flame)">
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

function Helm() {
  return (
    <svg className="acx-c-helm" viewBox="0 -40 200 230" aria-hidden="true">
      <defs>
        <radialGradient id="acxC-bronze" cx="40%" cy="30%" r="80%"><stop offset="0" stopColor="#ffe1a0" /><stop offset="0.35" stopColor="#d09440" /><stop offset="0.75" stopColor="#7c4a16" /><stop offset="1" stopColor="#3a2008" /></radialGradient>
      </defs>
      <path d="M26,64 C34,-34 166,-34 174,64 L160,66 C150,-8 50,-8 40,66 Z" fill="#8a1c10" stroke="#3a0a04" strokeWidth="2" />
      {Array.from({ length: 13 }, (_, i) => <path key={i} d={`M${String(40 + i * 10)},60 Q${String(44 + i * 10 - (6 - i) * 3)},${String(10 - Math.abs(6 - i) * -2)} ${String(100 + (i - 6) * 7)},-14`} stroke="#c23a22" strokeWidth="2" fill="none" opacity="0.7" />)}
      <path d="M100,20 C150,20 172,55 172,100 L172,150 C172,166 160,178 145,180 L128,182 L124,140 C124,132 118,128 112,128 L108,128 L106,160 L100,168 L94,160 L92,128 L88,128 C82,128 76,132 76,140 L72,182 L55,180 C40,178 28,166 28,150 L28,100 C28,55 50,20 100,20 Z" fill="url(#acxC-bronze)" stroke="#2a1606" strokeWidth="2.5" />
      <path d="M52,102 Q74,94 96,102 L96,130 L90,130 Q84,116 54,114 Z M148,102 Q126,94 104,102 L104,130 L110,130 Q116,116 146,114 Z" fill="#120804" />
      <path d="M40,90 Q100,70 160,90" stroke="#ffe7b0" strokeOpacity="0.45" strokeWidth="2" fill="none" />
    </svg>
  );
}

function Bow() {
  return (
    <svg className="acx-c-bow" viewBox="0 0 400 90" aria-hidden="true">
      <circle cx="96" cy="22" r="6" fill="#2a1808" /><circle cx="304" cy="22" r="6" fill="#2a1808" />
      <path d="M14,64 Q4,40 30,38 Q120,6 200,30 Q280,6 370,38 Q396,40 386,64" fill="none" stroke="#3a2008" strokeWidth="12" strokeLinecap="round" />
      <path d="M14,64 Q4,40 30,38 Q120,6 200,30 Q280,6 370,38 Q396,40 386,64" fill="none" stroke="#c88d3e" strokeWidth="7" strokeLinecap="round" />
      <path d="M186,26 L214,26 L214,36 L186,36 Z" fill="#e2b25d" />
      <path d="M16,62 L384,62" stroke="#f1e6cf" strokeWidth="1.6" />
    </svg>
  );
}

export function Hall(props: LookProps) {
  const { feats, profile } = props, groups = groupFeats(feats);
  const { shown, picked, activeId, bind } = useActive(feats);
  const byKey = (key: string): Group[] => groups.filter((group) => group.key === key);
  return (
    <Stage look="c">
      <div className="acx-c-frieze" aria-hidden="true" />
      <div className="acx-c-dado" aria-hidden="true" />
      <div className="acx-c-floor" aria-hidden="true" />
      <div className="acx-c-light" aria-hidden="true" />
      <Column x={494} />
      <Column x={946} />
      <h1 className="acx-c-title"><span>Account</span>The Hall of the Hero</h1>
      <Bow />
      <Helm />
      <div className="acx-c-herm">
        <NameField name={profile.name} />
        <Stats profile={profile} />
      </div>
      <Hearth />
      <Wall side="l" groups={[...byKey("road"), ...byKey("dojo")]} activeId={activeId} bind={bind} />
      <Wall side="r" groups={[...byKey("arms"), ...byKey("labours")]} activeId={activeId} bind={bind} />
      <Detail feat={shown} picked={picked} className="acx-c-detail" />
      <p className="acx-c-count"><b>{won(feats)}</b> of {feats.length} trophies hung</p>
      <div className="acx-c-actions">
        <Button onClick={props.onSettings}><WithIcon icon="sliders">Open settings</WithIcon></Button>
        <Button primary onClick={props.onBack}><WithIcon icon="house">Main menu</WithIcon></Button>
      </div>
    </Stage>
  );
}
