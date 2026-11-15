// Direction A, "Painted reveal": the boss's painting comes up out of black, the name slams in, the picture cracks open.
// Everything is a function of one clock (ms), so ?cutAt=<ms> can freeze any frame. Only transform and opacity move.
import { useEffect, useMemo, useRef, useState } from "react";
import { playEvent } from "../../audio/sfx";
import { CUT_AT } from "../../ui/lookSwitch";
import { BOSS_CUTS, type Weather } from "./bosses";
import "./cutscene.css";
import { clamp01, curve, cutBeat, DARK_END, easeIn, easeOut, REDUCED_MS, REVEAL_END, SLAM_MS, TOTAL_MS } from "./timing";

interface Speck { readonly x: number; readonly y: number; readonly depth: number; readonly alpha: number }

const wrap = (v: number, span: number): number => ((v % span) + span) % span;

function specks(count: number): readonly Speck[] {
  const rand = (i: number, k: number): number => { const s = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return s - Math.floor(s); };
  return Array.from({ length: count }, (_, i) => ({ x: rand(i, 1) * 100, y: rand(i, 2) * 100, depth: 0.5 + (i % 3) * 0.55, alpha: 0.45 + rand(i, 3) * 0.55 }));
}

function Weathers({ weather, ms, fade }: { readonly weather: Weather; readonly ms: number; readonly fade: number }) {
  const list = useMemo(() => specks(weather.count), [weather.count]);
  const secs = ms / 1000;
  return (
    <div className="cut-weather" style={{ opacity: fade }} aria-hidden="true">
      {list.map((s, i) => {
        const x = wrap(s.x + weather.vx * s.depth * secs, 120) - 10;
        const y = wrap(s.y + weather.vy * s.depth * secs, 120) - 10;
        return (
          <i
            key={i}
            style={{
              width: weather.w * s.depth, height: weather.h * s.depth, opacity: s.alpha, background: weather.color,
              boxShadow: weather.glow, transform: `translate3d(${x.toFixed(2)}vw, ${y.toFixed(2)}vh, 0) rotate(${String(weather.tilt)}deg)`,
            }}
          />
        );
      })}
    </div>
  );
}

const JAG_LEFT = "polygon(0 0, 100% 0, 98% 9%, 100% 19%, 97.5% 30%, 99.5% 41%, 97% 52%, 100% 63%, 97.5% 74%, 99.5% 86%, 98% 94%, 100% 100%, 0 100%)";
const JAG_RIGHT = "polygon(0 0, 100% 0, 100% 100%, 0 100%, 2% 94%, 0.5% 86%, 2.5% 74%, 0 63%, 3% 52%, 0.5% 41%, 2.5% 30%, 0 19%, 2% 9%)";

