// The star-chart edge pieces: two health chains with roundel emblems, the hexagonal score plate and the power chip.
// Plain SVG and CSS only. A lost star flares and goes dark through a CSS animation (see top.css).
import type { ReactNode } from "react";

const NODES = 12;

/** The tracker's joints as a tiny constellation (a 140 x 130 box), the same figure the mockup draws. */
const FIGHTER = { h: [100, 38], ls: [90, 62], rs: [112, 60], le: [80, 88], lw: [100, 74], re: [140, 58], rw: [166, 56], lh: [92, 112], rh: [108, 112], lk: [78, 140], la: [62, 170], rk: [128, 140], ra: [140, 170] } as const;
type Joint = keyof typeof FIGHTER;
const BONES: readonly (readonly [Joint, Joint])[] = [
  ["ls", "rs"], ["ls", "le"], ["le", "lw"], ["rs", "re"], ["re", "rw"], ["ls", "lh"], ["rs", "rh"], ["lh", "rh"], ["lh", "lk"], ["lk", "la"], ["rh", "rk"], ["rk", "ra"],
];
const JOINTS = (Object.keys(FIGHTER) as Joint[]).filter((k) => k !== "h" && k !== "rw");
const SPARK = "M0,-1 C0.13,-0.13 0.13,-0.13 1,0 C0.13,0.13 0.13,0.13 0,1 C-0.13,0.13 -0.13,0.13 -1,0 C-0.13,-0.13 -0.13,-0.13 0,-1Z";

function Spark(props: { x: number; y: number; s: number }): ReactNode {
  return <path d={SPARK} transform={`translate(${String(props.x)} ${String(props.y)}) scale(${String(props.s)})`} className="sk-star" />;
}

/** A six-sided plate with pointed ends. */
function plate(w: number, h: number): string {
  const p = h / 2;
  return `M${String(p)},0 H${String(w - p)} L${String(w)},${String(h / 2)} L${String(w - p)},${String(h)} H${String(p)} L0,${String(h / 2)}Z`;
}

function Roundel(props: { cx: number; children: ReactNode }): ReactNode {
  const { cx } = props;
  return (
    <g>
      <circle cx={cx} cy={34} r={34} className="sk-roundel__rim" />
      <circle cx={cx} cy={34} r={30} className="sk-roundel__bed" />
      {Array.from({ length: 18 }, (_, i) => (
        <circle key={i} cx={cx + 32 * Math.cos((i / 18) * Math.PI * 2)} cy={34 + 32 * Math.sin((i / 18) * Math.PI * 2)} r={1.2} className="sk-roundel__bed" />
      ))}
      {props.children}
    </g>
  );
}

function PlayerMark(): ReactNode {
  return (
    <g transform="translate(6.7 5.5) scale(0.33)">
      <g className="sk-fig">{BONES.map(([a, b]) => <line key={a + b} x1={FIGHTER[a][0]} y1={FIGHTER[a][1]} x2={FIGHTER[b][0]} y2={FIGHTER[b][1]} />)}</g>
      <circle cx={FIGHTER.h[0]} cy={FIGHTER.h[1]} r={18} className="sk-fig__head" />
      <circle cx={FIGHTER.h[0]} cy={FIGHTER.h[1]} r={6.5} className="sk-fig__eye" />
      {JOINTS.map((k) => <circle key={k} cx={FIGHTER[k][0]} cy={FIGHTER[k][1]} r={7} className="sk-fig__dot" />)}
      <Spark x={FIGHTER.rw[0]} y={FIGHTER.rw[1]} s={30} />
    </g>
  );
}

function EnemyMark(): ReactNode {
  return (
    <g>
      {Array.from({ length: 7 }, (_, i) => <circle key={i} cx={524 + 17 * Math.cos((i / 7) * Math.PI * 2)} cy={34 + 17 * Math.sin((i / 7) * Math.PI * 2)} r={3.2} className="sk-fig__dot" />)}
      <circle cx={524} cy={34} r={17} className="sk-fig__ring" />
      <Spark x={524} y={34} s={10.5} />
    </g>
  );
}

