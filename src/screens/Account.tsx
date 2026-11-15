// The Account screen: the hall of the hero. The megaron at Ithaca seen straight on, red columns, the round hearth, the
// great bow on the wall, and the hero's helmet on a marble herm with the name (the only "login") cut into it.
// Every achievement is a trophy on the walls; hover or focus one to read how it is earned on the floor below.
// The scene is drawn on a stage 1440 px wide and at least 800 tall, scaled to the window; a taller or wider window
// gets more wall, floor and columns rather than empty bands. Everything is kept in this browser (src/account/store.ts).
import { type CSSProperties, useEffect, useState } from "react";
import { type Achievement, achievements } from "../account/achievements";
import { NAME_MAX, renameProfile, useProfile } from "../account/store";
import { Bow, Column, Hearth, Helm } from "../account/ui/HallArt";
import { Icon, type IconName } from "../account/ui/icons";
import { Trophy, type TrophyEvents } from "../account/ui/Trophy";
import type { EnemySpec } from "../core/types";
import { SettingsPanel } from "../ui/SettingsPanel";
import { Button, installGround } from "../ui/pebble";
import { LOOK } from "../ui/lookSwitch";
import { LookScreen } from "./accountLooks/LookScreen";
import "./account.css";

const GROUP_OF: Readonly<Record<string, string>> = {
  favoured: "arms", unbroken: "arms", chain: "arms", student: "arms", second_nature: "arms",
  song: "labours", ages: "labours", olympus: "labours", shield_wall: "labours", light_footed: "labours", many_ways: "labours", veteran: "labours",
  pupil: "dojo", pride: "dojo", shoulder: "dojo",
};
/** The four walls of trophies. The road home (first blood, every stop and Ithaca) takes any deed not named above. */
const GROUPS = [["road", "The road home"], ["dojo", "Dojo and rooms"], ["arms", "Feats of arms"], ["labours", "Long labours"]] as const;

interface Stage { k: number; w: number; h: number }
const measure = (): Stage => {
  const k = Math.min(window.innerWidth / 1440, window.innerHeight / 800);
  return { k, w: window.innerWidth / k, h: window.innerHeight / k };
};

function useStage(): Stage {
  const [stage, setStage] = useState(measure);
  useEffect(() => {
    const on = (): void => { setStage(measure()); };
    window.addEventListener("resize", on);
    return () => { window.removeEventListener("resize", on); };
  }, []);
  return stage;
}

function Wall(props: { side: "l" | "r"; groups: readonly { key: string; title: string; feats: readonly Achievement[] }[]; activeId: string | null; events: (feat: Achievement) => TrophyEvents }) {
  return (
    <div className={`acc-wall acc-wall--${props.side}`}>
      {props.groups.map((group) => (
        <section key={group.key} aria-label={group.title}>
          <h2 className="acc-beam">{group.title}<b>{group.feats.filter((feat) => feat.done).length} / {group.feats.length}</b></h2>
          <ul>{group.feats.map((feat) => <Trophy key={feat.id} feat={feat} active={props.activeId === feat.id} events={props.events(feat)} />)}</ul>
        </section>
      ))}
    </div>
  );
}

/** The deed being read: the one hovered or focused, else the next not yet won, else a word for a hero who has won them all. */
function Detail(props: { feat: Achievement | undefined; picked: boolean }) {
  const { feat } = props;
  if (!feat) return <div className="acc-detail is-done" aria-live="polite"><span className="acc-detail__tag">Every trophy hung</span><b className="acc-detail__name">The hall is full</b><span className="acc-detail__how">Every deed is yours. Ithaca is home.</span></div>;
  const p = feat.progress;
  return (
    <div className={`acc-detail ${feat.done ? "is-done" : "is-locked"}`} aria-live="polite">
      <span className="acc-detail__tag">{feat.done ? "Won" : props.picked ? "Not won yet" : "Next deed"}</span>
      <b className="acc-detail__name">{feat.name}</b>
      <span className="acc-detail__how">{feat.how}</span>
      {p && !feat.done && (
        <span className="acc-detail__progress" role="img" aria-label={`${String(p.have)} of ${String(p.goal)} ${p.unit}`}>
          <span className="acc-detail__bar"><i style={{ width: `${String(Math.round((p.have / p.goal) * 100))}%` }} /></span>
          <span>{p.have}/{p.goal} {p.unit}</span>
        </span>
      )}
    </div>
  );
}

