// Draft round two (?look=a|b|c): the quest map as one whole-screen scene. The places are the stops' buttons, laid over a
// drawn sea; the course runs from burning Troy past each place to the great hall on Ithaca, with the ship on the leg ahead.
import type { EnemySpec } from "../core/types";
import { Button, Panel } from "../ui/pebble";
import { Backdrop, SceneDefs } from "./mapBackdrops";
import { PLACE_AT, PlaceArt, TROY, TROY_AT } from "./mapPlaces";
import { LookDefs, RICH_ICONS } from "./menuCardLooks";
import "./menuCardLooks.css";
import "./mapScene.css";

type Point = readonly [number, number];
const W = 1600, H = 900, ART = 224;

/** The course's waypoints: Troy, then the waterline in front of each place. */
function waypoints(enemies: readonly EnemySpec[]): Point[] {
  return [[TROY_AT[0] + 40, TROY_AT[1] + 14], ...enemies.map((enemy): Point => { const [x, y] = PLACE_AT[enemy.id] ?? [0, 0]; return [x, y + 8]; })];
}

/** Catmull-Rom through the waypoints, as cubic segments: [start, c1, c2, end] for each leg. */
function legs(p: readonly Point[]): [Point, Point, Point, Point][] {
  return p.slice(0, -1).map((a, i) => {
    const b = p[i + 1] ?? a, z = p[i - 1] ?? a, n = p[i + 2] ?? b;
    return [a, [a[0] + (b[0] - z[0]) / 6, a[1] + (b[1] - z[1]) / 6], [b[0] - (n[0] - a[0]) / 6, b[1] - (n[1] - a[1]) / 6], b];
  });
}

export function MapScene(props: {
  look: "a" | "b" | "c";
  enemies: readonly EnemySpec[];
  cleared: readonly string[];
  home: boolean;
  open: (index: number) => boolean;
  onEnter: (index: number) => void;
  onStyle: () => void;
  onMenu: () => void;
}) {
  const { look, enemies, cleared, home } = props;
  const segs = legs(waypoints(enemies));
  const course = segs.map(([a, c1, c2, b], i) => `${i === 0 ? `M${String(a[0])} ${String(a[1])}` : ""} C${String(c1[0])} ${String(c1[1])} ${String(c2[0])} ${String(c2[1])} ${String(b[0])} ${String(b[1])}`).join(" ");
  const next = enemies.findIndex((enemy) => !cleared.includes(enemy.id));
  const leg = segs[Math.max(0, next)];
  const mid = (k: 0 | 1): number => (leg ? (leg[0][k] + 3 * leg[1][k] + 3 * leg[2][k] + leg[3][k]) / 8 : 0);
  const ithaca = PLACE_AT.suitors ?? [0, 0];
  const [sx, sy] = home ? [ithaca[0] - 150, ithaca[1] + 40] : [mid(0), mid(1)];
  const pct = (x: number, y: number) => ({ left: `${String((x / W) * 100)}%`, top: `${String((y / H) * 100)}%` });
  return (
    <Panel as="main" className={`menu menu--map lk-map lk-map--${look} ${home ? "is-home" : ""}`}>
      <LookDefs />
      <div className="lk-stage">
        <svg className="lk-scene" viewBox={`0 0 ${String(W)} ${String(H)}`} aria-hidden="true">
          <SceneDefs />
          <Backdrop look={look} />
          {TROY}
          <path className="lk-course-glow" d={course} />
          <path className="lk-course" d={course} />
          <path className="lk-course-hot" d={course} />
          <path className="lk-course-flow" d={course} />
          <g className="lk-icon lk-ship" transform={`translate(${String(sx - 48)} ${String(sy - 62)}) scale(1)`}>{RICH_ICONS.ship}</g>
          {home && <circle className="lk-home-glow" cx={ithaca[0]} cy={ithaca[1] - 70} r="190" />}
        </svg>
        <span className="lk-port" style={pct(TROY_AT[0] - 30, TROY_AT[1] + 20)}>Troy</span>
        {enemies.map((enemy, i) => {
          const [x, y] = PLACE_AT[enemy.id] ?? [0, 0];
          const open = props.open(i);
          const state = cleared.includes(enemy.id) ? "cleared" : open ? "open" : "locked";
          return (
            <button
              key={enemy.id}
              className={`stop lk-stop lk-stop--${enemy.id} ${state} ${i === next ? "is-next" : ""}`}
              style={{ ...pct(x - ART / 2, y - (140 * ART) / 200), width: `${String((ART / W) * 100)}%` }}
              title={enemy.place}
              disabled={!open}
              onClick={() => { props.onEnter(i); }}
            >
              <PlaceArt id={enemy.id} />
              <span className="lbl">
                <b className="lk-badge">{state === "cleared" ? <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 7.5 L5.8 10.5 L11.5 3.5" /></svg> : i + 1}</b>
                {enemy.name}
                <small>{state === "locked" ? "Ahead" : state === "cleared" ? "Won" : enemy.book ? `Book ${String(enemy.book)}` : ""}</small>
              </span>
            </button>
          );
        })}
      </div>
      <header className="lk-head">
        <h1 className="lk-title">The Road Home</h1>
        <p>{home ? "The journey is done. Odysseus is home in Ithaca." : "Choose your next stop on the sea. The fight starts as soon as you pick one."}</p>
      </header>
      <div className="lk-foot">
        <Button onClick={props.onStyle}>Change style</Button>
        <Button onClick={props.onMenu}>Main menu</Button>
      </div>
    </Panel>
  );
}
