// The one call a fight makes for its stop's sound: ambience under the fight, the stop's clips for its events (through
// sfx.ts, which skips the usual sound when one plays), silence while paused, and a fade out on leaving.
import { useEffect } from "react";
import { setEventOverride } from "./sfx";
import { pauseStopAmbience, playStopEvent, startStopAmbience, stopStopAmbience } from "./stopAudio";

export function useStopAudio(enemyId: string, paused: boolean): void {
  useEffect(() => {
    startStopAmbience(enemyId);
    setEventOverride((event) => playStopEvent(enemyId, event));
    return () => {
      setEventOverride(null);
      stopStopAmbience();
    };
  }, [enemyId]);
  useEffect(() => {
    pauseStopAmbience(paused);
    return () => { pauseStopAmbience(false); };
  }, [paused]);
}
