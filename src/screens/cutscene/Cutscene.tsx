// The pre-fight boss cutscene ("In the arena"): cinema bars, the name on a plate of black glass, and a skip. The camera
// move itself is drawn by CameraRig from cutClock. It needs no input but the skip, so webcam and keyboard play are alike.
import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { playPhaseHorn } from "../../audio/sfx";
import type { EnemySpec } from "../../core/types";
import { CUT_AT, cutClock } from "./clock";
import { EPITHETS, bookLine } from "./stops";
import { CUT_MS, NAME_AT, STILL_MS, barsAt, beatAt, plateAt } from "./timing";
import "./cutscene.css";

export function Cutscene({ enemy, onDone }: { enemy: EnemySpec; onDone: () => void }): ReactElement {
  const reduced = useRef(window.matchMedia("(prefers-reduced-motion: reduce)").matches).current;
  const [ms, setMs] = useState(CUT_AT ?? 0);
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; }, [onDone]);

  useEffect(() => {
    const total = reduced ? STILL_MS : CUT_MS;
    const stingAt = reduced ? 0 : NAME_AT;
    const t0 = performance.now();
    let handle = 0;
    let stung = false;
    let over = false;
    const finish = (): void => { if (!over) { over = true; done.current(); } };
    cutClock.enemyId = enemy.id;
    const tick = (): void => {
      const t = CUT_AT ?? performance.now() - t0;
      if (!reduced) cutClock.ms = t;
      setMs(t);
      if (!stung && t >= stingAt) { stung = true; playPhaseHorn(); }
      if (CUT_AT === null && t >= total) { finish(); return; }
      handle = requestAnimationFrame(tick);
    };
    // The skipping key press is swallowed here so it never reaches the fight's keyboard reader. Browser shortcuts (Cmd, Ctrl, Alt) pass.
    const onKey = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.type === "keydown") finish();
    };
    // Releases are swallowed until a moment after unmount, so a key held at skip time cannot reach the fight.
    const onUp = (event: KeyboardEvent): void => { event.stopImmediatePropagation(); };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onUp, true);
    handle = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(handle);
      window.removeEventListener("keydown", onKey, true);
      setTimeout(() => { window.removeEventListener("keyup", onUp, true); }, 400);
      cutClock.ms = null;
    };
  }, [enemy.id, reduced]);

  const bars = reduced ? 1 : barsAt(ms);
  const plate = reduced ? 1 : plateAt(ms);
  const flash = reduced ? 0 : Math.max(0, 1 - (ms - NAME_AT) / 260) * (ms >= NAME_AT ? 1 : 0);
  const beat = reduced ? "name" : beatAt(ms).beat;
  return (
    <div className="cut" data-beat={beat} onPointerDown={() => { done.current(); }}>
      <div className="cut-bar cut-top" style={{ transform: `translateY(${String((bars - 1) * 100)}%)` }} />
      <div className="cut-bar cut-bottom" style={{ transform: `translateY(${String((1 - bars) * 100)}%)` }}>
        <p className="cut-skip" style={{ opacity: bars }}>Press any key to skip</p>
      </div>
      <div className="cut-plate" style={{ opacity: plate }}>
        <div className="cut-slab" style={{ transform: `scaleX(${String(0.72 + 0.28 * plate)})` }}>
          <i className="cut-lava cut-lava-top" />
          <i className="cut-lava cut-lava-bottom" />
          <svg className="cut-cracks" viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 150 L90 128 L150 150 L240 120 M760 70 L840 92 L900 62 L1000 80 M380 200 L410 168 L450 182 M610 0 L640 34 L600 52" />
          </svg>
        </div>
        <div className="cut-words" style={{ transform: `translateY(${String((1 - plate) * 16)}px)` }}>
          <p className="cut-book">{bookLine(enemy.book)}</p>
          <h2 className={`cut-name${enemy.name.length > 10 ? " cut-name--long" : ""}`}>{enemy.name}</h2>
          <p className="cut-epithet">{EPITHETS[enemy.id] ?? enemy.title}</p>
        </div>
      </div>
      <div className="cut-flash" style={{ opacity: flash }} />
    </div>
  );
}
