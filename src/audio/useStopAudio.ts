// The one call a fight makes for its stop's sound: ambience under the fight, the stop's clips for its events (through
// sfx.ts, which skips the usual sound when one plays), silence while paused, and a fade out on leaving.
// It also keeps the voices to the fight: a pause cuts the line being spoken, and leaving the fight cuts every line.
import { useEffect } from "react";
import { setEventOverride } from "./sfx";
import { pauseStopAmbience, playStopEvent, startStopAmbience, stopStopAmbience } from "./stopAudio";
import { pauseFightVoice, stopFightVoice } from "./voice";

export function useStopAudio(enemyId: string, paused: boolean): void {
  useEffect(() => {
    startStopAmbience(enemyId);
    setEventOverride((event) => playStopEvent(enemyId, event));
    return () => {
      setEventOverride(null);
      stopStopAmbience();
      // The fight is gone, so nothing of it is heard on the next screen. That screen's own lines start after this.
      stopFightVoice();
    };
  }, [enemyId]);
  useEffect(() => {
    pauseStopAmbience(paused);
    pauseFightVoice(paused);
    return () => { pauseStopAmbience(false); pauseFightVoice(false); };
  }, [paused]);
}
