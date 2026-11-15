// The Account screen: a hero name (the only "login"), achievements as badges, and settings.
// Everything is kept in this browser (src/account/store.ts). Rooms are on the Multiplayer screen.
import { useEffect, useState } from "react";
import { achievements } from "../account/achievements";
import { NAME_MAX, renameProfile, useProfile } from "../account/store";
import { AchievementTile } from "../account/ui/AchievementTile";
import { Icon, type IconName } from "../account/ui/icons";
import type { EnemySpec } from "../core/types";
import { SettingsPanel } from "../ui/SettingsPanel";
import { Button, installGround, Panel, PebbleHeading } from "../ui/pebble";
import { look } from "../ui/lookSwitch";
import { AccountCrest } from "../account/ui/AccountCrest";
import "./account.css";
// Draft looks, one file each; keep the picked one and delete the others.
import "./account-a.css";
import "./account-b.css";
import "./account-c.css";

function Section(props: { icon: IconName; title: string; extra?: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={`acc-card ${props.className ?? ""}`}>
      <h2><Icon name={props.icon} className="acc-card__icon" />{props.title}{props.extra && <span className="acc-card__extra">{props.extra}</span>}</h2>
      {props.children}
    </section>
  );
}

function Stat(props: { icon: IconName; value: number; label: string }) {
  return (
    <div className="acc-stat">
      <Icon name={props.icon} />
      <b>{props.value}</b>
      <span>{props.label}</span>
    </div>
  );
}

function WithIcon(props: { icon: IconName; children: string }) {
  return <><Icon name={props.icon} className="acc-btn__icon" />{props.children}</>;
}

export function Account(props: { enemies: readonly EnemySpec[]; onBack: () => void }) {
  const profile = useProfile();
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => { installGround(); }, []);
  const feats = achievements(profile, props.enemies);
  return (
    <Panel as="main" ornament className="menu menu--account">
      <PebbleHeading as="h1" text="Account" px={48} tone={look === "b" ? "terra" : "ochre"} />
      <div className="account">
        <div className="account__side">
          <Section icon="helmet" title="Hero">
            {look === "c" && <AccountCrest />}
            <label className="account__name">
              <Icon name="pen" className="acc-btn__icon" />
              <span>Your name</span>
              <input type="text" value={profile.name} maxLength={NAME_MAX} placeholder="Odysseus" autoComplete="off" spellCheck={false} onChange={(event) => { renameProfile(event.target.value); }} />
            </label>
            <div className="acc-stats">
              <Stat icon="fights" value={profile.fights} label="Fights" />
              <Stat icon="laurel" value={profile.wins} label="Won" />
              <Stat icon="star" value={profile.bestScore} label="Best score" />
            </div>
            <small>Saved in this browser only. No password.</small>
          </Section>
          <Section icon="sliders" title="Settings">
            <p>Graphics, volume, mirror and key hints.</p>
            <Button onClick={() => { setSettingsOpen(true); }}><WithIcon icon="sliders">Open settings</WithIcon></Button>
          </Section>
        </div>
        <Section icon="trophy" title="Achievements" extra={`${String(feats.filter((feat) => feat.done).length)} of ${String(feats.length)}`} className="account__feats">
          <ul>{feats.map((feat) => <AchievementTile key={feat.id} feat={feat} />)}</ul>
        </Section>
      </div>
      <Button primary onClick={props.onBack}><WithIcon icon="house">Main menu</WithIcon></Button>
      {settingsOpen && <SettingsPanel onClose={() => { setSettingsOpen(false); }} />}
    </Panel>
  );
}
