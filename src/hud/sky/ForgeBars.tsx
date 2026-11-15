// The Forge Fire health bars: health is molten bronze in a carved channel. What was just lost stays red-hot for a moment
// (the hot layer follows the metal down after a delay, see forge.css), and older losses have cooled to dark slag.
// The monster owns the top of the screen; the player's bar is a crescent on the floor under the hero, left of the power ring.
// Every word and number is HTML text, so it stays sharp at any size. Only clip-path, transform and opacity move.
import type { CSSProperties, ReactNode } from "react";
import type { EnemySpec } from "../../core/types";
import { useLandedScore } from "../RatingFlash";
import { roman } from "./SkyBanners";
import "./forge.css";

const SPARKS = 4;
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** The molten channel itself. `value` is 0 to 1 and fills from the left. */
export function Molten({ value, children }: { value: number; children?: ReactNode }): ReactNode {
  const style = { "--kept": String(clamp01(value)) } as CSSProperties;
  return (
    <div className="fg-channel" style={style} aria-hidden="true">
      <div className="fg-slag" />
      <div className="fg-hot" />
      <div className="fg-metal"><div className="fg-flame" /></div>
      <div className="fg-front">
        <i className="fg-glow" />
        {Array.from({ length: SPARKS }, (_, i) => <i key={i} className="fg-spark" />)}
      </div>
      {children}
    </div>
  );
}

/** Where the phase wedges sit: the health share at which each phase after the first starts, and whether it has begun. */
export function phaseMarks(enemy: EnemySpec, phaseIndex: number): { at: number; passed: boolean }[] {
  return (enemy.phases ?? []).slice(1).map((p, i) => ({ at: clamp01(p.belowHp), passed: i + 1 <= phaseIndex }));
}

/** A cast bronze scroll at one end of the boss bar. */
function Cap({ side }: { side: "left" | "right" }): ReactNode {
  return (
    <svg className={`fg-cap fg-cap--${side}`} viewBox="0 0 40 44" aria-hidden="true">
      <path d="M2 8 C14 8 24 14 38 22 C24 30 14 36 2 36 Z" className="fg-bronze" />
      <path d="M8 14 C-2 -4 26 -8 24 6 C22 14 14 10 17 6 M8 30 C-2 48 26 52 24 38 C22 30 14 34 17 38" className="fg-scroll" />
      <circle cx="14" cy="22" r="4" className="fg-stud" />
    </svg>
  );
}