/** The name's size on the herm: full size up to about ten letters, then smaller so a name of NAME_MAX still fits. */
const namePx = (name: string): number => Math.round(Math.max(18, Math.min(28, 270 / (Math.max(name.length, 1) * 0.62))));

function WithIcon(props: { icon: IconName; children: string }) {
  return <><Icon name={props.icon} className="acc-btn__icon" />{props.children}</>;
}

export function Account(props: { enemies: readonly EnemySpec[]; onBack: () => void }) {
  const profile = useProfile();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const stage = useStage();
  useEffect(() => { installGround(); }, []);
  const feats = achievements(profile, props.enemies);
  const groups = GROUPS.map(([key, title]) => ({ key, title, feats: feats.filter((feat) => (GROUP_OF[feat.id] ?? "road") === key) }));
  const picked = feats.find((feat) => feat.id === activeId);
  const events = (feat: Achievement): TrophyEvents => ({
    onMouseEnter: () => { setActiveId(feat.id); },
    onMouseLeave: () => { setActiveId(null); },
    onFocus: () => { setActiveId(feat.id); },
    onBlur: () => { setActiveId(null); },
  });
  const stats: readonly (readonly [IconName, number, string])[] = [["fights", profile.fights, "Fights"], ["laurel", profile.wins, "Won"], ["star", profile.bestScore, "Best score"]];
  const style = { width: stage.w, height: stage.h, transform: `scale(${String(stage.k)})`, "--extra": `${String(stage.h - 800)}px` } as CSSProperties;
  if (LOOK) {
    return (
      <>
        <LookScreen look={LOOK} profile={profile} feats={feats} activeId={activeId} setActiveId={setActiveId} onSettings={() => { setSettingsOpen(true); }} onBack={props.onBack} />
        {settingsOpen && <SettingsPanel onClose={() => { setSettingsOpen(false); }} />}
      </>
    );
  }
  return (
    <main className="menu--account acc-hall">
      <div className="acc-hall__stage" style={style}>
        <div className="acc-hall__frieze" aria-hidden="true" />
        <div className="acc-hall__dado" aria-hidden="true" />
        <div className="acc-hall__floor" aria-hidden="true" />
        <div className="acc-hall__light" aria-hidden="true" />
        <div className="acc-hall__core" style={{ left: (stage.w - 1440) / 2 }}>
          {stage.w >= 1540 && <><Column x={-36} /><Column x={1476} /></>}
          <Column x={494} />
          <Column x={946} />
          <h1 className="acc-title"><span>Account</span>The Hall of the Hero</h1>
          <Bow />
          <Helm />
          <div className="acc-herm">
            <label className="acc-name">
              <span>Your name</span>
              <input type="text" value={profile.name} style={{ "--name-px": `${String(namePx(profile.name))}px` } as CSSProperties} maxLength={NAME_MAX} placeholder="Odysseus" autoComplete="off" spellCheck={false} onChange={(event) => { renameProfile(event.target.value); }} />
            </label>
            <dl className="acc-stats">
              {stats.map(([icon, value, label]) => <div key={label}><Icon name={icon} /><dd>{value}</dd><dt>{label}</dt></div>)}
            </dl>
          </div>
          <Hearth />
          <Wall side="l" groups={groups.slice(0, 2)} activeId={activeId} events={events} />
          <Wall side="r" groups={groups.slice(2)} activeId={activeId} events={events} />
          <Detail feat={picked ?? feats.find((feat) => !feat.done)} picked={picked !== undefined} />
          <p className="acc-count"><b>{feats.filter((feat) => feat.done).length}</b> of {feats.length} trophies hung</p>
          <div className="acc-actions">
            <Button onClick={() => { setSettingsOpen(true); }}><WithIcon icon="sliders">Open settings</WithIcon></Button>
            <Button primary onClick={props.onBack}><WithIcon icon="house">Main menu</WithIcon></Button>
          </div>
        </div>
      </div>
      {settingsOpen && <SettingsPanel onClose={() => { setSettingsOpen(false); }} />}
    </main>
  );
}
