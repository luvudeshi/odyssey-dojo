// Draft looks for the quest map, switched by ?look=a|b|c (lookSwitch.ts). One component draws all three from painted pictures:
// a "Living sea" (the voyage as one painted sea), b "Painted medallions" (each place a round painting in a bronze shield rim),
// c "The hero's chart" (a vellum sea chart with pinned miniatures). Same stops, states, buttons and closing line as the real map.
import type { CSSProperties } from "react";
import type { EnemySpec } from "../core/types";
import { Button, Panel } from "../ui/pebble";
import { BronzeDefs, GALLEY } from "./menuShields";
import { legs, routePoints, shipSpot, type Box } from "./QuestMap";
import { LOOK_ROUTE, type Look } from "./questLookData";
import "./menuScene.css";
import "./questMap.css";
import "./questLook.css";

const W = 1600, H = 900;
const IMAGE: Record<Look, string> = { a: "pano", b: "sea", c: "chart" };
// Orb diameter on the scene: a stop, the next stop and a stop that is Troy or Ithaca.
const SIZE: Record<Look, { stop: number; next: number }> = { a: { stop: 58, next: 70 }, b: { stop: 150, next: 196 }, c: { stop: 96, next: 124 } };

/** A wreath of laurel leaves round a circle, drawn in a 100 x 100 box. */
function Laurel() {
  const leaves = [1, -1].flatMap((side) => Array.from({ length: 10 }, (_, k) => {
    const a = ((78 + k * 17) * Math.PI) / 180, x = 50 + side * 44 * Math.cos(a), y = 50 + 44 * Math.sin(a);
    return { key: `${String(side)}${String(k)}`, x, y, deg: side * ((a * 180) / Math.PI) + (side === 1 ? 90 : -90) };
  }));
  return (
    <svg className="lk-laurel" viewBox="0 0 100 100" aria-hidden="true">
      {leaves.map((l) => <ellipse key={l.key} cx={l.x} cy={l.y} rx="8" ry="3.3" transform={`rotate(${String(l.deg)} ${String(l.x)} ${String(l.y)})`} />)}
    </svg>
  );
}

