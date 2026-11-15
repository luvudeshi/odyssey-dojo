// The quest map: the road home as one painted storm sea (pano.jpg) filling the screen. Each stop is a round painted medallion
// in a bronze shield rim, sitting on its island, with a bronze name plate; a gold wake runs from Troy past each stop to Ithaca's
// harbour, with the galley on the leg ahead. A won stop wears a laurel and a check, the next stop is larger and glows. The stops
// come from the enemy registry; ones with no 3D model yet are locked and sit under dark cloud.
import type { CSSProperties } from "react";
import type { EnemySpec } from "../core/types";
import { Button, Panel } from "../ui/pebble";
import { BronzeDefs, GALLEY } from "./menuShields";
import "./menuScene.css";
import "./questMap.css";

const W = 1600, H = 900;
export type Point = readonly [number, number];
export type Box = readonly [number, number, number, number];

/** Where Troy, each stop and Ithaca's harbour sit on the 1600 x 900 scene: each stop on its island in pano.jpg. */
const TROY_AT: Point = [112, 600];
const STOP_SLOTS: readonly Point[] = [[300, 412], [599, 518], [452, 352], [1016, 356], [1089, 667], [1384, 452]];
const HARBOUR_AT: Point = [1540, 520];
// Medallion diameters on the scene: a stop, the next stop, and Troy.
const STOP = 100, NEXT = 120, TROY = 88;

/** The course on the 1600 x 900 scene: Troy, each stop, then Ithaca's harbour. */
export function routePoints(stops: number): readonly Point[] {
  const slot = (i: number): Point => STOP_SLOTS[i] ?? [200 + ((i * 220) % 1200), 520];
  return [TROY_AT, ...Array.from({ length: stops }, (_, i): Point => slot(i)), HARBOUR_AT];
}

/** Catmull-Rom through the points, as one cubic per leg: start, two controls, end. */
function legs(p: readonly Point[]): (readonly [Point, Point, Point, Point])[] {
  return p.slice(0, -1).map((a, i) => {
    const b = p[i + 1] ?? a, z = p[i - 1] ?? a, n = p[i + 2] ?? b;
    return [a, [a[0] + (b[0] - z[0]) / 6, a[1] + (b[1] - z[1]) / 6], [b[0] - (n[0] - a[0]) / 6, b[1] - (n[1] - a[1]) / 6], b] as const;
  });
}

const at = (leg: readonly [Point, Point, Point, Point], t: number): Point => {
  const u = 1 - t, k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t] as const;
  return [leg.reduce((s, p, i) => s + p[0] * (k[i] ?? 0), 0), leg.reduce((s, p, i) => s + p[1] * (k[i] ?? 0), 0)];
};

const overlap = (a: Box, b: Box): number =>
  Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));

/** Where the ship sits on a leg: on the course or just off it, as near the middle as it can be while covering as little
 * of a place or a name as possible. The ship's box runs from its masthead to the waves under its keel. */
export function shipSpot(leg: readonly [Point, Point, Point, Point], keepOut: readonly Box[]): Point {
  const [a, , , b] = leg, len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
  let best: Point = at(leg, 0.5), least = Infinity;
  for (const off of [0, 50, -50, 100, -100]) {
    for (const t of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) {
      const [cx, cy] = at(leg, t), x = cx + nx * off, y = cy + ny * off;
      const covered = keepOut.reduce((sum, box) => sum + overlap([x - 44, y - 58, 88, 80], box), 0);
      if (covered < least) { least = covered; best = [x, y]; }
      if (covered === 0) return best;
    }
  }
  return best;
}

