// The star-chart edge pieces: two health chains with roundel emblems, and the hexagonal score plate.
// Every word and number is HTML text on a solid plate, so it stays the same size whatever the bar's width.
// A lost star flares and goes dark through a CSS animation (see top.css).
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

/** The round emblem at the outer end of a bar, centred on (cx, 34) in a 68-high box. */
function Roundel(props: { cx: number; children: ReactNode }): ReactNode {
  const { cx } = props;
  return (
    <svg className="sk-roundel" viewBox={`${String(cx - 34)} 0 68 68`} aria-hidden="true">
      <circle cx={cx} cy={34} r={34} className="sk-roundel__rim" />
      <circle cx={cx} cy={34} r={30} className="sk-roundel__bed" />
      {props.children}
    </svg>
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

/** Star `i` of the chain is lit while health reaches it. At zero health none is. The monster's chain drains toward the centre. */
export function litStar(i: number, value: number, left: boolean): boolean {
  const at = (left ? i : NODES - 1 - i) / (NODES - 1);
  return value > 0 && at <= value + 1e-9;
}

/** One health chain. `value` is 0 to 1. The player's drains toward the right, the monster's toward the centre (the left). */
export function SkyBar(props: { label: string; value: number; side: "left" | "right"; readout?: string }): ReactNode {
  const { label, side, readout } = props;
  const value = Math.max(0, Math.min(1, props.value));
  const left = side === "left";
  return (
    <div className={`sk-bar sk-bar--${side}`} role="meter" aria-label={`${label} health`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      {left ? <Roundel cx={36}><PlayerMark /></Roundel> : <Roundel cx={524}><EnemyMark /></Roundel>}
      <div className="sk-bar__plate">
        <div className="sk-bar__row">
          <span className="sk-bar__name">{label}</span>
          {readout && <span className="sk-bar__num">{readout}</span>}
        </div>
        <svg className="sk-chain" aria-hidden="true">
          <line x1="0" y1="50%" x2="100%" y2="50%" className="sk-chain__lost" />
          <line x1="0" y1="50%" x2="100%" y2="50%" className={`sk-chain__kept ${left ? "from-left" : "from-right"}`} style={{ transform: `scaleX(${String(value)})` }} />
          {Array.from({ length: NODES }, (_, i) => (
            <circle key={i} cx={`${String((i / (NODES - 1)) * 100)}%`} cy="50%" r={4.6} className={litStar(i, value, left) ? "sk-node" : "sk-node sk-node--off"} />
          ))}
        </svg>
      </div>
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
      {combo > 1 && <span className="sk-combo">x{combo} combo</span>}
    </div>
  );
}
