// The one call a fight makes for its stop's sound: ambience under the fight, the stop's clips for its events (through
// sfx.ts, which skips the usual sound when one plays), silence while paused, and a fade out on leaving.
// It also keeps the voices to the fight: a pause cuts the line being spoken, and leaving the fight cuts every line.
import { useEffect } from "react";
import { setEventOverride } from "./sfx";
import { pauseStopAmbience, playStopEvent, startStopAmbience, stopStopAmbience } from "./stopAudio";
import { enterFightVoice, leaveFightVoice, pauseFightVoice } from "./voice";

export function useStopAudio(enemyId: string, paused: boolean): void {
  useEffect(() => {
    enterFightVoice();
    startStopAmbience(enemyId);
    setEventOverride((event) => playStopEvent(enemyId, event));
    return () => {
      setEventOverride(null);
      stopStopAmbience();
      // The fight is gone, so nothing of it is heard on the next screen. That screen's own lines start after this.
      // Homer's line before the stop is the one exception: it plays on if a fight screen mounts again at once.
      leaveFightVoice();
    };
  }, [enemyId]);
  useEffect(() => {
    pauseStopAmbience(paused);
    pauseFightVoice(paused);
    return () => { pauseStopAmbience(false); pauseFightVoice(false); };
  }, [paused]);
}