/** One health chain. `value` is 0 to 1. The player's drains toward the right, the monster's toward the centre (the left). */
export function SkyBar(props: { label: string; value: number; side: "left" | "right"; readout?: string }): ReactNode {
  const { label, side, readout } = props;
  const value = Math.max(0, Math.min(1, props.value));
  const left = side === "left";
  const x0 = left ? 96 : 38, x1 = left ? 522 : 464, step = (x1 - x0) / (NODES - 1);
  const reach = (x1 - x0) * value;
  return (
    <div className={`sk-bar sk-bar--${side}`} role="meter" aria-label={`${label} health`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <svg viewBox="0 0 560 80" aria-hidden="true">
        <g transform={`translate(${left ? "52" : "8"} 6)`}><path d={plate(500, 56)} className="sk-plate" /></g>
        <text x={left ? 96 : 464} y={29} textAnchor={left ? "start" : "end"} className="sk-label">{label}</text>
        {readout && <text x={502} y={29} textAnchor="end" className="sk-label sk-label--num">{readout}</text>}
        <line x1={x0} y1={44} x2={x1} y2={44} className="sk-chain__lost" />
        <line x1={x0} y1={44} x2={x1} y2={44} className={`sk-chain__kept ${left ? "from-left" : "from-right"}`} style={{ transform: `scaleX(${String(value)})` }} />
        {Array.from({ length: NODES }, (_, i) => {
          const at = i * step;
          const lit = left ? at <= reach + 0.5 : at >= x1 - x0 - reach - 0.5;
          return <circle key={i} cx={x0 + at} cy={44} r={4.6} className={lit ? "sk-node" : "sk-node sk-node--off"} />;
        })}
        {left ? <Roundel cx={36}><PlayerMark /></Roundel> : <Roundel cx={524}><EnemyMark /></Roundel>}
      </svg>
    </div>
  );
}

/** The hexagonal score plate, centre top, with the combo under it when there is one. */
export function SkyScore({ score, combo }: { score: number; combo: number }): ReactNode {
  return (
    <div className="sk-score">
      <div className="sk-score__plate">
        <svg viewBox="0 0 190 58" aria-hidden="true"><path d={plate(190, 58)} className="sk-plate" /></svg>
        <span className="sk-score__num">{score}</span>
      </div>
      {combo > 1 && (
        <span className="sk-combo">
          <svg viewBox="0 0 46 14" width="46" height="14" aria-hidden="true"><Spark x={7} y={7} s={6.5} /><Spark x={23} y={7} s={6.5} /><Spark x={39} y={7} s={6.5} /></svg>
          x{combo} combo
        </span>
      )}
    </div>
  );
}

function Moon({ f }: { f: number }): ReactNode {
  const r = 12, cx = 30, cy = 19, rx = Math.abs(1 - 2 * f) * r;
  const lit = f >= 1 ? <circle cx={cx} cy={cy} r={r} className="sk-moon__lit" /> : (
    <path d={`M${String(cx)},${String(cy - r)} A${String(r)},${String(r)} 0 0 1 ${String(cx)},${String(cy + r)} A${String(rx)},${String(r)} 0 0 ${f > 0.5 ? "1" : "0"} ${String(cx)},${String(cy - r)}Z`} className="sk-moon__lit" />
  );
  return (
    <>
      {f >= 1 && <circle cx={cx} cy={cy} r={r + 7} className="sk-moon__halo" />}
      <circle cx={cx} cy={cy} r={r} className="sk-moon__disc" />
      {lit}
    </>
  );
}

/** The divine power chip. Hidden until the meter has started to fill, as the pebble bar is. */
export function SkyPower({ power }: { power: number }): ReactNode {
  if (power <= 0) return null;
  const f = Math.min(1, power);
  const full = f >= 1;
  return (
    <div className={`sk-power${full ? " is-full" : ""}`} role="meter" aria-label="Divine power" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(f * 100)}>
      <svg viewBox="0 0 196 38" aria-hidden="true">
        <path d={plate(196, 38)} className="sk-plate sk-power__plate" />
        <Moon f={f} />
        <text x={52} y={24} className="sk-label sk-label--sm">Power</text>
        <text x={174} y={24} textAnchor="end" className="sk-label sk-label--sm sk-label--star">{full ? "READY" : `${String(Math.round(f * 100))}%`}</text>
      </svg>
    </div>
  );
}