export function QuestLook(props: {
  look: Look;
  enemies: readonly EnemySpec[];
  cleared: readonly string[];
  open: (index: number) => boolean;
  onEnter: (index: number) => void;
  onStyle: () => void;
  onMenu: () => void;
}) {
  const { look, enemies, cleared } = props;
  const home = enemies.length > 0 && enemies.every((enemy) => cleared.includes(enemy.id));
  const points = routePoints(enemies.length, look);
  const course = legs(points);
  const seg = (list: typeof course) => list.map(([a, c1, c2, b], i) => `${i === 0 ? `M${String(a[0])} ${String(a[1])}` : ""} C${String(c1[0])} ${String(c1[1])} ${String(c2[0])} ${String(c2[1])} ${String(b[0])} ${String(b[1])}`).join(" ");
  const next = enemies.findIndex((enemy) => !cleared.includes(enemy.id));
  const sailed = seg(course.slice(0, next < 0 ? course.length : next));
  const size = (i: number) => (i === next ? SIZE[look].next : SIZE[look].stop);
  const keepOut: Box[] = points.slice(1, -1).map(([x, y], i): Box => [x - size(i) / 2 - 10, y - size(i) / 2 - 10, size(i) + 20, size(i) + 90]);
  keepOut.push([LOOK_ROUTE[look].troy[0] - 70, LOOK_ROUTE[look].troy[1] - 70, 140, 140]);
  const leg = course[next < 0 ? course.length - 1 : next];
  const harbour = LOOK_ROUTE[look].harbour;
  const [sx, sy] = home || !leg ? harbour : shipSpot(leg, keepOut);
  const pct = (x: number, y: number) => ({ left: `${String((x / W) * 100)}%`, top: `${String((y / H) * 100)}%` });
  const troy = LOOK_ROUTE[look].troy;
  return (
    <Panel as="main" className={`menu menu--map quest-map lk lk--${look} ${home ? "is-home" : ""}`}>
      <BronzeDefs />
      <div className="lk-back" style={{ backgroundImage: `url(/textures/map/${IMAGE[look]}.jpg)` }} aria-hidden="true" />
      <div className="qm-layer lk-stage">
        <img className="lk-paint" src={`/textures/map/${IMAGE[look]}.jpg`} alt="" draggable={false} />
        {look === "a" && (
          <>
            <div className="lk-cloudshade" />
            <div className="lk-whirl" style={pct(1089, 667)} />
          </>
        )}
        <div className="lk-shade" />
        <svg className="qm-front lk-course" viewBox={`0 0 ${String(W)} ${String(H)}`} aria-hidden="true">
          <path className="lk-wake-edge" d={seg(course)} />
          <path className="lk-wake" d={seg(course)} />
          {sailed && <path className="lk-sailed" d={sailed} />}
          <g transform={`translate(${String(sx - 43)} ${String(sy - 58)}) scale(${look === "c" ? "0.75" : "0.9"})`}>
            <g className="qm-ship">{GALLEY}</g>
          </g>
        </svg>
        {look === "b" ? (
          <div className="lk-orb lk-orb--troy" style={{ ...pct(troy[0], troy[1]), "--s": 112 } as CSSProperties}>
            <span className="lk-orb-face"><img src="/textures/map/v-troy.jpg" alt="" /></span><span className="lk-plate">Troy</span>
          </div>
        ) : look === "c" ? (
          <div className="lk-orb lk-orb--troy" style={{ ...pct(troy[0], troy[1]), "--s": 92 } as CSSProperties}>
            <span className="lk-orb-face"><img src="/textures/map/v-troy.jpg" alt="" /></span><span className="lk-plate">Troy</span>
          </div>
        ) : (
          <span className="qm-port lk-port" style={pct(troy[0] - 20, troy[1] + 24)}>Troy</span>
        )}
        <span className="qm-port lk-port lk-port--ithaca" style={pct(harbour[0] - (look === "a" ? 0 : 30), harbour[1] + (look === "c" ? -54 : 20))}>Ithaca</span>
        {enemies.map((enemy, i) => {
          const [x, y] = points[i + 1] ?? [0, 0];
          const open = props.open(i);
          const state = cleared.includes(enemy.id) ? "cleared" : open ? "open" : "locked";
          return (
            <button
              key={enemy.id}
              className={`stop lk-stop lk-stop--${enemy.id} ${state} ${i === next ? "is-next" : ""}`}
              style={{ ...pct(x, y), "--s": size(i) } as CSSProperties}
              title={enemy.place}
              disabled={!open}
              onClick={() => { props.onEnter(i); }}
            >
              <span className="lk-cloud" aria-hidden="true" />
              <span className="lk-glow" aria-hidden="true" />
              <span className="lk-orb-face">
                {look !== "a" && <img src={`/textures/map/v-${enemy.id === "suitors" ? "ithaca" : enemy.id}.jpg`} alt="" draggable={false} />}
                <b className="lk-boss">{state === "cleared" ? <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 7.5 L5.8 10.5 L11.5 3.5" /></svg> : i + 1}</b>
              </span>
              {state === "cleared" && <Laurel />}
              <span className="lk-plate">
                {enemy.name}
                <small>{state === "locked" ? "Ahead" : state === "cleared" ? "Won" : enemy.book ? `Book ${String(enemy.book)}` : ""}</small>
              </span>
            </button>
          );
        })}
      </div>
      {look === "a" && (
        <div className="menu-scene qm-rain" aria-hidden="true">
          <div className="menu-scene__rain menu-scene__rain--far" />
          <div className="menu-scene__rain menu-scene__rain--near" />
        </div>
      )}
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
