// How a Siren holds herself, as plain numbers, so the rules can be tested without a browser. Every attack in the
// data has its own readable windup: the SONG opens both wings and arms and throws the head back, a SWOOP rears
// toward the side it comes from (that wing big and raised, body leaning that way), the TALON DIVE rises with
// both wings high and drives the claws out at the hero. Angles are radians. "Left" is the viewer's left (-x).

export interface SirenPose {
  /** Whole body: sideways, up and back shift in metres, lean forward (+) / back (-) and roll to the left (+). */
  x: number; y: number; z: number; lean: number; roll: number;
  /** Chest and head: bend forward (+), head tilt back (-), head turn toward the right (+). */
  torsoBend: number; headX: number; headY: number;
  /** 0..1 mouth open. */
  mouth: number;
  /** Wing spar angle above horizontal, cup forward toward the hero, and length scale, for each side. */
  wingL: number; wingR: number; cupL: number; cupR: number; spanL: number; spanR: number;
  /** Arm raised outward and forward, elbow bend. */
  armOutL: number; armOutR: number; armFwd: number; elbow: number;
  /** Legs swung forward (-), claws spread 0..1, legs folded 0..1 (resting on the ground when she has fallen). */
  legSwing: number; claws: number; legFold: number;
  /** 0..1 how loud the song is: drives the rings and notes. */
  song: number;
  eyesOpen: boolean;
}

export interface SirenInput {
  readonly windup: number;
  readonly attackId: string | null;
  readonly defeated: boolean;
  readonly phaseIndex: number;
  readonly hitFlash: number;
  /** Seconds, for the idle flutter. */
  readonly time: number;
  /** The second Siren only joins the song; the lead alone shows the other attack cues. */
  readonly lead: boolean;
}

export function makePose(): SirenPose {
  return {
    x: 0, y: 0, z: 0, lean: 0, roll: 0, torsoBend: 0, headX: 0, headY: 0, mouth: 0,
    wingL: 0, wingR: 0, cupL: 0, cupR: 0, spanL: 1, spanR: 1,
    armOutL: 0, armOutR: 0, armFwd: 0, elbow: 0, legSwing: 0, claws: 0, legFold: 0, song: 0, eyesOpen: true,
  };
}

/** Wing height, flutter size and flutter speed for each phase: calm, then restless, then wild. */
const PHASE_WINGS: readonly { readonly rest: number; readonly flap: number; readonly rate: number }[] = [
  { rest: 0.35, flap: 0.07, rate: 2.0 },
  { rest: 0.6, flap: 0.14, rate: 3.0 },
  { rest: 0.85, flap: 0.22, rate: 4.2 },
];
const CALM = { rest: 0.35, flap: 0.07, rate: 2.0 } as const;

const smooth = (p: number): number => p * p * (3 - 2 * p);
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** Writes the pose into `out`. */
export function sirenPose(out: SirenPose, input: SirenInput): SirenPose {
  const { windup, attackId, defeated, phaseIndex, hitFlash, time, lead } = input;
  const look = PHASE_WINGS[Math.min(Math.max(phaseIndex, 0), PHASE_WINGS.length - 1)] ?? CALM;
  const { rest } = look;
  const flap = Math.sin(time * look.rate) * look.flap;
  Object.assign(out, makePose());

  // Idle: wings fluttering, chest breathing, head swaying a little, mouth parted.
  out.wingL = rest + flap; out.wingR = rest - flap * 0.9 + 0.03;
  out.cupL = out.cupR = 0.2;
  out.armOutL = out.armOutR = 0.28 + Math.sin(time * 1.3) * 0.03;
  out.armFwd = 0.15; out.elbow = 0.25;
  out.headY = Math.sin(time * 0.7) * 0.12;
  out.headX = Math.sin(time * 0.9) * 0.04;
  out.y = Math.max(0, Math.sin(time * 2.0 + (lead ? 0 : 1.7))) * 0.05;
  out.mouth = 0.12 + Math.max(0, Math.sin(time * 1.1)) * 0.1;
  out.legSwing = 0.05;

  if (defeated) {
    // Fallen onto her own meadow: belly on the ground, head bowed, wings sprawled, eyes shut.
    Object.assign(out, makePose());
    out.y = -0.35; out.torsoBend = 0.35; out.headX = 0.75; out.headY = 0.2;
    out.wingL = out.wingR = -0.38; out.spanL = out.spanR = 1.1;
    out.armOutL = out.armOutR = 0.25; out.armFwd = 0.3; out.elbow = 0.5;
    out.legFold = 1; out.eyesOpen = false;
    return out;
  }

  const w = smooth(clamp01(windup));
  if (attackId === "song" || (!lead && attackId !== null)) {
    // Both wings and arms open wide, head thrown back so the throat shows, mouth wide, rings from the throat.
    out.wingL = out.wingR = rest + (1.05 - rest) * w + flap * (1 - w);
    out.cupL = out.cupR = 0.2 + 0.45 * w;
    out.armOutL = out.armOutR = 0.28 + 0.95 * w;
    out.armFwd = 0.15 + 0.7 * w; out.elbow = 0.25 + 0.3 * w;
    out.headX = -0.5 * w; out.headY *= 1 - w;
    out.mouth = 0.12 + 0.88 * w;
    out.torsoBend = -0.1 * w;
    out.song = clamp01(windup * 5);
  } else if (lead && (attackId === "swoop_left" || attackId === "swoop_right")) {
    // Rear toward the side she comes from: that wing high and wide, the other folded in, body heeling over.
    const side = attackId === "swoop_left" ? 1 : -1; // +1 is the viewer's left
    const near = rest + (1.15 - rest) * w;
    const far = rest + (-0.75 - rest) * w;
    out.wingL = side > 0 ? near : far; out.wingR = side > 0 ? far : near;
    out.cupL = side > 0 ? 0.2 + 0.5 * w : 0.1; out.cupR = side > 0 ? 0.1 : 0.2 + 0.5 * w;
    out.spanL = side > 0 ? 1 + 0.18 * w : 1 - 0.3 * w; out.spanR = side > 0 ? 1 - 0.3 * w : 1 + 0.18 * w;
    out.x = -side * 2.0 * w * w; out.roll = side * 0.4 * w; out.lean = 0.12 * w;
    out.headY = -side * 0.7 * w; out.torsoBend = 0.2 * w;
    out.armOutL = side > 0 ? 0.28 + 1.1 * w : 0.2; out.armOutR = side > 0 ? 0.2 : 0.28 + 1.1 * w;
    out.mouth = 0.12 + 0.6 * w;
    out.legSwing = 0.05 - 0.5 * w;
  } else if (lead && attackId === "talons") {
    // Up and over the hero: wings high, claws driven forward and spread.
    out.wingL = out.wingR = rest + (1.3 - rest) * w;
    out.cupL = out.cupR = 0.2 + 0.4 * w;
    out.y = 1.1 * w; out.lean = -0.28 * w;
    out.legSwing = 0.05 - 1.3 * w; out.claws = w;
    out.armOutL = out.armOutR = 0.28 + 0.2 * w; out.armFwd = 0.15 + 0.8 * w;
    out.headX = 0.25 * w; out.mouth = 0.12 + 0.7 * w;
  }

  // A hit throws the head back and flares the wings.
  out.headX -= 0.45 * hitFlash;
  out.wingL += 0.3 * hitFlash; out.wingR += 0.3 * hitFlash;
  out.z -= 0.25 * hitFlash;
  out.mouth = Math.max(out.mouth, 0.5 * hitFlash);
  return out;
}