/** The monster's bar across the top: name in cast bronze, percent, phase, and the long molten channel with its wedges. */
export function BossBar({ enemy, value, phaseIndex }: { enemy: EnemySpec; value: number; phaseIndex: number }): ReactNode {
  const v = clamp01(value);
  const pct = Math.round(v * 100);
  const phases = enemy.phases?.length ?? 0;
  return (
    <div className="fg-boss" role="meter" aria-label={`${enemy.name} health`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <div className="fg-boss__row">
        <span className="fg-boss__pct">{pct}%</span>
        <span className="fg-boss__name">{enemy.name}</span>
        <span className="fg-boss__phase">{phases > 1 ? `Phase ${roman(phaseIndex + 1)}` : ""}</span>
      </div>
      <div className="fg-boss__bar">
        <Cap side="left" />
        <Molten value={v}>
          {phaseMarks(enemy, phaseIndex).map((m) => (
            <i key={m.at} className={m.passed ? "fg-wedge fg-wedge--passed" : "fg-wedge"} style={{ left: `${String(m.at * 100)}%` }} />
          ))}
        </Molten>
        <Cap side="right" />
      </div>
    </div>
  );
}

/** Odysseus's crested helmet, front on, for the portrait. */
function Helmet(): ReactNode {
  return (
    <svg className="fg-helmet" viewBox="-30 -42 60 66" aria-hidden="true">
      <path d="M-22 -26 C-22 -44 22 -44 22 -26" className="fg-helmet__crest" />
      <path d="M-19 20 L-19 -8 C-19 -26 -10 -32 0 -32 C10 -32 19 -26 19 -8 L19 20 L9 20 L9 10 L4 6 L4 -2 L-4 -2 L-4 6 L-9 10 L-9 20 Z" className="fg-helmet__shell" />
      <path d="M-15 -6 L-4 -2 L-4 6 M15 -6 L4 -2 L4 6" className="fg-helmet__slit" />
    </svg>
  );
}

// The crescent's geometry, in the 240 x 60 box it is drawn in: the front half of an ellipse lying on the floor.
const CX = 120, CY = 20, RX = 100, RY = 26;
const ARC = `M${String(CX - RX)} ${String(CY)} A${String(RX)} ${String(RY)} 0 0 0 ${String(CX + RX)} ${String(CY)}`;
const SAMPLES: readonly (readonly [number, number])[] = Array.from({ length: 65 }, (_, i): readonly [number, number] => [CX - RX * Math.cos((Math.PI * i) / 64), CY + RY * Math.sin((Math.PI * i) / 64)]);
const RUN: readonly number[] = SAMPLES.reduce<number[]>((acc, p, i) => {
  const q = SAMPLES[i - 1];
  acc.push(q === undefined ? 0 : (acc[i - 1] ?? 0) + Math.hypot(p[0] - q[0], p[1] - q[1]));
  return acc;
}, []);

/** The point `share` (0 to 1) of the way along the crescent by length, from its left tip. */
export function crescentPoint(share: number): [number, number] {
  const want = clamp01(share) * (RUN[RUN.length - 1] ?? 0);
  for (let i = 1; i < SAMPLES.length; i++) {
    const a = SAMPLES[i - 1], b = SAMPLES[i], da = RUN[i - 1], db = RUN[i];
    if (a === undefined || b === undefined || da === undefined || db === undefined) break;
    if (db >= want) {
      const u = db > da ? (want - da) / (db - da) : 0;
      return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
    }
  }
  return [CX + RX, CY];
}

/** One stroke of the crescent. Masked strokes are cut to the kept or hot length by the masks below. */
const Arc = ({ k }: { k: string }): ReactNode => <path d={ARC} pathLength={100} className={`fg-arc fg-arc--${k}`} />;

/**
 * The player's bar: a molten crescent on the floor under the hero's feet, with the helmet, YOU and the number at its
 * left tip. Like the boss bar, the hot layer follows the metal down after a pause, so a fresh loss lingers red-hot.
 */
export function PlayerCrescent({ hp, maxHp }: { hp: number; maxHp: number }): ReactNode {
  const v = clamp01(hp / maxHp);
  const [fx, fy] = crescentPoint(v);
  return (
    <div className="fg-crescent" style={{ "--kept": String(v) } as CSSProperties} role="meter" aria-label="You health" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}>
      <svg className="fg-crescent__arc" viewBox="0 0 240 60" aria-hidden="true">
        <mask id="fg-cres-hot" maskUnits="userSpaceOnUse" x="0" y="0" width="240" height="60"><Arc k="hotmask" /></mask>
        <mask id="fg-cres-kept" maskUnits="userSpaceOnUse" x="0" y="0" width="240" height="60"><Arc k="keptmask" /></mask>
        <Arc k="rim" /><Arc k="lip" /><Arc k="bed" /><Arc k="slag" /><Arc k="crack" />
        <g mask="url(#fg-cres-hot)"><Arc k="hot" /></g>
        <g mask="url(#fg-cres-kept)">
          <Arc k="glow" /><Arc k="outer" /><Arc k="mid" /><Arc k="core" /><Arc k="streak" /><Arc k="shine" /><Arc k="fire" />
        </g>
      </svg>
      <div className="fg-spot" style={{ transform: `translate(${String(fx)}px, ${String(fy)}px)` }}>
        <i className="fg-glow" />
        {Array.from({ length: SPARKS }, (_, i) => <i key={i} className="fg-spark" />)}
      </div>
      <div className="fg-tag">
        <span className="fg-tag__name">You</span>
        <span className="fg-tag__num">{Math.round(hp)}<small>/{maxHp}</small></span>
        <div className="fg-medal"><Helmet /></div>
      </div>
    </div>
  );
}

/** Score at the top right in molten figures, the combo stamped on a struck coin when there is one. */
export function ForgeScore({ score, combo }: { score: number; combo: number }): ReactNode {
  const shown = useLandedScore(score);
  return (
    <div className="fg-score">
      <div className="fg-score__text">
        <small>Score</small>
        <span className="fg-score__num">{shown}</span>
      </div>
      {combo > 1 && <span className="fg-coin"><b>x{combo}</b><small>combo</small></span>}
    </div>
  );
}
