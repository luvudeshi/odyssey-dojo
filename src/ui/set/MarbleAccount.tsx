// The Account screen in the marble and gold look (?look=marble): a bright hall of heroes behind, the hero's name and three
// figures on one sheet of marble, and every achievement as a medal on the other. Same data, labels and handlers as the hall.
import { type CSSProperties, useState } from "react";
import { achievements } from "../../account/achievements";
import { NAME_MAX, renameProfile, useProfile } from "../../account/store";
import { Icon } from "../../account/ui/icons";
import { Trophy, type TrophyEvents } from "../../account/ui/Trophy";
import type { EnemySpec } from "../../core/types";
import { Detail, GROUPS, GROUP_OF, namePx } from "../../screens/Account";
import { SettingsPanel } from "../SettingsPanel";
import { SetBackdrop, SetButton, SetPanel, SetStat, SetTitle } from "./index";

export function MarbleAccount(props: { enemies: readonly EnemySpec[]; onBack: () => void }) {
  const profile = useProfile();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const feats = achievements(profile, props.enemies);
  const picked = feats.find((feat) => feat.id === activeId);
  const events = (id: string): TrophyEvents => ({
    onMouseEnter: () => { setActiveId(id); },
    onMouseLeave: () => { setActiveId(null); },
    onFocus: () => { setActiveId(id); },
    onBlur: () => { setActiveId(null); },
  });
  const won = feats.filter((feat) => feat.done).length;
  return (
    <main className="menu--account set-screen set-account">
      <SetBackdrop src="/textures/set/marble/day-hall.jpg" position="50% 50%" />
      <div className="set-account__grid">
        <SetPanel className="set-account__hero set-panel--stele">
          <SetTitle kicker="Account">The Hall of the Hero</SetTitle>
          <label className="set-name">
            <span>Your name</span>
            <input type="text" value={profile.name} style={{ "--name-px": `${String(namePx(profile.name))}px` } as CSSProperties} maxLength={NAME_MAX} placeholder="Odysseus" autoComplete="off" spellCheck={false} onChange={(event) => { renameProfile(event.target.value); }} />
          </label>
          <dl className="set-account__stats">
            <SetStat icon={<Icon name="fights" className="acc-icon" />} value={profile.fights} label="Fights" />
            <SetStat icon={<Icon name="laurel" className="acc-icon" />} value={profile.wins} label="Won" />
            <SetStat icon={<Icon name="star" className="acc-icon" />} value={profile.bestScore} label="Best score" />
          </dl>
          <p className="set-account__count"><b>{won}</b> of {feats.length} trophies won</p>
          <Detail feat={picked ?? feats.find((feat) => !feat.done)} picked={picked !== undefined} />
          <div className="set-account__actions">
            <SetButton onClick={() => { setSettingsOpen(true); }}><Icon name="sliders" className="acc-btn__icon" />Open settings</SetButton>
            <SetButton primary onClick={props.onBack}><Icon name="house" className="acc-btn__icon" />Main menu</SetButton>
          </div>
        </SetPanel>
        <SetPanel className="set-account__deeds set-panel--hall">
          <div className="set-account__groups">
            {GROUPS.map(([key, title]) => {
              const list = feats.filter((feat) => (GROUP_OF[feat.id] ?? "road") === key);
              return (
                <section key={key} aria-label={title}>
                  <h2>{title}<b>{list.filter((feat) => feat.done).length} / {list.length}</b></h2>
                  <ul>{list.map((feat) => <Trophy key={feat.id} feat={feat} active={activeId === feat.id} events={events(feat.id)} />)}</ul>
                </section>
              );
            })}
          </div>
        </SetPanel>
      </div>
      {settingsOpen && <SettingsPanel onClose={() => { setSettingsOpen(false); }} />}
    </main>
  );
}
