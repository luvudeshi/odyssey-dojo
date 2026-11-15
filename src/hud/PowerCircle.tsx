// The divine power meter at the bottom centre of the fight, in the Obsidian Rift look: a disc of black glass split by
// five cracks. Each fifth of power (one defend) sets one shard glowing from inside, and a lava ring round the glass
// fills smoothly with the exact share. At 100% every shard burns, the glass spikes round it grow lava veins, and the
// disc glows in the god's colour and beats. Reads only fight state, so camera and keyboard fights show the same thing.
// Nothing here runs a filter: a power change swaps fills and moves one dash offset; the beat is a transform.
import type { CSSProperties, ReactNode } from "react";
import { DISC } from "./sky/rift/geometry";
import { riftTextures } from "./sky/rift/lava";
import "./powerCircle.css";

const R = 46.5;
const LENGTH = 2 * Math.PI * R;
/** One defend fills a fifth of the meter (POWER_PER_DEFEND in the engine), so the disc is cut in fifths. */
const FIFTHS = 5;

export interface PowerCircleProps {
  /** CombatState.power, 0 to 1. */
  readonly power: number;
  /** True while the power-ready banner is on the bottom strip: the disc then sits just above it. */
  readonly lifted?: boolean;
  /** The god's colour; the star-chart gold when left out. */
  readonly accent?: string;
}

/** How lit shard `i` is: 1 burning, 0 cold glass, in between while its fifth fills. */
export function shardHeat(power: number, i: number): number {
  return Math.max(0, Math.min(1, power * FIFTHS - i));
}

export function PowerCircle({ power, lifted = false, accent }: PowerCircleProps): ReactNode {
  const f = Number.isFinite(power) ? Math.min(1, Math.max(0, power)) : 0;
  const full = f >= 1;
  const percent = Math.round(f * 100);
  const style = accent ? ({ "--pc-accent": accent } as CSSProperties) : undefined;
  const lava = riftTextures().lava;
  return (
    <div
      className={`power-circle${full ? " is-full" : ""}${lifted ? " is-lifted" : ""}`}
      style={style}
      role="meter"
      aria-label="Divine power"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <radialGradient id="pc-shade"><stop offset=".6" stopColor="#000" stopOpacity=".6" /><stop offset="1" stopColor="#000" stopOpacity="0" /></radialGradient>
          <radialGradient id="pc-halo"><stop offset=".45" className="power-circle__halo-stop" /><stop offset=".62" stopColor="#ff7a1a" stopOpacity=".55" /><stop offset="1" stopColor="#ff7a1a" stopOpacity="0" /></radialGradient>
          <radialGradient id="pc-hot" cx=".5" cy=".55" r=".65"><stop offset="0" stopColor="#fff0b0" /><stop offset=".3" stopColor="#ffa020" /><stop offset=".65" stopColor="#c8300a" /><stop offset="1" stopColor="#3a0a04" /></radialGradient>
          <linearGradient id="pc-glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3a3348" /><stop offset=".45" stopColor="#14111a" /><stop offset="1" stopColor="#060509" /></linearGradient>
          <pattern id="pc-lava" patternUnits="userSpaceOnUse" width="80" height="16"><image href={lava} width="80" height="16" preserveAspectRatio="none" /></pattern>
        </defs>
        <circle className="power-circle__halo" cx="50" cy="50" r="82" />
        <circle cx="50" cy="54" r="60" fill="url(#pc-shade)" />
        <g className="power-circle__spikes">
          {DISC.spikes.map((b) => (
            <g key={b.body}>
              <path d={b.body} className="power-circle__spike" />
              <path d={b.light} className="power-circle__spike-light" />
              <path d={b.edge} className="power-circle__spike-edge" />
              <path d={b.vein} className="power-circle__vein" />
            </g>
          ))}
        </g>
        {DISC.shards.map((d, i) => {
          const heat = shardHeat(f, i);
          return (
            <g key={d}>
              <path d={d} className="power-circle__shard" />
              {heat > 0 && (
                <g className="power-circle__melt" style={{ opacity: heat }}>
                  <path d={d} fill="url(#pc-hot)" />
                  <path d={d} fill="url(#pc-lava)" opacity=".3" />
                </g>
              )}
            </g>
          );
        })}
        <path d={DISC.rim} className="power-circle__edge" />
        {DISC.spokes.map((d, i) => (
          <path key={d} d={d} className={shardHeat(f, i) > 0 || shardHeat(f, i - 1) >= 1 ? "power-circle__crack is-lit" : "power-circle__crack"} />
        ))}
        <circle className="power-circle__track" cx="50" cy="50" r={R} />
        {f > 0 && (
          <circle
            className="power-circle__fill"
            cx="50"
            cy="50"
            r={R}
            strokeDasharray={LENGTH}
            strokeDashoffset={LENGTH * (1 - f)}
            transform="rotate(-90 50 50)"
          />
        )}
        <path d={DISC.hex} className="power-circle__gem" />
      </svg>
      <div className="power-circle__text">
        <strong>{full ? "FULL" : `${String(percent)}%`}</strong>
        <span>Power</span>
      </div>
    </div>
  );
}
