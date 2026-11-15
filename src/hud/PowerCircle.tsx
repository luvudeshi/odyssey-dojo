// The divine power meter as a ring at the bottom centre of the fight. It fills with CombatState.power and, at 100%,
// turns solid, glows and pulses. Reads only fight state, so camera and keyboard fights show the same thing.
import type { CSSProperties, ReactNode } from "react";
import "./powerCircle.css";

const R = 41;
const LENGTH = 2 * Math.PI * R;
/** One defend fills a fifth of the meter (POWER_PER_DEFEND in the engine), so the ring is marked in fifths. */
const TICKS = [0, 1, 2, 3, 4];

export interface PowerCircleProps {
  /** CombatState.power, 0 to 1. */
  readonly power: number;
  /** True while the power-ready banner is on the bottom strip: the ring then sits just above it. */
  readonly lifted?: boolean;
  /** The god's colour; the star-chart gold when left out. */
  readonly accent?: string;
}

export function PowerCircle({ power, lifted = false, accent }: PowerCircleProps): ReactNode {
  const f = Number.isFinite(power) ? Math.min(1, Math.max(0, power)) : 0;
  const full = f >= 1;
  const percent = Math.round(f * 100);
  const style = accent ? ({ "--pc-accent": accent } as CSSProperties) : undefined;
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
        <circle className="power-circle__ground" cx="50" cy="50" r="47" />
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
        {TICKS.map((tick) => (
          <line key={tick} className="power-circle__tick" x1="50" y1="4" x2="50" y2="14" transform={`rotate(${String(tick * 72)} 50 50)`} />
        ))}
      </svg>
      <div className="power-circle__text">
        <strong>{full ? "FULL" : `${String(percent)}%`}</strong>
        <span>Power</span>
      </div>
    </div>
  );
}
