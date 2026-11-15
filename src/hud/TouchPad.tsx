// Big touch buttons for a guest on a phone, where the camera is refused over plain http.
// One huge button throws the move the monster is asking for; a row below has the rest of the style's strikes.
import type { CombatState } from "../core/types";
import { MOVES } from "../moves/registry";
import { Button } from "../ui/pebble";

export function TouchPad(props: { state: CombatState; strikes: readonly string[]; onStrike: (move: string) => void }) {
  const { state, strikes, onStrike } = props;
  const asked = state.phase.kind === "strike" || state.phase.kind === "finisher" ? state.phase.move : null;
  const askedName = asked === null ? "" : MOVES.get(asked)?.prompt ?? asked;
  return (
    <div className="touchpad">
      <Button
        primary
        className="touch-main"
        disabled={asked === null}
        onPointerDown={(event) => { event.preventDefault(); if (asked !== null) onStrike(asked); }}
      >
        {asked === null ? "Wait for the opening" : `STRIKE: ${askedName}`}
      </Button>
      <div className="touch-row">
        {strikes.map((id) => (
          <Button key={id} onPointerDown={(event) => { event.preventDefault(); onStrike(id); }}>
            {MOVES.get(id)?.prompt ?? id}
          </Button>
        ))}
      </div>
    </div>
  );
}
