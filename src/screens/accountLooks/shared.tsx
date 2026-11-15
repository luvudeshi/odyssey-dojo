// Parts shared by the three draft looks of the Account screen (delete this folder with the two looks not picked).
import { type CSSProperties, useEffect, useState } from "react";
import type { Achievement } from "../../account/achievements";
import { NAME_MAX, type Profile, renameProfile } from "../../account/store";
import { FEAT_ICON, Icon, type IconName } from "../../account/ui/icons";

export interface LookProps {
  profile: Profile;
  feats: readonly Achievement[];
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  onSettings: () => void;
  onBack: () => void;
}

const GROUP_OF: Readonly<Record<string, string>> = {
  favoured: "arms", unbroken: "arms", chain: "arms", student: "arms", second_nature: "arms",
  song: "labours", ages: "labours", olympus: "labours", shield_wall: "labours", light_footed: "labours", many_ways: "labours", veteran: "labours",
  pupil: "dojo", pride: "dojo", shoulder: "dojo",
};
export const GROUPS = [["road", "The road home"], ["dojo", "Dojo and rooms"], ["arms", "Feats of arms"], ["labours", "Long labours"]] as const;

export function groupsOf(feats: readonly Achievement[]): readonly { key: string; title: string; feats: readonly Achievement[] }[] {
  return GROUPS.map(([key, title]) => ({ key, title, feats: feats.filter((feat) => (GROUP_OF[feat.id] ?? "road") === key) }));
}

export interface Stage { k: number; w: number; h: number }
const measure = (): Stage => {
  const k = Math.min(window.innerWidth / 1440, window.innerHeight / 800);
  return { k, w: window.innerWidth / k, h: window.innerHeight / k };
};
/** A 1440 x 800 core, centred and scaled to fill the window; the background fills what is left over. */
export function useStage(): { stage: Stage; coreStyle: CSSProperties; stageStyle: CSSProperties } {
  const [stage, setStage] = useState(measure);
  useEffect(() => {
    const on = (): void => { setStage(measure()); };
    window.addEventListener("resize", on);
    return () => { window.removeEventListener("resize", on); };
  }, []);
  return {
    stage,
    stageStyle: { width: stage.w, height: stage.h, transform: `scale(${String(stage.k)})` },
    coreStyle: { left: (stage.w - 1440) / 2, top: (stage.h - 800) / 2 },
  };
}

export const iconOf = (feat: Achievement): IconName => FEAT_ICON[feat.id] ?? "laurel";
export const pct = (feat: Achievement): number => (feat.progress ? Math.round((feat.progress.have / feat.progress.goal) * 100) : 0);
const namePx = (name: string, max: number, room: number): number => Math.round(Math.max(20, Math.min(max, room / (Math.max(name.length, 1) * 0.6))));

export function NameField(props: { name: string; max: number; room: number }) {
  return (
    <label className="lk-name">
      <span>Your name</span>
      <input type="text" value={props.name} style={{ "--name-px": `${String(namePx(props.name, props.max, props.room))}px` } as CSSProperties} maxLength={NAME_MAX} placeholder="Odysseus" autoComplete="off" spellCheck={false} onChange={(event) => { renameProfile(event.target.value); }} />
    </label>
  );
}

export function Stats(props: { profile: Profile }) {
  const { profile } = props;
  const rows: readonly (readonly [IconName, number, string])[] = [["fights", profile.fights, "Fights"], ["laurel", profile.wins, "Won"], ["star", profile.bestScore, "Best score"]];
  return <dl className="lk-stats">{rows.map(([icon, value, label]) => <div key={label}><Icon name={icon} className="lk-stats__icon" /><dd>{value}</dd><dt>{label}</dt></div>)}</dl>;
}

/** The deed being read: hovered or focused, else the next not yet won. */
export function Detail(props: { feat: Achievement | undefined; picked: boolean; doneText: string }) {
  const { feat } = props;
  if (!feat) return <div className="lk-detail is-done" aria-live="polite"><b className="lk-detail__name">{props.doneText}</b><span className="lk-detail__how">Every deed is yours. Ithaca is home.</span></div>;
  const p = feat.progress;
  return (
    <div className={`lk-detail ${feat.done ? "is-done" : "is-locked"}`} aria-live="polite">
      <span className="lk-detail__tag">{feat.done ? "Won" : props.picked ? "Not won yet" : "Next deed"}</span>
      <b className="lk-detail__name">{feat.name}</b>
      <span className="lk-detail__how">{feat.how}</span>
      {p && !feat.done && (
        <span className="lk-detail__progress" role="img" aria-label={`${String(p.have)} of ${String(p.goal)} ${p.unit}`}>
          <span className="lk-detail__bar"><i style={{ width: `${String(pct(feat))}%` }} /></span>
          <span>{p.have}/{p.goal} {p.unit}</span>
        </span>
      )}
    </div>
  );
}

export function aria(feat: Achievement): string {
  const p = feat.progress;
  return `${feat.name}. ${feat.done ? "Won" : "Not won yet"}. ${feat.how}${p && !feat.done ? ` ${String(p.have)} of ${String(p.goal)} ${p.unit}.` : ""}`;
}

export const hoverEvents = (set: (id: string | null) => void, id: string) => ({
  onMouseEnter: () => { set(id); }, onMouseLeave: () => { set(null); }, onFocus: () => { set(id); }, onBlur: () => { set(null); },
});
