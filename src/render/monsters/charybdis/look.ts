// What Charybdis's body is doing, as numbers, from the fight's own state. Pure, so each attack's windup can be
// tested to look different without a browser. The component eases the live values toward these targets.

export interface Look {
  /** Left and right walls of water that rear up (0..1). A surge from one side shows only that side's wall. */
  wallLeft: number;
  wallRight: number;
  /** A column of water shooting up out of the throat, and the crest rearing over the player (0..1). */
  spout: number;
  /** The mouth gaping wider and the spin racing, with rings of water drawn into the throat (0..1). */
  pull: number;
  /** Funnel size, spin speed multiplier, fang scale and how open the eye is. */
  mouth: number;
  spin: number;
  fangs: number;
  eye: number;
  /** Extra height and forward lean of the crest. */
  crestLift: number;
  crestLean: number;
  /** 0 standing, 1 collapsed to a calm swirl. */
  collapse: number;
}

export const IDLE: Look = {
  wallLeft: 0, wallRight: 0, spout: 0, pull: 0, mouth: 1, spin: 1, fangs: 1, eye: 1, crestLift: 0, crestLean: 0, collapse: 0,
};

const ease = (p: number): number => {
  const t = Math.min(1, Math.max(0, p));
  return t * t * (3 - 2 * t);
};

/** Phase 0 the swallow, 1 the spew, 2 the fig tree: she grows hungrier and her fangs longer. */
export function lookFor(attackId: string | null, windup: number, defeated: boolean, phaseIndex: number): Look {
  if (defeated) return { ...IDLE, mouth: 0.55, spin: 0.15, fangs: 0, eye: 0, collapse: 1 };
  const w = ease(windup);
  const look: Look = { ...IDLE, fangs: 1 + phaseIndex * 0.18, spin: 1 + phaseIndex * 0.35 };
  switch (attackId) {
    case "surge_left":
      return { ...look, wallLeft: w, crestLean: 0.2 * w, spin: look.spin + 0.8 * w, eye: 1 - 0.35 * w };
    case "surge_right":
      return { ...look, wallRight: w, crestLean: 0.2 * w, spin: look.spin + 0.8 * w, eye: 1 - 0.35 * w };
    case "spout":
      return { ...look, spout: w, crestLift: 1.3 * w, crestLean: 0.55 * w, eye: 1 - 0.5 * w };
    case "undertow":
      return { ...look, pull: w, mouth: 1 + 0.2 * w, spin: look.spin + 3 * w, fangs: look.fangs + 0.3 * w, eye: 1 + 0.4 * w };
    default:
      return look;
  }
}

/** Palette per phase: deep, mid, foam, throat glow and the eye. Hex strings; the component lerps between them. */
export const PHASES = [
  { deep: "#06222e", mid: "#2a8c9c", foam: "#dff6f2", glow: "#2a8a78", eye: "#8cffd0", foamAmount: 0.9 },
  { deep: "#0b2230", mid: "#3a9aa0", foam: "#ffffff", glow: "#b0842a", eye: "#ffc24a", foamAmount: 1.5 },
  { deep: "#150c26", mid: "#4a58a8", foam: "#e8dcff", glow: "#a02a4a", eye: "#ff4a5a", foamAmount: 1.2 },
] as const;
