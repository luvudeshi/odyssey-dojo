// Sea chart of Odysseus's route home. The stops come from the enemy registry; ones with no 3D model yet are locked.
import type { EnemySpec } from "../core/types";
import { Button, Panel, PebbleHeading } from "../ui/pebble";
import { Isle } from "./Isle";

const W = 1000;
const H = 420;

type Point = readonly [number, number];

/** Points along a wandering line from Troy (first) to Ithaca (last), one between for each stop. */
export function routePoints(stops: number): readonly Point[] {
  const total = stops + 2;
  return Array.from({ length: total }, (_, i): Point => [
    70 + (i * (W - 140)) / (total - 1),
    H / 2 + Math.sin(i * 1.7) * 105,
  ]);
}

/** One row of sea waves across the chart, shifted by `dx` so the rows do not line up. */
function wave(y: number, dx: number): string {
  return `M${String(dx - 30)} ${String(y)} q15 -9 30 0${" t30 0".repeat(36)}`;
}

function pathThrough(points: readonly Point[]): string {
  const [first, ...rest] = points;
  if (!first) return "";
  const curves = rest.map(([x, y], i) => {
    const [px, py] = points[i] ?? first;
    return `Q ${String((px + x) / 2)} ${String((py + y) / 2 + (i % 2 === 0 ? -60 : 60))} ${String(x)} ${String(y)}`;
  });
  return `M ${String(first[0])} ${String(first[1])} ${curves.join(" ")}`;
}

export function QuestMap(props: {
  enemies: readonly EnemySpec[];
  cleared: readonly string[];
  open: (index: number) => boolean;
  onEnter: (index: number) => void;
  onStyle: () => void;
  onMenu: () => void;
}) {
  const { enemies, cleared } = props;
  const points = routePoints(enemies.length);
  const pos = (i: number): Point => points[i] ?? [0, 0];
  const at = (p: Point) => ({ left: `${String(p[0] / 10)}%`, top: `${String((p[1] / H) * 100)}%` });
  // Every stop won: the journey is done and Ithaca is lit.
  const home = enemies.length > 0 && enemies.every((enemy) => cleared.includes(enemy.id));
  const lit = home ? { fill: "var(--pb-ochre-light)", stroke: "var(--pb-cream)", filter: "drop-shadow(0 0 10px var(--pb-ochre-light))" } : undefined;
  return (
    <Panel as="main" ornament className="menu menu--map">
      <PebbleHeading as="h1" text="The Road Home" px={60} tone="ochre" />
      <p>{home ? "The journey is done. Odysseus is home in Ithaca." : "Choose your next stop on the sea. The fight starts as soon as you pick one."}</p>
      <div className="chart">
        <svg viewBox={`0 0 ${String(W)} ${String(H)}`} aria-hidden="true">
          {[62, 150, 238, 326, 392].map((y, i) => <path key={y} className="wave" d={wave(y, i % 2 === 0 ? 0 : 15)} />)}
          <path className="route" d={pathThrough(points)} />
          {[0, points.length - 1].map((i) => (
            <circle key={i} className="harbour" cx={pos(i)[0]} cy={pos(i)[1]} r={home && i > 0 ? "17" : "12"} style={i > 0 ? lit : undefined} />
          ))}
        </svg>
        <span className="port" style={at(pos(0))}>Troy</span>
        <span className="port" style={home ? { ...at(pos(points.length - 1)), color: "var(--pb-ochre-light)" } : at(pos(points.length - 1))}>Ithaca</span>
        {enemies.map((enemy, i) => {
          const open = props.open(i);
          const state = cleared.includes(enemy.id) ? "cleared" : open ? "open" : "locked";
          return (
            <button
              key={enemy.id}
              className={`stop ${state} ${pos(i + 1)[1] < H * 0.48 ? "above" : "below"}`}
              style={at(pos(i + 1))}
              title={enemy.place}
              disabled={!open}
              onClick={() => { props.onEnter(i); }}
            >
              <span className="dot"><Isle state={state} /><b>{state === "cleared" ? "✓" : i + 1}</b></span>
              <span className="lbl">
                {enemy.name}
                {/* Short lines, so neighbouring labels fit side by side on one line each. */}
                <small>{state === "locked" ? "Ahead" : enemy.book ? `Book ${String(enemy.book)}` : ""}</small>
              </span>
            </button>
          );
        })}
      </div>
      <div className="menu__row">
        <Button onClick={props.onStyle}>Change style</Button>
        <Button onClick={props.onMenu}>Main menu</Button>
      </div>
    </Panel>
  );
}
