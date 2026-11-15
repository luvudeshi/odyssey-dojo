// The Obsidian Rift health bars: health is lava welling up through a jagged fissure in black volcanic glass. What was
// just lost stays red-hot for a moment (the hot layer follows the melt down after a delay, see rift.css), and older
// losses have cooled to dark slag. The monster's bar is a glass slab across the top with glass blades at its ends;
// the player's is a glass sickle on the floor under the hero, left of the power disc.
// Frame-rate rules: the glass, cracks and fissure edge are fixed shapes computed once (rift/geometry.ts); the melt is a
// texture painted once (rift/lava.ts). A health change moves only clip-path, a mask offset or a transform; the drift
// and sparks loop on transform and opacity. Every word and number is HTML text.
import type { CSSProperties, ReactNode } from "react";
import type { EnemySpec } from "../../core/types";
import { useLandedScore } from "../RatingFlash";
import { CRES, CRESCENT, END_BLADES, FISSURE, SLAB } from "./rift/geometry";
import { installRiftTextures, riftTextures } from "./rift/lava";
import { roman } from "./SkyBanners";
import "./rift.css";

if (typeof document !== "undefined") installRiftTextures();

const SPARKS = 6;
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const kept = (v: number): CSSProperties => ({ "--kept": String(v) }) as CSSProperties;

/** Where the phase spikes sit: the health share at which each phase after the first starts, and whether it has begun. */
export function phaseMarks(enemy: EnemySpec, phaseIndex: number): { at: number; passed: boolean }[] {
  return (enemy.phases ?? []).slice(1).map((p, i) => ({ at: clamp01(p.belowHp), passed: i + 1 <= phaseIndex }));
}

const Sparks = (): ReactNode => <>{Array.from({ length: SPARKS }, (_, i) => <i key={i} className="fg-spark" />)}</>;

/** Hot cracks spreading from the fissure into the glass, as glow plus a bright core line. */
const Cracks = ({ d }: { d: string }): ReactNode => (
  <>
    <path d={d} className="fg-crack fg-crack--glow" vectorEffect="non-scaling-stroke" />
    <path d={d} className="fg-crack" vectorEffect="non-scaling-stroke" />
  </>
);

/** Three glass blades fanning out from one end of the boss bar. */
function Ends({ side }: { side: "left" | "right" }): ReactNode {
  return (
    <svg className={`fg-ends fg-ends--${side}`} viewBox="0 0 130 60" aria-hidden="true">
      {END_BLADES.map((b) => (
        <g key={b.body}>
          <path d={b.body} className="fg-blade" />
          <path d={b.light} className="fg-blade__light" />
          <path d={b.edge} className="fg-blade__edge" />
          <path d={b.vein} className="fg-vein fg-vein--glow" />
          <path d={b.vein} className="fg-vein" />
        </g>
      ))}
    </svg>
  );
}

/** The monster's bar across the top: name in ember letters, percent, phase, and the long rift with its phase spikes. */
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
      <div className="fg-boss__bar" style={kept(v)}>
        <svg className="fg-defs" width="0" height="0" aria-hidden="true">
          <clipPath id="fg-rift-fissure" clipPathUnits="objectBoundingBox"><path d={FISSURE} transform="scale(0.001)" /></clipPath>
        </svg>
        <Ends side="left" />
        <div className="fg-slab">
          <svg className="fg-slab__glass" viewBox="0 0 1000 56" preserveAspectRatio="none" aria-hidden="true">
            <path d={SLAB.outline} className="fg-slab__shade" />
            {SLAB.facets.map((f) => <path key={f.d} d={f.d} fill={f.fill} />)}
            <path d={SLAB.top} className="fg-slab__edge" vectorEffect="non-scaling-stroke" />
            <path d={SLAB.bottom} className="fg-slab__under" vectorEffect="non-scaling-stroke" />
          </svg>
          <svg className="fg-slab__cracks" viewBox="0 0 1000 56" preserveAspectRatio="none" aria-hidden="true"><Cracks d={SLAB.cracksUp + SLAB.cracksDown} /></svg>
          <div className="fg-channel" aria-hidden="true">
            <div className="fg-fissure">
              <div className="fg-slag" />
              <div className="fg-hot"><div className="fg-flow" /></div>
              <div className="fg-metal"><div className="fg-flow" /></div>
            </div>
            <div className="fg-front"><i className="fg-glow" /><Sparks /></div>
          </div>
          {phaseMarks(enemy, phaseIndex).map((m) => (
            <i key={m.at} className={m.passed ? "fg-wedge fg-wedge--passed" : "fg-wedge"} style={{ left: `${String(m.at * 100)}%` }} />
          ))}
        </div>
        <Ends side="right" />
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