export function Cutscene({ id, name, onDone }: { readonly id: string; readonly name: string; readonly onDone: () => void }) {
  const boss = BOSS_CUTS[id];
  const [reduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [ms, setMs] = useState(CUT_AT ?? 0);
  const finished = useRef(false);
  const finish = (): void => { if (!finished.current) { finished.current = true; onDone(); } };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  useEffect(() => {
    if (CUT_AT !== null) return undefined;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number): void => {
      const at = now - start;
      setMs(at);
      if (at >= (reduced ? REDUCED_MS : TOTAL_MS)) finishRef.current();
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); };
  }, [reduced]);

  // Any key skips, and the key goes no further: the fight never sees it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => { event.preventDefault(); event.stopImmediatePropagation(); finishRef.current(); };
    window.addEventListener("keydown", onKey, true);
    return () => { window.removeEventListener("keydown", onKey, true); };
  }, []);

  // The one sound: the war horn, on the big beat.
  const sounded = useRef(false);
  useEffect(() => {
    if (CUT_AT !== null || reduced || sounded.current || ms < SLAM_MS) return;
    sounded.current = true;
    playEvent({ type: "phaseChanged", index: 1, name });
  }, [ms, reduced, name]);

  if (!boss) return null;
  const pos = cutBeat(ms, reduced);
  const exit = pos.beat === "exit" ? easeIn(pos.t) : 0;
  const cracking = pos.beat === "exit" || pos.beat === "done";
  const picture = reduced ? 1 : easeOut((ms - DARK_END) / (REVEAL_END - DARK_END + 200));
  const push = reduced ? 1.05 : 1.02 + 0.17 * clamp01(ms / TOTAL_MS);
  const flash = reduced ? 0 : curve(ms, [[430, 0], [480, 0.9], [540, 0.25], [600, 0.7], [760, 0]]) + curve(ms, [[SLAM_MS - 10, 0], [SLAM_MS + 15, 0.6], [SLAM_MS + 160, 0]]);
  const shakeT = clamp01((ms - SLAM_MS) / 380);
  const amp = reduced || ms < SLAM_MS ? 0 : 16 * (1 - shakeT) ** 2;
  const shake = `translate3d(${(Math.sin(ms * 0.11) * amp).toFixed(1)}px, ${(Math.cos(ms * 0.15) * amp * 0.6).toFixed(1)}px, 0)`;
  const text = reduced ? 1 : 1 - clamp01((ms - (TOTAL_MS - 1100)) / 260);
  const line = reduced ? 1 : easeOut((ms - SLAM_MS - 150) / 650);
  const epithet = reduced ? 1 : easeOut((ms - SLAM_MS - 350) / 400);
  const book = reduced ? 1 : easeOut((ms - SLAM_MS - 550) / 400);
  const hint = reduced ? 1 : clamp01((ms - 500) / 400) * text;
  const half = (side: "l" | "r") => (
    <div
      className={`cut-half cut-half--${side}`}
      style={{ opacity: picture, clipPath: cracking ? (side === "l" ? JAG_LEFT : JAG_RIGHT) : undefined, transform: exit > 0 ? `translate3d(${side === "l" ? "-" : ""}${(exit * 100).toFixed(2)}%, 0, 0)` : undefined }}
    >
      <div className="cut-pic" style={{ transform: `scale(${push.toFixed(4)})`, transformOrigin: boss.focus }}>
        <img src={`/textures/cutscene/boss-${id}.jpg`} alt="" draggable={false} />
      </div>
    </div>
  );
  return (
    <div className="cut" role="dialog" aria-label={`${name}, ${boss.epithet}. Press any key to skip.`} onClick={finish}>
      <div className="cut-lava" style={{ opacity: Math.min(1, exit * 5), transform: `scaleX(${(0.3 + exit * 3.4).toFixed(3)})` }} aria-hidden="true" />
      <div className="cut-stage" style={{ transform: shake }}>
        {half("l")}
        {half("r")}
        <div className="cut-fx" style={{ opacity: 1 - exit * 1.6 }} aria-hidden="true">
          <div className="cut-vignette" />
          {reduced ? null : <Weathers weather={boss.weather} ms={ms} fade={picture} />}
          <div className="cut-flash" style={{ background: boss.flash, opacity: flash }} />
        </div>
        <div className="cut-title" style={{ opacity: text }}>
          <h2 className="cut-name" aria-label={name}>
            {[...name.toUpperCase()].map((ch, i) => {
              const p = reduced ? 1 : easeOut((ms - SLAM_MS - i * 40) / 260);
              return (
                <span key={i} aria-hidden="true" className={ch === " " ? "cut-gap" : undefined} style={{ opacity: p, transform: `translate3d(0, ${((1 - p) * -44).toFixed(1)}px, 0) scale(${(1 + (1 - p) * 0.8).toFixed(3)})` }}>{ch}</span>
              );
            })}
          </h2>
          <div className="cut-line" style={{ transform: `scaleX(${line.toFixed(3)})` }} aria-hidden="true" />
          <p className="cut-epithet" style={{ opacity: epithet, transform: `translate3d(0, ${((1 - epithet) * 14).toFixed(1)}px, 0)` }}>{boss.epithet}</p>
          <p className="cut-book" style={{ opacity: book }}>Book {boss.book} of the Odyssey</p>
        </div>
      </div>
      <div className="cut-black" style={{ opacity: clamp01((ms - (TOTAL_MS - 260)) / 260) * (reduced ? 0 : 1) }} aria-hidden="true" />
      <p className="cut-hint" style={{ opacity: hint }}>Press any key or click to skip</p>
    </div>
  );
}
