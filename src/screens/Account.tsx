// The Account screen: a hero name (the only "login"), achievements, friends (fight together in a room) and settings.
// Everything is kept in this browser (src/account/store.ts); rooms need the game's own server.
import { useEffect, useState } from "react";
import { achievements } from "../account/achievements";
import { NAME_MAX, renameProfile, useProfile } from "../account/store";
import type { EnemySpec } from "../core/types";
import { SettingsPanel } from "../ui/SettingsPanel";
import { Button, installGround, Panel, PebbleHeading } from "../ui/pebble";

export function Account(props: { enemies: readonly EnemySpec[]; onHost: () => void; onJoin: () => void; onBack: () => void }) {
  const profile = useProfile();
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => { installGround(); }, []);
  const feats = achievements(profile, props.enemies);
  return (
    <Panel as="main" ornament className="menu menu--account">
      <PebbleHeading as="h1" text="Account" px={48} tone="ochre" />
      <div className="account">
        <section>
          <h2>Hero</h2>
          <label className="account__name">
            Your name
            <input type="text" value={profile.name} maxLength={NAME_MAX} placeholder="Odysseus" autoComplete="off" spellCheck={false} onChange={(event) => { renameProfile(event.target.value); }} />
          </label>
          <p>{profile.fights} fights, {profile.wins} won. Best score {profile.bestScore}.</p>
          <small>Saved in this browser only. No password.</small>
        </section>
        <section className="account__feats">
          <h2>Achievements {feats.filter((feat) => feat.done).length}/{feats.length}</h2>
          <ul>
            {feats.map((feat) => (
              <li key={feat.id} className={feat.done ? "done" : ""}>
                <b><span aria-hidden="true">{feat.done ? "✓" : "○"}</span> {feat.name}</b>
                <small>{feat.done ? "Done. " : ""}{feat.how}</small>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2>Friends</h2>
          <p>Two fighters, one monster. Strike the same move together to hit twice as hard.</p>
          <div className="menu__row">
            <Button onClick={props.onHost}>Host a room</Button>
            <Button onClick={props.onJoin}>Join a room</Button>
          </div>
        </section>
        <section>
          <h2>Settings</h2>
          <p>Graphics, volume, mirror and key hints.</p>
          <Button onClick={() => { setSettingsOpen(true); }}>Open settings</Button>
        </section>
      </div>
      <Button primary onClick={props.onBack}>Main menu</Button>
      {settingsOpen && <SettingsPanel onClose={() => { setSettingsOpen(false); }} />}
    </Panel>
  );
}
