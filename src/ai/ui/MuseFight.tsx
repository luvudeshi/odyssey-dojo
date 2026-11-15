// The Muse's fight from start to finish: the "How do you fight?" screen, the made fight on the normal fight screen, and its own ending.
// It stands outside the quest. A made fight carries the id of the quest stop that lends it a model and an arena, so it must
// never be reported to the quest as that stop beaten. This component is given no way to report anything: its only way out is onLeave.
import { useState } from "react";
import { startMusic } from "../../audio/music";
import type { EnemySpec, FightingStyle } from "../../core/types";
import type { PoseTracker } from "../../pose/tracker";
import { WebcamGate } from "../../screens/WebcamGate";
import { Button, PebbleHeading } from "../../ui/pebble";
import type { GodId, LevelSpec } from "../contracts";
import { RIVALS } from "../rivals";
import { StyleScreen } from "./StyleScreen";

/** The god of a player who has none: keyboard play, or a skipped scan. The fight screen lends the same one. */
const PATRON: GodId = "athena";

interface Made {
  readonly enemy: EnemySpec;
  readonly level: LevelSpec;
  /** Changes for every new attempt, so the fight screen starts afresh. */
  readonly seed: number;
}

export function MuseFight(props: {
  style: FightingStyle;
  /** Null for keyboard play. */
  tracker: PoseTracker | null;
  /** What the god scan found; null when there was none. */
  god: { readonly god: GodId; readonly rivalGod: GodId; readonly epithet: string } | null;
  /** Back to the quest map. Nothing is handed back: the quest learns nothing about this fight. */
  onLeave: () => void;
}) {
  const { style, tracker, god, onLeave } = props;
  const [made, setMade] = useState<Made | null>(null);

  if (!made) {
    const mine = god?.god ?? PATRON;
    return (
      <StyleScreen
        god={mine}
        rivalGod={god?.rivalGod ?? RIVALS[mine]}
        {...(god ? { epithet: god.epithet } : {})}
        onDone={(fight) => { setMade({ enemy: fight.enemy, level: fight.level, seed: Date.now() }); }}
        onBack={onLeave}
      />
    );
  }

  // The fight screen leaves its own music playing (fight, win or loss), and the quest's screen does not change when this one ends.
  const leave = (): void => { startMusic("menu"); onLeave(); };
  const again = (): void => { setMade({ ...made, seed: Date.now() }); };
  const ask = (): void => { startMusic("menu"); setMade(null); };
  return (
    <WebcamGate
      key={made.seed}
      enemy={made.enemy}
      style={style}
      tracker={tracker}
      seed={made.seed}
      god={god?.god ?? null}
      onRestart={again}
      onQuit={leave}
      // Laid out by the result panel's own classes (src/screens/endPanel.css): the title here takes the place of the fight
      // screen's headline, which words a made monster as the quest stop that lends it a body ("... fall" for one Siren).
      renderEnd={(won) => (
        <>
          <PebbleHeading as="div" className={`end-title ${won ? "" : "end-lost"}`} text={won ? `Victory over ${made.enemy.name}` : "You are struck down"} px={40} tone={won ? "ochre" : "terra"} />
          <div className="end-ending">
            <p className="end-line">{won ? made.level.narration_outro_win : made.level.narration_outro_lose}</p>
          </div>
          <div className="end-buttons">
            <Button primary autoFocus onClick={again}>Fight again</Button>
            <Button onClick={ask}>Ask the Muse again</Button>
            <Button onClick={leave}>Back to the map</Button>
          </div>
        </>
      )}
    />
  );
}
