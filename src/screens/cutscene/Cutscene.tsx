// Direction C, "Versus": a fighting-game face-off over the quest map after a stop is picked. Two paintings slam together on a
// slanted seam, a crack of black glass and lava opens on it, two slabs carry the names, and the crack bursts onto the fight.
// Timing is all in timing.ts; this file only turns a Frame into CSS variables. Any key, click or tap skips it.
import { useEffect, useRef, useState } from "react";
import { playPhaseHorn } from "../../audio/sfx";
import { BOSS_CARDS } from "./bosses";
import { swallowAfter } from "./keySwallow";
import { frameAt, HANDOVER_MS, REDUCED_HANDOVER_MS, REDUCED_TOTAL_MS, SLAM_MS, TOTAL_MS, type Frame } from "./timing";
import "./cutscene.css";

interface Props {
  readonly enemyId: string;
  readonly bossName: string;
  readonly heroName: string;
  /** performance.now() when the cutscene began; a remount picks the clock up from it. */
  readonly startedAt: number;
  readonly onSkip: () => void;
  readonly onHandOver: () => void;
  readonly onGone: () => void;
}

// A crack down the slanted seam (x 54 at the top, 46 at the bottom), in percent of the screen.
const CRACK = "M54.6 0 L52.2 9 L53.6 15 L50.4 27 L52 33 L49 46 L50.6 52 L47.4 64 L49 70 L46.2 83 L47.4 88 L45.4 100 L47 100 L48.4 90 L47.6 84 L51 71 L49.6 65 L52.4 53 L51 47 L54 34 L52.6 28 L55.4 16 L54 10 L56.4 0 Z";

const vars = (f: Frame): Record<string, string> => ({
  "--hx": `${f.heroX}%`, "--bx": `${f.bossX}%`, "--zoom": String(f.zoom), "--sx": `${f.shakeX}px`, "--sy": `${f.shakeY}px`,
  "--flash": String(f.flash), "--cy": String(f.crackY), "--cx": String(f.crackX), "--lava": String(Math.min(1, f.lava)),
  "--slab": String(f.slabs), "--epi": String(f.epithet), "--vs": String(f.vs), "--vss": String(f.vsScale),
  "--hint": String(f.hint), "--white": String(f.white), "--over": String(f.overlay),
});

// Keys whose keydown the cutscene swallowed. They outlive the component (it remounts at the hand-over): their repeats and one keyup
// are eaten until released, and nothing else is. The listeners go once the set is empty, and after 5 s at the latest.
const held = new Set<string>();
let watching: { readonly stop: () => void } | null = null;
function watchHeld(): void {
  if (watching) return;
  const handle = (event: KeyboardEvent): void => {
    if (event.type === "keydown" || event.type === "keyup") {
      if (swallowAfter(held, event.type, event.code, event.repeat)) event.stopImmediatePropagation();
    }
    if (held.size === 0) watching?.stop();
  };
  const timer = setTimeout(() => { watching?.stop(); }, 5000);
  const stop = (): void => {
    window.removeEventListener("keydown", handle, true);
    window.removeEventListener("keyup", handle, true);
    clearTimeout(timer);
    held.clear();
    watching = null;
  };
  window.addEventListener("keydown", handle, true);
  window.addEventListener("keyup", handle, true);
  watching = { stop };
}

export function Cutscene({ enemyId, bossName, heroName, startedAt, onSkip, onHandOver, onGone }: Props) {
  const root = useRef<HTMLDivElement>(null);
  // The parent makes new callbacks on every render; the clock and the key listeners must not restart for that.
  const calls = useRef({ onSkip, onHandOver, onGone });
  calls.current = { onSkip, onHandOver, onGone };
  const card = BOSS_CARDS[enemyId] ?? { epithet: "", book: 0 };
  const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clock = useRef(startedAt);
  clock.current = startedAt;
  // A remount at the hand-over starts from where the clock is, not from frame 0. React leaves this style alone on later renders.
  const [first] = useState(() => vars(frameAt(Math.max(0, performance.now() - startedAt), reduced)));

  useEffect(() => {
    let raf = 0;
    let handed = false;
    let horn = false;
    const handAt = reduced ? REDUCED_HANDOVER_MS : HANDOVER_MS;
    const endAt = reduced ? REDUCED_TOTAL_MS : TOTAL_MS;
    const tick = (): void => {
      const ms = performance.now() - startedAt;
      const el = root.current;
      if (el) for (const [key, value] of Object.entries(vars(frameAt(ms, reduced)))) el.style.setProperty(key, value);
      if (!horn && !reduced && ms >= SLAM_MS && ms < SLAM_MS + 400) { horn = true; playPhaseHorn(); }
      if (!handed && ms >= handAt) { handed = true; calls.current.onHandOver(); }
      if (ms >= endAt) { calls.current.onGone(); return; }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => { cancelAnimationFrame(raf); };
  }, [reduced, startedAt]);

  // Any key, click or tap skips. The skipping key never reaches the fight: it is stopped here, and its repeats and release by watchHeld.
  // Once the fight is running (the hand-over) keys pass straight through.
  useEffect(() => {
    const handAt = reduced ? REDUCED_HANDOVER_MS : HANDOVER_MS;
    // Browser shortcuts (Cmd, Ctrl, Alt) pass through.
    const skip = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey || performance.now() - clock.current >= handAt) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      held.add(event.code);
      watchHeld();
      calls.current.onSkip();
    };
    window.addEventListener("keydown", skip, true);
    return () => { window.removeEventListener("keydown", skip, true); };
  }, [reduced]);

  return (
    <div ref={root} className="cut" role="presentation" onClick={onSkip} style={first as React.CSSProperties}>
      <div className="cut-stage">
        <div className="cut-half cut-hero"><img src="/textures/cutscene/hero.jpg" alt="" /></div>
        <div className="cut-half cut-boss"><img src={`/textures/cutscene/boss-${enemyId}.jpg`} alt="" /></div>
        <div className="cut-lava" />
        <svg className="cut-crack" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path d={CRACK} className="cut-crack-glow2" />
          <path d={CRACK} className="cut-crack-glow" />
          <path d={CRACK} className="cut-crack-glass" />
        </svg>
        <div className="cut-slab cut-slab--hero"><div className="cut-slab-in">
          <small>Hero</small><b>{heroName}</b>
        </div></div>
        <div className="cut-slab cut-slab--boss"><div className="cut-slab-in">
          <small>Book {card.book}</small><b>{bossName}</b><i>{card.epithet}</i>
        </div></div>
        <div className="cut-vs" aria-hidden="true">VS</div>
      </div>
      <div className="cut-flash" />
      <div className="cut-white" />
      <p className="cut-hint">Press any key to skip</p>
    </div>
  );
}
