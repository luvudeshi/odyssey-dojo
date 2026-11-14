// Full-screen burst when a player unleashes their god's power. Mount it once and bump `trigger` to play it.
import { memo, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { boltPath, boltPoints, pathThrough, seeded, speedStreaks, sunRayPath, waveBody, waveCrest } from "./powerShapes";
import type { Box } from "./powerShapes";
import "./powerEffect.css";

export type PowerGod = "zeus" | "poseidon" | "athena" | "hermes" | "artemis" | "apollo";

const DURATION_MS = 1500;
const SCREEN: Box = { x: 0, y: 0, width: 100, height: 100 };
const STUDS = Array.from({ length: 12 }, (_, i) => (i / 12) * Math.PI * 2);

function Bolt({ seed, x, late }: { seed: number; x: number; late: boolean }) {
  const lean = (seeded(seed)() - 0.5) * 24;
  const points = boltPoints([x, 0], [x + lean, 100], seed, SCREEN, 9);
  const [forkX, forkY] = points[4] ?? [x, 45];
  const d = `${pathThrough(points)} ${boltPath([forkX, forkY], [forkX - lean - 8, forkY + 26], seed + 1, SCREEN, 4)}`;
  return (
    <svg className={late ? "power-layer power-bolt power-late" : "power-layer power-bolt"} viewBox="0 0 100 100" preserveAspectRatio="none">
      <path className="power-bolt-glow" d={d} />
      <path className="power-bolt-core" d={d} />
    </svg>
  );
}

function Zeus({ seed }: { seed: number }) {
  const next = seeded(seed);
  return (
    <>
      <div className="power-layer power-flash" />
      {[24, 72, 48].map((x, i) => (
        <Bolt key={x} seed={seed * 3 + i} x={x + (next() - 0.5) * 14} late={i === 2} />
      ))}
    </>
  );
}

function Wave({ seed, back }: { seed: number; back: boolean }) {
  const id = back ? "power-sea-back" : "power-sea-front";
  const crest = waveCrest(SCREEN, seed);
  return (
    <svg className={back ? "power-wave power-wave-back" : "power-wave"} viewBox="0 0 100 100" preserveAspectRatio="none">
      <defs>
        <linearGradient id={id}>
          <stop offset="0" stopColor="#0b4f6c" stopOpacity="0" />
          <stop offset="0.35" stopColor="#0e7c8c" stopOpacity="0.78" />
          <stop offset="0.8" stopColor="#1fb5a6" stopOpacity="0.86" />
          <stop offset="1" stopColor="#bff4ec" stopOpacity="0.95" />
        </linearGradient>
      </defs>
      <path d={waveBody(SCREEN, seed)} fill={`url(#${id})`} />
      <path className="power-foam" d={crest} />
      <path className="power-foam power-spray" d={crest} transform="translate(-4 0)" />
    </svg>
  );
}

function Poseidon({ seed }: { seed: number }) {
  return (
    <>
      <Wave seed={seed + 1} back />
      <Wave seed={seed} back={false} />
    </>
  );
}

function Athena() {
  return (
    <>
      <svg className="power-shield" viewBox="-50 -50 100 100">
        <circle r="45" strokeWidth="5" />
        <circle r="37" strokeWidth="1.2" />
        <circle r="13" strokeWidth="2.5" />
        {STUDS.map((angle) => (
          <circle key={angle} className="power-stud" cx={Math.cos(angle) * 31} cy={Math.sin(angle) * 31} r="1.8" />
        ))}
      </svg>
      <div className="power-ring" />
      <svg className="power-spear" viewBox="0 0 240 12" preserveAspectRatio="none">
        <defs>
          <linearGradient id="power-shaft">
            <stop offset="0" stopColor="#e8b84a" stopOpacity="0" />
            <stop offset="1" stopColor="#e8b84a" />
          </linearGradient>
        </defs>
        <rect x="0" y="5" width="216" height="2" fill="url(#power-shaft)" />
        <path d="M 212 6 L 224 1 L 240 6 L 224 11 Z" fill="#fff3c4" />
      </svg>
    </>
  );
}

function Sandal({ ghost }: { ghost: number }) {
  return (
    <svg className={`power-ghost power-ghost-${String(ghost)}`} viewBox="0 0 120 70">
      <path
        className="power-wing"
        d="M 34 38 Q 14 34 2 14 Q 22 18 38 30 Z M 36 34 Q 20 22 16 2 Q 34 12 42 28 Z M 34 42 Q 16 44 4 32 Q 20 32 36 36 Z"
      />
      <path className="power-sole" d="M 30 56 Q 60 62 96 54 Q 110 50 116 42 L 118 48 Q 112 58 96 61 Q 60 68 30 62 Z" />
      <path className="power-strap" d="M 30 58 L 30 34 Q 40 29 48 34 L 52 58 M 32 44 L 66 60 M 48 36 L 88 57" />
    </svg>
  );
}

function Hermes({ seed }: { seed: number }) {
  return (
    <>
      {speedStreaks(16, seed).map((streak, i) => (
        <div
          key={i}
          className="power-streak"
          style={{
            top: `${String(streak.y)}%`,
            width: `${String(streak.length)}vw`,
            height: `${String(streak.weight)}px`,
            animationDelay: `${String(streak.delay)}ms`,
          }}
        />
      ))}
      <div className="power-sandal">
        {[3, 2, 1, 0].map((ghost) => (
          <Sandal key={ghost} ghost={ghost} />
        ))}
      </div>
    </>
  );
}

function Artemis() {
  return (
    <>
      <svg className="power-moon" viewBox="-25 -25 50 50">
        <path d="M 10 -17 A 20 20 0 1 0 10 17 A 18 18 0 1 1 10 -17 Z" />
      </svg>
      <svg className="power-arrow" viewBox="0 0 240 20">
        <defs>
          <linearGradient id="power-trail">
            <stop offset="0" stopColor="#e9eef7" stopOpacity="0" />
            <stop offset="1" stopColor="#e9eef7" stopOpacity="0.7" />
          </linearGradient>
        </defs>
        <rect x="0" y="8.5" width="110" height="3" fill="url(#power-trail)" />
        <path d="M 104 10 L 226 10" stroke="#e9eef7" strokeWidth="1.8" />
        <path d="M 240 10 L 212 4 L 222 10 L 212 16 Z M 100 10 L 94 3 L 108 3 L 114 10 L 108 17 L 94 17 Z" fill="#e9eef7" />
      </svg>
    </>
  );
}

function Apollo({ seed }: { seed: number }) {
  return (
    <>
      <div className="power-layer power-bloom" />
      <svg className="power-rays" viewBox="-50 -50 100 100">
        <defs>
          <radialGradient id="power-sunlight" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="50">
            <stop offset="0" stopColor="#fffdf0" />
            <stop offset="0.4" stopColor="#ffe08a" stopOpacity="0.8" />
            <stop offset="1" stopColor="#ffb347" stopOpacity="0" />
          </radialGradient>
        </defs>
        <path d={sunRayPath([0, 0], 3, 50, 18, seed)} fill="url(#power-sunlight)" />
      </svg>
      <div className="power-sun" />
    </>
  );
}

const LOOKS: Readonly<Record<PowerGod, (props: { seed: number }) => ReactNode>> = {
  zeus: Zeus,
  poseidon: Poseidon,
  athena: Athena,
  hermes: Hermes,
  artemis: Artemis,
  apollo: Apollo,
};

const Burst = memo(function Burst(props: { god: PowerGod; powerName: string; accent: string; seed: number }) {
  const { god, powerName, accent, seed } = props;
  const Look = LOOKS[god];
  return (
    <div className={`power-effect power-${god}`} style={{ color: accent }}>
      <div className="power-fx" aria-hidden="true">
        <div className="power-layer power-veil" />
        <Look seed={seed} />
      </div>
      <div className="power-name">{powerName}</div>
    </div>
  );
});

export function PowerEffect(props: { god: PowerGod | null; powerName: string; accent: string; trigger: number }) {
  const { god, powerName, accent, trigger } = props;
  const [seen, setSeen] = useState(0);
  const [playing, setPlaying] = useState(0);
  if (!Object.is(trigger, seen)) {
    setSeen(trigger);
    if (trigger !== 0 && Number.isFinite(trigger)) setPlaying(trigger);
  }

  useEffect(() => {
    if (playing === 0) return;
    const timer = window.setTimeout(() => { setPlaying(0); }, DURATION_MS);
    return () => { window.clearTimeout(timer); };
  }, [playing]);

  if (playing === 0 || god === null || !Object.hasOwn(LOOKS, god)) return null;
  return createPortal(
    <Burst key={playing} god={god} powerName={powerName} accent={accent} seed={playing} />,
    document.body,
  );
}