/** A wreath of laurel leaves round a circle, drawn in a 100 x 100 box. */
function Laurel() {
  const leaves = [1, -1].flatMap((side) => Array.from({ length: 10 }, (_, k) => {
    const a = ((78 + k * 17) * Math.PI) / 180, x = 50 + side * 44 * Math.cos(a), y = 50 + 44 * Math.sin(a);
    return { key: `${String(side)}${String(k)}`, x, y, deg: side * ((a * 180) / Math.PI) + (side === 1 ? 90 : -90) };
  }));
  return (
    <svg className="qm-laurel" viewBox="0 0 100 100" aria-hidden="true">
      {leaves.map((l) => <ellipse key={l.key} cx={l.x} cy={l.y} rx="8" ry="3.3" transform={`rotate(${String(l.deg)} ${String(l.x)} ${String(l.y)})`} />)}
    </svg>
  );
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
  // Every stop won: the journey is done and Ithaca is lit.
  const home = enemies.length > 0 && enemies.every((enemy) => cleared.includes(enemy.id));
  const points = routePoints(enemies.length);
  const course = legs(points);
  const path = course.map(([a, c1, c2, b], i) => `${i === 0 ? `M${String(a[0])} ${String(a[1])}` : ""} C${String(c1[0])} ${String(c1[1])} ${String(c2[0])} ${String(c2[1])} ${String(b[0])} ${String(b[1])}`).join(" ");
  const next = enemies.findIndex((enemy) => !cleared.includes(enemy.id));
  const size = (i: number) => (i === next ? NEXT : STOP);
  // Each stop keeps its medallion and its name clear of the ship; so does Troy.
  const keepOut: Box[] = points.slice(1, -1).map(([x, y], i): Box => [x - size(i) / 2 - 10, y - size(i) / 2 - 60, size(i) + 20, size(i) + 130]);
  keepOut.push([TROY_AT[0] - 60, TROY_AT[1] - 60, 120, 150]);
  const leg = course[next < 0 ? course.length - 1 : next];
  const [sx, sy] = home || !leg ? HARBOUR_AT : shipSpot(leg, keepOut);
  const pct = (x: number, y: number) => ({ left: `${String((x / W) * 100)}%`, top: `${String((y / H) * 100)}%` });
  return (
    <Panel as="main" className={`menu menu--map quest-map ${home ? "is-home" : ""}`}>
      <BronzeDefs />
      <div className="qm-back" aria-hidden="true" />
      <div className="qm-layer qm-stage">
        <img className="qm-paint" src="/textures/map/pano.jpg" alt="" draggable={false} />
        <div className="qm-cloudshade" />
        <div className="qm-whirl" style={pct(1089, 667)} />
        <div className="qm-shade" />
        <svg className="qm-front" viewBox={`0 0 ${String(W)} ${String(H)}`} aria-hidden="true">
          <path className="qm-wake-edge" d={path} />
          <path className="qm-wake" d={path} />
          <g transform={`translate(${String(sx - 43)} ${String(sy - 58)}) scale(0.9)`}>
            <g className="qm-ship">{GALLEY}</g>
          </g>
        </svg>
        <div className="qm-orb qm-orb--troy" style={{ ...pct(...TROY_AT), "--s": TROY } as CSSProperties}>
          <span className="qm-face"><img src="/textures/map/v-troy.jpg" alt="" /></span>
          <span className="qm-plate">Troy</span>
        </div>
        <span className="qm-port" style={pct(HARBOUR_AT[0], HARBOUR_AT[1] + 20)}>Ithaca</span>
        {enemies.map((enemy, i) => {
          const [x, y] = points[i + 1] ?? [0, 0];
          const open = props.open(i);
          const state = cleared.includes(enemy.id) ? "cleared" : open ? "open" : "locked";
          return (
            <button
              key={enemy.id}
              className={`stop qm-stop qm-stop--${enemy.id} ${state} ${i === next ? "is-next" : ""}`}
              style={{ ...pct(x, y), "--s": size(i) } as CSSProperties}
              title={enemy.place}
              disabled={!open}
              onClick={() => { props.onEnter(i); }}
            >
              <span className="qm-cloud" aria-hidden="true" />
              <span className="qm-glow" aria-hidden="true" />
              <span className="qm-face">
                <img src={`/textures/map/v-${enemy.id === "suitors" ? "ithaca" : enemy.id}.jpg`} alt="" draggable={false} />
              </span>
              <b className="qm-badge">{state === "cleared" ? <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 7.5 L5.8 10.5 L11.5 3.5" /></svg> : i + 1}</b>
              {state === "cleared" && <Laurel />}
              <span className="qm-plate">
                {enemy.name}
                <small>{state === "locked" ? "Ahead" : state === "cleared" ? "Won" : enemy.book ? `Book ${String(enemy.book)}` : ""}</small>
              </span>
            </button>
          );
        })}
      </div>
      <div className="menu-scene qm-rain" aria-hidden="true">
        <div className="menu-scene__rain menu-scene__rain--far" />
        <div className="menu-scene__rain menu-scene__rain--near" />
      </div>
      <header className="qm-head">
        <h1 className="qm-title">The Road Home</h1>
        <p>{home ? "The journey is done. Odysseus is home in Ithaca." : "Choose your next stop on the sea. The fight starts as soon as you pick one."}</p>
      </header>
      <div className="qm-foot">
        <Button onClick={props.onStyle}>Change style</Button>
        <Button onClick={props.onMenu}>Main menu</Button>
      </div>
    </Panel>
  );
}
