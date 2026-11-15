// What each phase looks like: a tint over the plumage, the colour of the eyes, and the colour of the song.
import { Color } from "three";

export interface PhaseLook {
  readonly tint: Color;
  readonly eye: Color;
  /** Linear, above 1 on purpose so the rings bloom. */
  readonly song: Color;
}

/** The Calm (bright violet and gold), the Song (flushed, eyes burning), the Meadow of Bones (dark, red-eyed). */
export const PHASE_LOOKS: readonly [PhaseLook, ...PhaseLook[]] = [
  { tint: new Color("#ffffff"), eye: new Color("#ffd070"), song: new Color(1.7, 1.3, 0.5) },
  { tint: new Color("#ffd8e4"), eye: new Color("#ff8a3a"), song: new Color(1.7, 0.8, 1.0) },
  { tint: new Color("#a67aa8"), eye: new Color("#ff1c30"), song: new Color(1.6, 0.4, 1.3) },
];
