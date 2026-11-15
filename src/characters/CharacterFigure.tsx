// A character standing in idle on the real rigged body, for the picker and the demo page: the spartan's own file,
// height and skin, with `anchorsFor(id)` as its gear. Facing +z (toward a camera on +z), feet on y = 0.
// It suspends while the GLB loads, so wrap it in <Suspense>.
import { candidate as spartan } from "../render/hero/defs/spartan";
import { RiggedModel } from "../render/models/RiggedModel";
import type { ModelFit } from "../render/models/RiggedModel";
import type { ClipDecision } from "../render/models/clipMap";
import { anchorsFor } from "./anchors";
import type { CharacterId } from "./characters";

// The fight turns him away from the camera and steps him back; here he stands on the spot and faces it.
const FIT: ModelFit = { targetHeight: spartan.fit.targetHeight };

function idle(available: ReadonlySet<string>, out: ClipDecision): ClipDecision {
  out.clip = available.has(spartan.rig.idle) ? spartan.rig.idle : null;
  out.loop = true;
  out.scrub = null;
  out.timeScale = 1;
  return out;
}

export function CharacterFigure({ id }: { id: CharacterId }) {
  return <RiggedModel url={spartan.url} fit={FIT} tweakMaterial={spartan.tweakMaterial} anchors={anchorsFor(id)} decide={idle} />;
}
