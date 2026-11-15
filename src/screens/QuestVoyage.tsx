// Draft look D "The long voyage" (?look=d): the seven painted places joined into one strip, Troy at the far left and Ithaca
// at the far right, in a sideways scroller. Wheel, trackpad, touch, drag and the arrow keys all move it; it opens centred on the
// next stop to fight. The title, hint and buttons stay fixed over it, and a rail at the bottom shows where you are.
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { EnemySpec } from "../core/types";
import { Button, Panel } from "../ui/pebble";
import { BronzeDefs, GALLEY } from "./menuShields";
import { legs, shipSpot, type Box, type Point } from "./QuestMap";
import { STRIP } from "./questLookData";
import "./menuScene.css";
import "./questMap.css";
import "./questLook.css";
import "./questVoyage.css";

const { w: SW, h: SH, troy, centres, y: SY } = STRIP;

export function QuestVoyage(props: {
  enemies: readonly EnemySpec[];
  cleared: readonly string[];
  open: (index: number) => boolean;
  onEnter: (index: number) => void;
  onStyle: () => void;
  onMenu: () => void;
}) {
  const { enemies, cleared } = props;
  const home = enemies.length > 0 && enemies.every((enemy) => cleared.includes(enemy.id));
  const next = enemies.findIndex((enemy) => !cleared.includes(enemy.id));
  const scroller = useRef<HTMLDivElement>(null);
  const drag = useRef({ x: 0, left: 0, moved: false, down: false });
  const [thumb, setThumb] = useState({ left: 0, width: 0.3 });
  const stopX = (i: number): number => centres[i] ?? 0;
  const points: Point[] = [[troy, SY], ...enemies.map((_, i): Point => [stopX(i), SY]), [SW - 190, SY + 90]];
  const course = legs(points);
  const path = course.map(([a, c1, c2, b], i) => `${i === 0 ? `M${String(a[0])} ${String(a[1])}` : ""} C${String(c1[0])} ${String(c1[1])} ${String(c2[0])} ${String(c2[1])} ${String(b[0])} ${String(b[1])}`).join(" ");
  const keepOut: Box[] = points.slice(1, -1).map(([x, y]): Box => [x - 110, y - 110, 220, 330]);
  const leg = course[next < 0 ? course.length - 1 : next];
  const [sx, sy] = home || !leg ? points[points.length - 1] ?? [0, 0] : shipSpot(leg, keepOut);

  const centreOn = (px: number, smooth: boolean) => {
    const el = scroller.current;
    if (!el) return;
    const left = (px / SW) * el.scrollWidth - el.clientWidth / 2;
    el.scrollTo({ left, behavior: smooth && !window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "instant" });
  };
  const sync = () => {
    const el = scroller.current;
    if (el) setThumb({ left: el.scrollLeft / el.scrollWidth, width: el.clientWidth / el.scrollWidth });
  };
  useEffect(() => {
    centreOn(stopX(next < 0 ? enemies.length - 1 : next), false);
    sync();
    const el = scroller.current;
    const wheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); el?.scrollBy({ left: e.deltaY }); }
    };
    el?.addEventListener("wheel", wheel, { passive: false });
    return () => { el?.removeEventListener("wheel", wheel); };
      }, []);

  const step = (dir: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    const mid = ((el.scrollLeft + el.clientWidth / 2) / el.scrollWidth) * SW;
    const all = [troy, ...centres];
    const target = dir === 1 ? all.find((x) => x > mid + 20) : [...all].reverse().find((x) => x < mid - 20);
    if (target === undefined) return;
    centreOn(target, true);
    const i = centres.indexOf(target);
    el.querySelector<HTMLButtonElement>(`.vy-stop[data-i="${String(i)}"]:not(:disabled)`)?.focus({ preventScroll: true });
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
  };
  const down = (e: ReactPointerEvent) => {
    if (e.pointerType === "touch" || e.button !== 0) return;
    drag.current = { x: e.clientX, left: scroller.current?.scrollLeft ?? 0, moved: false, down: true };
  };
  const move = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d.down || !scroller.current) return;
    if (Math.abs(e.clientX - d.x) > 6) d.moved = true;
    if (d.moved) scroller.current.scrollLeft = d.left - (e.clientX - d.x);
  };
  const up = () => { drag.current.down = false; };
  const pxPct = (x: number, y: number) => ({ left: `${String((x / SW) * 100)}%`, top: `${String((y / SH) * 100)}%` });

  return (
    <Panel as="main" className={`menu menu--map quest-map vy ${home ? "is-home" : ""}`}>
      <BronzeDefs />
      <div ref={scroller} className="vy-scroll" tabIndex={-1} onKeyDown={onKey} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} onScroll={sync}
        onClickCapture={(e) => { if (drag.current.moved) { e.stopPropagation(); e.preventDefault(); drag.current.moved = false; } }}>
        <div className="vy-track" style={{ aspectRatio: `${String(SW)} / ${String(SH)}` }}>
          <img className="vy-paint" src="/textures/map/voyage.jpg" alt="" draggable={false} />
          {home && <div className="vy-lit" style={pxPct(centres[centres.length - 1] ?? 0, SY - 60)} />}
          <svg className="vy-course" viewBox={`0 0 ${String(SW)} ${String(SH)}`} aria-hidden="true">
            <path className="lk-wake-edge" d={path} />
            <path className="lk-wake" d={path} />
            <g transform={`translate(${String(sx - 60)} ${String(sy - 90)}) scale(1.4)`}><g className="qm-ship">{GALLEY}</g></g>
          </svg>
          <span className="vy-port" style={pxPct(troy, SY + 120)}>Troy</span>
          <span className="vy-port vy-port--ithaca" style={pxPct(centres[centres.length - 1] ?? 0, 290)}>Ithaca</span>
          {enemies.map((enemy, i) => {
            const open = props.open(i);
            const state = cleared.includes(enemy.id) ? "cleared" : open ? "open" : "locked";
            return (
              <button key={enemy.id} data-i={i} className={`stop vy-stop vy-stop--${enemy.id} ${state} ${i === next ? "is-next" : ""}`} style={pxPct(stopX(i), SY) as CSSProperties}
                title={enemy.place} disabled={!open} onClick={() => { props.onEnter(i); }}>
                <span className="lk-glow" aria-hidden="true" />
                <span className="vy-boss">{state === "cleared" ? <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 7.5 L5.8 10.5 L11.5 3.5" /></svg> : i + 1}</span>
                <span className="lk-plate">{enemy.name}<small>{state === "locked" ? "Ahead" : state === "cleared" ? "Won" : enemy.book ? `Book ${String(enemy.book)}` : ""}</small></span>
              </button>
            );
          })}
        </div>
      </div>
      <header className="qm-head">
        <h1 className="qm-title">The Road Home</h1>
        <p>{home ? "The journey is done. Odysseus is home in Ithaca." : "Choose your next stop on the sea. The fight starts as soon as you pick one."}</p>
      </header>
      <div className="vy-rail" role="group" aria-label="Voyage">
        <div className="vy-rail__bar"><i style={{ left: `${String(thumb.left * 100)}%`, width: `${String(thumb.width * 100)}%` }} /></div>
        {enemies.map((enemy, i) => (
          <button key={enemy.id} className={`vy-dot ${cleared.includes(enemy.id) ? "is-won" : ""} ${i === next ? "is-next" : ""}`} style={{ left: `${String(((stopX(i)) / SW) * 100)}%` }} aria-label={`Scroll to ${enemy.name}`} onClick={() => { centreOn(stopX(i), true); }} />
        ))}
      </div>
      <div className="qm-foot">
        <Button onClick={props.onStyle}>Change style</Button>
        <Button onClick={props.onMenu}>Main menu</Button>
      </div>
    </Panel>
  );
}
