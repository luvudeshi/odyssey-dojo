// A move drawn as a constellation: stars at the joints, thin lines for limbs, the moving limb brighter with a small arc arrow.
// Built from the same MoveDiagram data (a 100 x 100 box, shoulders at y 32) as the pebble figure.
import type { MoveDiagram } from "../../core/types";

type Pt = readonly [number, number];
const REST_L: Pt = [36, 62];
const REST_R: Pt = [64, 62];
const SHOULDER_L: Pt = [38, 32];
const SHOULDER_R: Pt = [62, 32];
const HIP: Pt = [50, 62];
const LEG_L: readonly [Pt, Pt] = [[42, 80], [40, 96]];
const LEG_R: readonly [Pt, Pt] = [[58, 80], [60, 96]];

const dist = (a: Pt, b: Pt): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
const path = (...p: readonly Pt[]): string => p.map(([x, y]) => `${String(x)},${String(y)}`).join(" ");
const f = (n: number): string => n.toFixed(1);
/** A four-pointed star with concave sides. */
const spark = (x: number, y: number, r: number): string =>
  `M${f(x)},${f(y - r)} Q${f(x)},${f(y)} ${f(x + r)},${f(y)} Q${f(x)},${f(y)} ${f(x)},${f(y + r)} Q${f(x)},${f(y)} ${f(x - r)},${f(y)} Q${f(x)},${f(y)} ${f(x)},${f(y - r)}Z`;

/** A curved arrow that leaves `from` and bends into `to`, with a small head on the end. */
function arcArrow(from: Pt, to: Pt): string {
  const mx = (from[0] + to[0]) / 2, my = (from[1] + to[1]) / 2;
  const dx = to[0] - from[0], dy = to[1] - from[1], len = Math.hypot(dx, dy) || 1;
  const cx = mx - (dy / len) * 9, cy = my + (dx / len) * 9;
  const tl = Math.hypot(to[0] - cx, to[1] - cy) || 1;
  const ux = (to[0] - cx) / tl, uy = (to[1] - cy) / tl;
  const head = (s: number): string => `${f(to[0] - ux * 4 - s * uy * 2.6)},${f(to[1] - uy * 4 + s * ux * 2.6)}`;
  return `M${f(from[0])},${f(from[1])} Q${f(cx)},${f(cy)} ${f(to[0])},${f(to[1])} M${head(1)} L${f(to[0])},${f(to[1])} L${head(-1)}`;
}

export function SkyFigure({ diagram }: { diagram: MoveDiagram }) {
  const dx = diagram.shiftX ?? 0, dy = diagram.shiftY ?? 0;
  const legL: readonly [Pt, Pt] = [diagram.leftKnee ?? LEG_L[0], diagram.leftFoot ?? LEG_L[1]];
  const legR: readonly [Pt, Pt] = [diagram.rightKnee ?? LEG_R[0], diagram.rightFoot ?? LEG_R[1]];
  const kickL = diagram.leftKnee !== undefined || diagram.leftFoot !== undefined;
  const kickR = diagram.rightKnee !== undefined || diagram.rightFoot !== undefined;
  const armL = dist(diagram.leftWrist, REST_L), armR = dist(diagram.rightWrist, REST_R);
  const moveL = armL > 8 && armL >= armR * 0.6, moveR = armR > 8 && armR >= armL * 0.6;
  const hot: readonly Pt[] = [moveL ? diagram.leftWrist : null, moveR ? diagram.rightWrist : null, kickL ? legL[1] : null, kickR ? legR[1] : null].filter((p): p is Pt => p !== null);
  // Sideways moves bend over the head; a ducking or kicking move needs no arrow; the rest bend out of the moving hand.
  const arrow = dx !== 0 ? arcArrow([50 - dx * 0.5, 3], [50 + dx * 1.3, 6]) : dy !== 0 || kickL || kickR ? null : moveR && armR >= armL ? arcArrow(REST_R, diagram.rightWrist) : moveL ? arcArrow(REST_L, diagram.leftWrist) : null;
  const joints: readonly Pt[] = [SHOULDER_L, SHOULDER_R, diagram.leftElbow, diagram.rightElbow, HIP, legL[0], legR[0]];
  return (
    <svg viewBox="0 0 100 100" className="sky-fig sky-stick" aria-hidden="true">
      <g transform={`translate(${String(dx)} ${String(dy)})`}>
        <g className="sky-fig__lines">
          <polyline points={path(SHOULDER_L, SHOULDER_R, HIP, SHOULDER_L)} />
          <polyline points="50,25 50,32" />
          <polyline points={path(HIP, legL[0], legL[1])} className={kickL ? "sky-hot" : undefined} />
          <polyline points={path(HIP, legR[0], legR[1])} className={kickR ? "sky-hot" : undefined} />
          <polyline points={path(SHOULDER_L, diagram.leftElbow, diagram.leftWrist)} className={moveL ? "sky-hot" : undefined} />
          <polyline points={path(SHOULDER_R, diagram.rightElbow, diagram.rightWrist)} className={moveR ? "sky-hot" : undefined} />
        </g>
        <circle cx="50" cy="17" r="8" className="sky-fig__head" />
        <circle cx="50" cy="17" r="2.2" className="sky-fig__eye" />
        {joints.map(([x, y]) => <circle key={`${String(x)},${String(y)}`} cx={x} cy={y} r="2.3" className="sky-fig__star" />)}
        {hot.map(([x, y]) => <path key={`${String(x)},${String(y)}`} d={spark(x, y, 7)} className="sky-fig__flare" />)}
        {arrow && <path d={arrow} className="sky-fig__arrow" />}
      </g>
    </svg>
  );
}