// The crescent's centre line: the front half of an ellipse lying on the floor, in the 240 x 60 box it is drawn in.
const { cx: CX, cy: CY, rx: RX, ry: RY } = CRES;
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
 * The player's bar: a glass sickle on the floor under the hero's feet with lava in its fissure, and the helmet, YOU and
 * the number at its left tip. Like the boss bar, the hot layer follows the melt down after a pause.
 */
export function PlayerCrescent({ hp, maxHp }: { hp: number; maxHp: number }): ReactNode {
  const v = clamp01(hp / maxHp);
  const [fx, fy] = crescentPoint(v);
  const tex = riftTextures();
  return (
    <div className="fg-crescent" style={kept(v)} role="meter" aria-label="You health" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}>
      <svg className="fg-crescent__arc" viewBox="0 0 240 60" aria-hidden="true">
        <defs>
          <mask id="fg-cres-hot" maskUnits="userSpaceOnUse" x="-20" y="-20" width="280" height="100"><Arc k="hotmask" /></mask>
          <mask id="fg-cres-kept" maskUnits="userSpaceOnUse" x="-20" y="-20" width="280" height="100"><Arc k="keptmask" /></mask>
          <radialGradient id="fg-cres-shade"><stop offset=".55" stopColor="#000" stopOpacity=".5" /><stop offset="1" stopColor="#000" stopOpacity="0" /></radialGradient>
          <clipPath id="fg-cres-fissure"><path d={CRESCENT.fissure} /></clipPath>
          <pattern id="fg-cres-lava" patternUnits="userSpaceOnUse" width="128" height="12" y="14"><image href={tex.lava} width="128" height="12" preserveAspectRatio="none" /></pattern>
          <pattern id="fg-cres-hottex" patternUnits="userSpaceOnUse" width="128" height="12" y="14"><image href={tex.hot} width="128" height="12" preserveAspectRatio="none" /></pattern>
        </defs>
        <ellipse cx="120" cy="32" rx="132" ry="36" fill="url(#fg-cres-shade)" />
        {CRESCENT.facets.map((f) => <path key={f.d} d={f.d} fill={f.fill} />)}
        <path d={CRESCENT.edge} className="fg-slab__edge" />
        <g mask="url(#fg-cres-kept)"><Arc k="glow" /><Cracks d={CRESCENT.cracks} /></g>
        <g clipPath="url(#fg-cres-fissure)">
          <Arc k="bed" /><Arc k="slag" />
          <g mask="url(#fg-cres-hot)"><Arc k="hot" /></g>
          <g mask="url(#fg-cres-kept)"><Arc k="outer" /><Arc k="lava" /><Arc k="core" /><Arc k="vein" /><Arc k="crust" /></g>
        </g>
        <g mask="url(#fg-cres-kept)"><Arc k="fire" /></g>
      </svg>
      <div className="fg-spot" style={{ transform: `translate(${String(fx)}px, ${String(fy)}px)` }}>
        <i className="fg-glow" />
        <Sparks />
      </div>
      <div className="fg-tag">
        <span className="fg-tag__name">You</span>
        <span className="fg-tag__num">{Math.round(hp)}<small>/{maxHp}</small></span>
        <div className="fg-medal"><Helmet /></div>
      </div>
    </div>
  );
}

/** Score at the top right burning in a glass shard; the combo glows in a burst of glass spikes, which pops on each rise. */
export function ForgeScore({ score, combo }: { score: number; combo: number }): ReactNode {
  const shown = useLandedScore(score);
  return (
    <div className="fg-score">
      <div className="fg-score__text">
        <small>Score</small>
        <span className="fg-score__num" data-n={shown}>{shown}</span>
      </div>
      {combo > 1 && <span key={combo} className="fg-coin"><b>x{combo}</b><small>combo</small></span>}
    </div>
  );
}
