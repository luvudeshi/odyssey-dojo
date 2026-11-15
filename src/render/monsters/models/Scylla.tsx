// Scylla: six long necks reaching out of her cave halfway up the cliff, each with a head of three rows of teeth. Built
// entirely in code (see ../scylla/), so there is no file to fail to load; if the body itself throws, a plain stand-in
// shows and the fight goes on.
import type { MonsterProps } from "../../../core/types";
import { ErrorBoundary } from "../../ErrorBoundary";
import { ScyllaBody, ScyllaStandIn } from "../scylla/ScyllaBody";
import type { MonsterModel } from "../registry";

function Scylla(props: MonsterProps) {
  return (
    <ErrorBoundary label="monster:scylla" fallback={<ScyllaStandIn phaseIndex={props.phaseIndex} />}>
      <ScyllaBody {...props} />
    </ErrorBoundary>
  );
}

export const model: MonsterModel = { enemyId: "scylla", Component: Scylla };
