// Pure fit maths for RiggedModel, kept apart so tests can run it without a browser.
import { Vector3 } from "three";
import type { Box3 } from "three";

export interface ModelFit {
  /** World height the model is scaled to. */
  readonly targetHeight: number;
  /** Radians around Y, to turn a model that does not face +Z. Applied after centring, so the model turns about its centre. */
  readonly rotationY?: number;
  /** Extra offset after the feet are placed on the floor and the model is centred. */
  readonly offset?: readonly [number, number, number];
  /** Lift (model units, before scaling) for rigs whose lowest bone sits above the sole, since the fit measures bones, not mesh. */
  readonly footOffset?: number;
}

/** Below this a rig has no usable height (a lone bone, or a degenerate export), so it is left unscaled. */
export const MIN_SIZE = 1e-3;

export function fitModel(box: Box3, fit: ModelFit): { scale: number; position: [number, number, number] } {
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  const scale = size.y > MIN_SIZE ? fit.targetHeight / size.y : 1;
  return {
    scale,
    position: [
      -center.x * scale + (fit.offset?.[0] ?? 0),
      (-box.min.y + (fit.footOffset ?? 0)) * scale + (fit.offset?.[1] ?? 0),
      -center.z * scale + (fit.offset?.[2] ?? 0),
    ],
  };
}
