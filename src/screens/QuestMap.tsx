// The quest map: the road home as one painted storm sea filling the screen. Each stop is a button drawn as its place
// (the Cyclops' cave, Circe's hall, the Sirens' rock, Scylla's cliff, Charybdis, the great hall on Ithaca); the course
// runs from burning Troy past each of them to Ithaca's harbour, with the ship on the leg ahead. The stops come from the
// enemy registry; ones with no 3D model yet are locked.
import type { EnemySpec } from "../core/types";
import { Button, Panel } from "../ui/pebble";
import { BronzeDefs, GALLEY } from "./menuShields";
import { HARBOUR_AT, PlaceArt, STOP_SLOTS, TROY, TROY_AT } from "./questPlaces";
import { Sea, SeaDefs } from "./questSea";
import { QuestLook } from "./QuestLook";
import { LOOK_ROUTE, type Look } from "./questLookData";
import { LOOK } from "../ui/lookSwitch";
import "./menuScene.css";
import "./questMap.css";

const W = 1600, H = 900, ART = 224;

export type Point = readonly [number, number];
export type Box = readonly [number, number, number, number];

/** The course on the 1600 x 900 scene: Troy, the waterline in front of each stop, then Ithaca's harbour. */
export function routePoints(stops: number, look?: Look | null): readonly Point[] {
  const table = look ? LOOK_ROUTE[look] : null;
  if (table) return [table.troy, ...Array.from({ length: stops }, (_, i): Point => table.slots[i] ?? [200 + ((i * 220) % 1200), 520]), table.harbour];
  const slot = (i: number): Point => STOP_SLOTS[i] ?? [200 + ((i * 220) % 1200), 520];
  return [[TROY_AT[0] + 40, TROY_AT[1] + 14], ...Array.from({ length: stops }, (_, i): Point => [slot(i)[0], slot(i)[1] + 8]), HARBOUR_AT];
}

/** Catmull-Rom through the points, as one cubic per leg: start, two controls, end. */
export function legs(p: readonly Point[]): (readonly [Point, Point, Point, Point])[] {
  return p.slice(0, -1).map((a, i) => {
    const b = p[i + 1] ?? a, z = p[i - 1] ?? a, n = p[i + 2] ?? b;
    return [a, [a[0] + (b[0] - z[0]) / 6, a[1] + (b[1] - z[1]) / 6], [b[0] - (n[0] - a[0]) / 6, b[1] - (n[1] - a[1]) / 6], b] as const;
  });
}

export const at = (leg: readonly [Point, Point, Point, Point], t: number): Point => {
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

export function QuestMap(props: {
  enemies: readonly EnemySpec[];
  cleared: readonly string[];
  open: (index: number) => boolean;
  onEnter: (index: number) => void;
  onStyle: () => void;
  onMenu: () => void;
}) {
  if (LOOK) return <QuestLook look={LOOK} {...props} />;
  const { enemies, cleared } = props;
  // Every stop won: the journey is done and Ithaca is lit.
  const home = enemies.length > 0 && enemies.every((enemy) => cleared.includes(enemy.id));
  const points = routePoints(enemies.length);
  const course = legs(points);
  const path = course.map(([a, c1, c2, b], i) => `${i === 0 ? `M${String(a[0])} ${String(a[1])}` : ""} C${String(c1[0])} ${String(c1[1])} ${String(c2[0])} ${String(c2[1])} ${String(b[0])} ${String(b[1])}`).join(" ");
  const next = enemies.findIndex((enemy) => !cleared.includes(enemy.id));
  // Each stop keeps its drawing and its name clear of the ship; so do Troy and Ithaca's names.
  const keepOut: Box[] = points.slice(1, -1).flatMap(([x, y]): Box[] => [[x - ART / 2, y - 8 - (140 * ART) / 200, ART, (140 * ART) / 200], [x - 95, y - 4, 190, 66]]);
  keepOut.push([TROY_AT[0] - 110, TROY_AT[1] - 130, 200, 180], [HARBOUR_AT[0] - 40, HARBOUR_AT[1] - 98, 80, 26]);
  const leg = course[next < 0 ? course.length - 1 : next];
  const [sx, sy] = home || !leg ? HARBOUR_AT : shipSpot(leg, keepOut);
  const pct = (x: number, y: number) => ({ left: `${String((x / W) * 100)}%`, top: `${String((y / H) * 100)}%` });
  return (
    <Panel as="main" className={`menu menu--map quest-map ${home ? "is-home" : ""}`}>
      <BronzeDefs />
      <svg className="qm-layer qm-backlayer" viewBox={`0 0 ${String(W)} ${String(H)}`} aria-hidden="true">
        <SeaDefs />
        <Sea />
      </svg>
      <div className="menu-scene qm-rain" aria-hidden="true">
        <div className="menu-scene__rain menu-scene__rain--far" />
        <div className="menu-scene__rain menu-scene__rain--near" />
      </div>
      <div className="qm-layer qm-stage">
        <svg className="qm-front" viewBox={`0 0 ${String(W)} ${String(H)}`} aria-hidden="true">
          {TROY}
          <path className="qm-course-edge" d={path} />
          <path className="qm-course" d={path} />
          {home && <circle className="qm-home-glow" cx={STOP_SLOTS[5]?.[0] ?? HARBOUR_AT[0]} cy={(STOP_SLOTS[5]?.[1] ?? HARBOUR_AT[1]) - 70} r="190" />}
          <g transform={`translate(${String(sx - 43)} ${String(sy - 58)}) scale(0.9)`}>
            <g className="qm-ship">{GALLEY}</g>
          </g>
        </svg>
        <span className="qm-port" style={pct(TROY_AT[0] - 30, TROY_AT[1] + 22)}>Troy</span>
        <span className="qm-port qm-port--ithaca" style={pct(HARBOUR_AT[0], HARBOUR_AT[1] - 98)}>Ithaca</span>
        {enemies.map((enemy, i) => {
          const [x, y] = points[i + 1] ?? [0, 0];
          const open = props.open(i);
          const state = cleared.includes(enemy.id) ? "cleared" : open ? "open" : "locked";
          return (
            <button
              key={enemy.id}
              className={`stop qm-stop qm-stop--${enemy.id} ${state} ${i === next ? "is-next" : ""}`}
              style={{ ...pct(x - ART / 2, y - 8 - (140 * ART) / 200), width: `${String((ART / W) * 100)}%` }}
              title={enemy.place}
              disabled={!open}
              onClick={() => { props.onEnter(i); }}
            >
              <span className="qm-glow" aria-hidden="true" />
              <PlaceArt id={enemy.id} />
              <span className="qm-label">
                <b className="qm-badge">{state === "cleared" ? <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 7.5 L5.8 10.5 L11.5 3.5" /></svg> : i + 1}</b>
                {enemy.name}
                <small>{state === "locked" ? "Ahead" : state === "cleared" ? "Won" : enemy.book ? `Book ${String(enemy.book)}` : ""}</small>
              </span>
            </button>
          );
        })}
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
