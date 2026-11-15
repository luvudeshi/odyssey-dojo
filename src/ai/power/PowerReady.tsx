// The "your god's power is ready" banner: bottom centre of the fight, while the power meter is full.
// It names the god, the move and how to throw it, and has Athena call the move aloud when the meter fills.
// While the meter is filling it is a small still plate beside the power ring, "Champion of Poseidon", so the god the
// scan found stays on screen through the fight. Mount it once inside the fight screen's root; it never takes a click.
import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { holdPowerSound } from "../../audio/powerSound";
import { speakPowerReady } from "../../audio/voice";
import { log } from "../../core/log";
import type { GodId } from "../gods/gods";
import { READY_START, champion, missed, nextCheckIn, powerPrompt, powerUsable, trackReady } from "./powerPrompt";
import type { PowerPrompt } from "./powerPrompt";
import "./powerReady.css";

export interface PowerReadyProps {
  /** The god the scan found; null for keyboard play or a skipped scan, when Athena lends her aegis. */
  readonly god: GodId | null;
  /** CombatState.power, 0 to 1. */
  readonly power: number;
  /** True when the fight is played on the keyboard: the banner then leads with the key. */
  readonly keyboard: boolean;
  /** CombatState.phase.kind. Given, the banner also leaves for the finishing move and the result, where the meter is of no use. */
  readonly phase?: string;
  /** True while the fight is paused: Athena does not speak until it runs again. */
  readonly paused?: boolean;
  /** Says the move aloud and returns whether it was heard. Defaults to Athena's voice; the lab page passes a silent one. */
  readonly announce?: (moveId: string) => boolean;
}

function safePrompt(god: GodId | null, keyboard: boolean): PowerPrompt | null {
  try {
    return powerPrompt(god, keyboard);
  } catch (error) {
    log("warn", "power_ready.prompt", error);
    return null;
  }
}

export function PowerReady(props: PowerReadyProps) {
  const { god, power, keyboard, phase, paused = false, announce = speakPowerReady } = props;
  const ready = powerUsable(power, phase);
  const prompt = ready ? safePrompt(god, keyboard) : null;
  const moveId = prompt?.moveId ?? null;
  const track = useRef(READY_START);

  // The power sounds like this god's own (src/audio/powerSound.ts) for as long as the banner is in the fight, full meter
  // or not: the engine's event does not name the god. No god: Athena's, as the banner says.
  useEffect(() => holdPowerSound(god), [god]);

  useEffect(() => {
    if (moveId === null) {
      track.current = READY_START;
      return;
    }
    if (paused) return;
    let timer: number | undefined;
    const check = (): void => {
      const now = performance.now();
      const result = trackReady(track.current, 1, now);
      let heard = true;
      if (result.announce) {
        try {
          heard = announce(moveId);
        } catch (error) {
          log("warn", "power_ready.announce", error);
        }
      }
      track.current = heard ? result.track : missed(result.track, now);
      const wait = nextCheckIn(track.current, now);
      // A little late rather than a little early, so the tracker's time has passed when it is asked again.
      if (wait !== null) timer = window.setTimeout(check, wait + 20);
    };
    check();
    return () => { window.clearTimeout(timer); };
  }, [moveId, paused, announce]);

  if (prompt === null) {
    const patron = champion(god, power, phase);
    if (patron === null) return null;
    return (
      <div className={`power-ready power-ready--champion power-ready--${patron.god}`} style={{ "--power-ready-accent": patron.accent } as CSSProperties}>
        <div className="power-ready__patron">
          <div className="power-ready__of">Champion of</div>
          <div className="power-ready__god">{patron.name}</div>
        </div>
      </div>
    );
  }
  const keys = keyboard && prompt.key !== null;
  const style = { "--power-ready-accent": prompt.accent } as CSSProperties;
  return (
    <div className={`power-ready power-ready--live power-ready--${prompt.god}${keys ? " power-ready--keys" : ""}`} style={style} role="status" aria-live="polite">
      <div className="power-ready__frame">
        <div className="power-ready__edge">
          <div className="power-ready__plate">
            <div className="power-ready__title">{prompt.title}</div>
            <div className="power-ready__move">{prompt.move}</div>
            <div className="power-ready__how">
              {keys ? (
                <>Press <kbd className="power-ready__key">{prompt.key}</kbd></>
              ) : (
                <>
                  {prompt.how}
                  {prompt.key !== null && <span className="power-ready__or"> or press <kbd className="power-ready__key">{prompt.key}</kbd></span>}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
