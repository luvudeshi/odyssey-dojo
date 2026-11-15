// Look B, "The trireme": the whole screen is Odysseus's ship seen from above on a bright Aegean sea. Every deed is an oar.
// A deed won is an oar out in the water with white foam round its blade; a deed not won is an oar shipped (pulled in).
// The hero's name and stats ride the deck, with the bronze shields along it. Daylight, turquoise, a light look.
import { Icon } from "../../account/ui/icons";
import { Button } from "../../ui/pebble";
import "./lookA.css";
import "./lookB.css";
import { Detail, NameField, Stats, aria, groupsOf, hoverEvents, iconOf, useStage, type LookProps } from "./shared";

const HY = 380;
const TOP_PORT = HY - 104, BOT_PORT = HY + 104;
const TOP_TIP = 158, BOT_TIP = 598;

interface Slot { id: string; tipX: number; portX: number; top: boolean }

const WAVES = Array.from({ length: 46 }, (_, i) => {
  const x = (i * 197) % 1400, y = (i * 83) % 790;
  return `M${String(x)} ${String(y)} q14 -9 28 0 t28 0 t28 0`;
});

export function LookB(props: LookProps) {
  const { profile, feats, activeId } = props;
  const { stageStyle, coreStyle } = useStage();
  const groups = groupsOf(feats);
  const gf = (key: string) => groups.find((group) => group.key === key)?.feats ?? [];
  const top = [...gf("arms"), ...gf("labours")], bottom = [...gf("road"), ...gf("dojo")];
  const slots: Slot[] = [
    ...top.map((feat, i) => ({ id: feat.id, tipX: 72 + (i * 1296) / (top.length - 1), portX: 140 + (i * 1110) / (top.length - 1), top: true })),
    ...bottom.map((feat, i) => ({ id: feat.id, tipX: 72 + (i * 1296) / (bottom.length - 1), portX: 140 + (i * 1110) / (bottom.length - 1), top: false })),
  ];
  const slot = (id: string): Slot => slots.find((s) => s.id === id) ?? { id, tipX: 0, portX: 0, top: true };
  const picked = feats.find((feat) => feat.id === activeId);
  const won = feats.filter((feat) => feat.done).length;
  const oar = (feat: (typeof feats)[number]) => {
    const s = slot(feat.id), py = s.top ? TOP_PORT : BOT_PORT, ty = s.top ? TOP_TIP : BOT_TIP;
    const active = activeId === feat.id;
    if (!feat.done) {
      const f = 0.18;
      return <g key={feat.id}><circle cx={s.portX} cy={py} r="9" fill="#2a1608" /><line x1={s.portX} y1={py} x2={s.portX + (s.tipX - s.portX) * f} y2={py + (ty - py) * f} stroke="#7a4e2a" strokeWidth="6" strokeLinecap="round" />{active && <circle cx={s.portX} cy={py} r="15" fill="none" stroke="#fff" strokeWidth="3" />}</g>;
    }
    const deg = (Math.atan2(ty - py, s.tipX - s.portX) * 180) / Math.PI;
    return (
      <g key={feat.id}>
        <g transform={`translate(${String(s.tipX)} ${String(ty)}) rotate(${String(deg)})`} fill="none" stroke="#fff">
          <ellipse rx="62" ry="30" strokeWidth="3" opacity="0.45" /><ellipse rx="48" ry="22" strokeWidth="4" opacity={active ? 1 : 0.8} />
        </g>
        <line x1={s.portX} y1={py} x2={s.tipX} y2={ty} stroke="#5a3418" strokeWidth={active ? 9 : 7} strokeLinecap="round" />
        <g transform={`translate(${String(s.tipX)} ${String(ty)}) rotate(${String(deg)})`}><ellipse rx="30" ry="10.5" fill={active ? "#ffe29a" : "#e2ad63"} stroke="#5a3418" strokeWidth="3" /></g>
        <circle cx={s.portX} cy={py} r="9" fill="#2a1608" />
      </g>
    );
  };
  const plaque = (feat: (typeof feats)[number]) => {
    const s = slot(feat.id);
    return (
      <button key={feat.id} type="button" className={`lk-b-tag ${feat.done ? "is-done" : "is-locked"} ${s.top ? "is-top" : "is-bottom"} ${activeId === feat.id ? "is-active" : ""}`}
        style={{ left: s.tipX - 57, top: s.top ? 34 : 664 }} aria-label={aria(feat)} {...hoverEvents(props.setActiveId, feat.id)}>
        <span className="lk-b-tag__coin"><Icon name={iconOf(feat)} className="lk-b-tag__icon" /></span>
        <span className="lk-b-tag__name">{feat.name}{feat.progress && !feat.done && <small> {feat.progress.have}/{feat.progress.goal}</small>}</span>
      </button>
    );
  };
  const caption = (title: string, list: readonly (typeof feats)[number][], y: number) => {
    if (list.length === 0) return null;
    const a = slot(list[0]?.id ?? "").tipX - 57, b = slot(list[list.length - 1]?.id ?? "").tipX + 57;
    return <h2 key={title} className="lk-b-cap" style={{ left: a, width: b - a, top: y }}><span>{title}</span><b>{list.filter((feat) => feat.done).length}/{list.length}</b></h2>;
  };
  return (
    <main className="lk lk-b">
      <div className="lk-stage" style={stageStyle}>
        <div className="lk-core" style={coreStyle}>
          <svg className="lk-b-sea" viewBox="0 0 1440 800" aria-hidden="true">
            <defs><pattern id="lkb-plank" width="10" height="14" patternUnits="userSpaceOnUse"><rect width="10" height="14" fill="#c99a5c" /><line x1="0" y1="1" x2="10" y2="1" stroke="#a97a42" strokeWidth="1.6" /></pattern></defs>
            <g fill="none" stroke="#fff" strokeWidth="3" opacity="0.28" strokeLinecap="round">{WAVES.map((d) => <path key={d} d={d} />)}</g>
            <path className="lk-b-hull" d={`M60 ${String(HY)} C60 ${String(HY - 60)} 110 ${String(HY - 104)} 190 ${String(HY - 104)} L1250 ${String(HY - 104)} C1310 ${String(HY - 104)} 1370 ${String(HY - 40)} 1410 ${String(HY)} C1370 ${String(HY + 40)} 1310 ${String(HY + 104)} 1250 ${String(HY + 104)} L190 ${String(HY + 104)} C110 ${String(HY + 104)} 60 ${String(HY + 60)} 60 ${String(HY)} Z`} />
            <path className="lk-b-deck" d={`M84 ${String(HY)} C84 ${String(HY - 50)} 120 ${String(HY - 88)} 190 ${String(HY - 88)} L1250 ${String(HY - 88)} C1295 ${String(HY - 88)} 1345 ${String(HY - 35)} 1374 ${String(HY)} C1345 ${String(HY + 35)} 1295 ${String(HY + 88)} 1250 ${String(HY + 88)} L190 ${String(HY + 88)} C120 ${String(HY + 88)} 84 ${String(HY + 50)} 84 ${String(HY)} Z`} />
            <path d={`M1410 ${String(HY)} l22 -14 v28 z`} fill="#c98a3c" stroke="#5a3418" strokeWidth="3" />
            {[-1, 1].map((d) => <g key={d}><circle cx="1310" cy={HY + d * 62} r="17" fill="#fdf3dc" stroke="#3a2410" strokeWidth="3" /><circle cx="1315" cy={HY + d * 62} r="7" fill="#1b3a52" /></g>)}
            {feats.map(oar)}
          </svg>
          {top.map(plaque)}{bottom.map(plaque)}
          {caption("Feats of arms", gf("arms"), 4)}{caption("Long labours", gf("labours"), 4)}
          {caption("The road home", gf("road"), 634)}{caption("Dojo and rooms", gf("dojo"), 634)}
          <div className="lk-b-deck-ui" style={{ top: HY - 80 }}>
            <NameField name={profile.name} max={46} room={300} />
            <Stats profile={profile} />
            <Detail feat={picked ?? feats.find((feat) => !feat.done)} picked={picked !== undefined} doneText="Every oar is out" />
          </div>
          <footer className="lk-b-foot">
            <h1><span>Account</span>The Trireme of Odysseus<b>{won} of {feats.length} oars out</b></h1>
            <div className="lk-actions">
              <Button onClick={props.onSettings}><Icon name="sliders" className="lk-btn__icon" />Open settings</Button>
              <Button primary onClick={props.onBack}><Icon name="house" className="lk-btn__icon" />Main menu</Button>
            </div>
          </footer>
        </div>
      </div>
    </main>
  );
}
