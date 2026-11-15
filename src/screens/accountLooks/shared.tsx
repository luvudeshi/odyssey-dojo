// Draft round two of the Account screen: the parts every direction shares. Each direction is a whole scene drawn on a
// 1440 x 800 stage that scales to fit the window, so a scene is composed once and holds at every size.
import { type CSSProperties, type ReactNode, useEffect, useState } from "react";
import type { Achievement } from "../../account/achievements";
import { NAME_MAX, type Profile, renameProfile } from "../../account/store";
import { Icon, type IconName } from "../../account/ui/icons";
import "./shared.css";

export interface LookProps {
  readonly profile: Profile;
  readonly feats: readonly Achievement[];
  readonly onBack: () => void;
  readonly onSettings: () => void;
}

export interface Group { readonly key: string; readonly title: string; readonly feats: readonly Achievement[] }

const GROUP_OF: Readonly<Record<string, string>> = {
  favoured: "arms", unbroken: "arms", chain: "arms", student: "arms", second_nature: "arms",
  song: "labours", ages: "labours", olympus: "labours", shield_wall: "labours", light_footed: "labours", many_ways: "labours", veteran: "labours",
  pupil: "dojo", pride: "dojo", shoulder: "dojo",
};
const TITLES: readonly (readonly [string, string])[] = [["road", "The road home"], ["arms", "Feats of arms"], ["labours", "Long labours"], ["dojo", "Dojo and rooms"]];

/** The deeds in four groups: the road home (first blood, the six stops and Ithaca), feats of arms, long labours, dojo and rooms. */
export function groupFeats(feats: readonly Achievement[]): readonly Group[] {
  return TITLES.map(([key, title]) => ({ key, title, feats: feats.filter((feat) => (GROUP_OF[feat.id] ?? "road") === key) }));
}

export const won = (feats: readonly Achievement[]): number => feats.filter((feat) => feat.done).length;

const scale = (): number => Math.min(window.innerWidth / 1440, window.innerHeight / 800);

/** The fixed 1440 x 800 stage, centred and scaled to fit; the root behind it carries the scene's colour to the edges. */
export function Stage(props: { look: string; children: ReactNode }) {
  const [k, setK] = useState(scale);
  useEffect(() => {
    const on = (): void => { setK(scale()); };
    window.addEventListener("resize", on);
    return () => { window.removeEventListener("resize", on); };
  }, []);
  return (
    <main className={`menu--account acx acx--${props.look}`}>
      <div className="acx__stage" style={{ "--k": k } as CSSProperties}>{props.children}</div>
    </main>
  );
}

/** Hover or focus picks a deed to read; with none picked, the next deed not yet won is shown. */
export function useActive(feats: readonly Achievement[]) {
  const [id, setId] = useState<string | null>(null);
  const picked = feats.find((feat) => feat.id === id);
  const next = feats.find((feat) => !feat.done);
  const shown = picked ?? next ?? feats[0];
  const bind = (feat: Achievement) => ({
    onMouseEnter: () => { setId(feat.id); },
    onMouseLeave: () => { setId(null); },
    onFocus: () => { setId(feat.id); },
    onBlur: () => { setId(null); },
    "aria-label": `${feat.name}. ${feat.done ? "Won" : "Not won yet"}. ${feat.how}`,
  });
  return { shown, picked: picked !== undefined, activeId: id, bind };
}

export function NameField(props: { name: string; className?: string; placeholder?: string }) {
  return (
    <label className={`acx-name ${props.className ?? ""}`}>
      <span className="acx-name__label">Your name</span>
      <input type="text" value={props.name} maxLength={NAME_MAX} placeholder={props.placeholder ?? "Odysseus"} autoComplete="off" spellCheck={false}
        onChange={(event) => { renameProfile(event.target.value); }} />
    </label>
  );
}

export function Stats(props: { profile: Profile; className?: string }) {
  const rows: readonly (readonly [IconName, number, string])[] = [["fights", props.profile.fights, "Fights"], ["laurel", props.profile.wins, "Won"], ["star", props.profile.bestScore, "Best score"]];
  return (
    <dl className={`acx-stats ${props.className ?? ""}`}>
      {rows.map(([icon, value, label]) => (
        <div key={label} className="acx-stats__one"><Icon name={icon} className="acx-stats__icon" /><dd>{value}</dd><dt>{label}</dt></div>
      ))}
    </dl>
  );
}

/** A deed read out in full: whether it is won, its name, how to earn it, and how far along a counted one is. */
export function Detail(props: { feat: Achievement | undefined; picked: boolean; className?: string }) {
  const { feat } = props;
  if (!feat) return null;
  const tag = feat.done ? "Won" : props.picked ? "Not won yet" : "Next deed";
  return (
    <div className={`acx-detail ${feat.done ? "is-done" : "is-locked"} ${props.className ?? ""}`} aria-live="polite">
      <span className="acx-detail__tag">{tag}</span>
      <b className="acx-detail__name">{feat.name}</b>
      <span className="acx-detail__how">{feat.how}</span>
      {feat.progress && !feat.done && <Progress feat={feat} />}
    </div>
  );
}

export function Progress(props: { feat: Achievement; className?: string }) {
  const { progress } = props.feat;
  if (!progress) return null;
  return (
    <span className={`acx-progress ${props.className ?? ""}`} role="img" aria-label={`${String(progress.have)} of ${String(progress.goal)} ${progress.unit}`}>
      <span className="acx-progress__bar"><i style={{ width: `${String(Math.round((progress.have / progress.goal) * 100))}%` }} /></span>
      <span className="acx-progress__num">{progress.have}/{progress.goal}</span>
    </span>
  );
}

export function WithIcon(props: { icon: IconName; children: string }) {
  return <><Icon name={props.icon} className="acx-btn__icon" />{props.children}</>;
}
