// The Account in the Obsidian set: the hero's name and three stats on the left, every achievement as a glass tile on the right.
// Won deeds burn with lava, unwon ones are cold ice with their progress. Hover or focus a tile to read how it is earned.
import { useState } from "react";
import { type Achievement, achievements } from "../../account/achievements";
import { NAME_MAX, renameProfile, useProfile } from "../../account/store";
import { FEAT_ICON, Icon, type IconName } from "../../account/ui/icons";
import type { EnemySpec } from "../../core/types";
import { SettingsPanel } from "../SettingsPanel";
import { BackButton, SetBackdrop, SetTitle } from "./parts";
import "./screens.css";
import "./account.css";

const GROUP_OF: Readonly<Record<string, string>> = {
  favoured: "arms", unbroken: "arms", chain: "arms", student: "arms", second_nature: "arms",
  song: "labours", ages: "labours", olympus: "labours", shield_wall: "labours", light_footed: "labours", many_ways: "labours", veteran: "labours",
  pupil: "dojo", pride: "dojo", shoulder: "dojo",
};
const GROUPS = [["road", "The road home"], ["dojo", "Dojo and rooms"], ["arms", "Feats of arms"], ["labours", "Long labours"]] as const;

function Tile(props: { feat: Achievement; on: (id: string | null) => void }) {
  const { feat } = props, p = feat.progress;
  const set = (): void => { props.on(feat.id); }, clear = (): void => { props.on(null); };
  return (
    <li>
      <button type="button" className={`set-feat ${feat.done ? "is-done" : "is-locked"}`} onMouseEnter={set} onMouseLeave={clear} onFocus={set} onBlur={clear}
        aria-label={`${feat.name}. ${feat.done ? "Won" : "Not won yet"}. ${feat.how}${p && !feat.done ? ` ${String(p.have)} of ${String(p.goal)} ${p.unit}.` : ""}`}>
        <Icon name={FEAT_ICON[feat.id] ?? "laurel"} className="set-feat__icon" />
        <span className="set-feat__name">{feat.name}</span>
        {p && !feat.done && <small className="set-feat__n">{p.have}/{p.goal}</small>}
        {p && !feat.done && <i className="set-feat__bar"><b style={{ width: `${String(Math.round((p.have / p.goal) * 100))}%` }} /></i>}
        {!feat.done && <Icon name="lock" className="set-feat__lock" />}
      </button>
    </li>
  );
}

function Detail(props: { feat: Achievement | undefined; picked: boolean }) {
  const { feat } = props;
  if (!feat) return <div className="set-panel set-panel--lava set-detail" aria-live="polite"><h2>Every trophy hung</h2><p>Every deed is yours. Ithaca is home.</p></div>;
  const p = feat.progress;
  return (
    <div className={`set-panel set-detail ${feat.done ? "set-panel--lava" : ""}`} aria-live="polite">
      <h2>{feat.done ? "Won" : props.picked ? "Not won yet" : "Next deed"}</h2>
      <b className="set-detail__name">{feat.name}</b>
      <p>{feat.how}</p>
      {p && !feat.done && (
        <span className="set-detail__progress" role="img" aria-label={`${String(p.have)} of ${String(p.goal)} ${p.unit}`}>
          <i className="set-feat__bar"><b style={{ width: `${String(Math.round((p.have / p.goal) * 100))}%` }} /></i>
          <span>{p.have}/{p.goal} {p.unit}</span>
        </span>
      )}
    </div>
  );
}

export function ObsidianAccount(props: { enemies: readonly EnemySpec[]; onBack: () => void }) {
  const profile = useProfile();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const feats = achievements(profile, props.enemies);
  const groups = GROUPS.map(([key, title]) => ({ key, title, feats: feats.filter((feat) => (GROUP_OF[feat.id] ?? "road") === key) }));
  const picked = feats.find((feat) => feat.id === activeId);
  const stats: readonly (readonly [IconName, number, string])[] = [["fights", profile.fights, "Fights"], ["laurel", profile.wins, "Won"], ["star", profile.bestScore, "Best score"]];
  return (
    <main className="menu--account set-acc">
      <SetBackdrop src="/textures/set/obsidian/hall.jpg" />
      <aside className="set-acc__side">
        <BackButton onClick={props.onBack}>Main menu</BackButton>
        <SetTitle kicker="Account">The Hall of the Hero</SetTitle>
        <div className="set-panel set-acc__hero">
          <label className="set-acc__name">
            <span>Your name</span>
            <input type="text" value={profile.name} maxLength={NAME_MAX} placeholder="Odysseus" autoComplete="off" spellCheck={false} onChange={(event) => { renameProfile(event.target.value); }} />
          </label>
          <dl className="set-acc__stats">
            {stats.map(([icon, value, label]) => <div key={label} className="set-stat"><Icon name={icon} className="set-stat__icon" /><dd><b>{value}</b></dd><dt><span>{label}</span></dt></div>)}
          </dl>
        </div>
        <Detail feat={picked ?? feats.find((feat) => !feat.done)} picked={picked !== undefined} />
        <div className="set-acc__actions">
          <button type="button" className="set-btn" onClick={() => { setSettingsOpen(true); }}><Icon name="sliders" />Open settings</button>
        </div>
      </aside>
      <section className="set-panel set-acc__feats" aria-label="Achievements">
        <p className="set-acc__count"><b>{feats.filter((feat) => feat.done).length}</b> of {feats.length} trophies hung</p>
        <div className="set-acc__groups">
          {groups.map((group) => (
            <section key={group.key} aria-label={group.title}>
              <h2>{group.title}<b>{group.feats.filter((feat) => feat.done).length} / {group.feats.length}</b></h2>
              <ul>{group.feats.map((feat) => <Tile key={feat.id} feat={feat} on={setActiveId} />)}</ul>
            </section>
          ))}
        </div>
      </section>
      {settingsOpen && <SettingsPanel onClose={() => { setSettingsOpen(false); }} />}
    </main>
  );
}
