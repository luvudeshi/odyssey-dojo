// Every gear piece by name: which bone it hangs on and how to draw it in a character's colours.
// Only the five bones the spartan's `Frame` knows a rest frame for are used, so every piece is sized in metres along
// the model's own axes.
import type { ReactNode } from "react";
import { BackShield } from "../../render/hero/gear/carriedGear";
import { Cape, Chiton, Cuirass, Greave, Helmet, LEATHER } from "../../render/hero/gear/spartanGear";
import type { GearId, Palette } from "../characters";
import { OwlShield, RoundShield, SlungTrident, Thunderbolt } from "./backGear";
import { Aegis, Cloak, Himation, HipSword, Kilt, PlainCuirass, PlainGreave, ScaleCuirass, Tunic } from "./bodyGear";
import { Beard, CrestedHelmet, Hair, LaurelWreath, TridentCrown } from "./headGear";

export const GEAR_BONES = ["Head", "spine_03", "pelvis", "calf_l", "calf_r"] as const;
export type GearBone = (typeof GEAR_BONES)[number];

export interface GearPiece {
  readonly bones: readonly GearBone[];
  readonly render: (palette: Palette) => ReactNode;
}

const BOTH_CALVES = ["calf_l", "calf_r"] as const;
const hairOf = (p: Palette): string => p.hair ?? p.cloth;

export const GEAR: Readonly<Record<GearId, GearPiece>> = {
  // Odysseus: the spartan's own pieces, untouched.
  corinthian_helmet: { bones: ["Head"], render: () => <Helmet /> },
  bronze_cuirass: { bones: ["spine_03"], render: () => <Cuirass /> },
  crimson_cape: { bones: ["spine_03"], render: () => <Cape /> },
  back_shield: { bones: ["spine_03"], render: () => <BackShield /> },
  chiton: { bones: ["pelvis"], render: () => <Chiton /> },
  greaves: { bones: BOTH_CALVES, render: () => <Greave /> },

  hair: { bones: ["Head"], render: (p) => <Hair color={hairOf(p)} /> },
  short_beard: { bones: ["Head"], render: (p) => <Beard color={hairOf(p)} length={0.15} /> },
  long_beard: { bones: ["Head"], render: (p) => <Beard color={hairOf(p)} length={0.3} /> },
  trident_crown: { bones: ["Head"], render: (p) => <TridentCrown color={p.accent} /> },
  laurel_wreath: { bones: ["Head"], render: (p) => <LaurelWreath color={p.metal} /> },
  athena_helmet: {
    bones: ["Head"],
    render: (p) => <CrestedHelmet metal={p.metal} trim={p.metalDark} stalk={p.accent} color={p.cloth} lift={0.07} height={0.13} thick={0.05} tail={0.34} />,
  },
  achilles_helmet: {
    bones: ["Head"],
    render: (p) => <CrestedHelmet metal={p.metal} trim={p.metal} color={p.accent} lift={0} height={0.21} thick={0.065} tail={0.3} />,
  },

  plain_cuirass: { bones: ["spine_03"], render: (p) => <PlainCuirass metal={p.metal} trim={p.metalDark} /> },
  dark_cuirass: { bones: ["spine_03"], render: (p) => <PlainCuirass metal={p.metalDark} trim={p.metal} belt={p.metal} /> },
  scale_cuirass: { bones: ["spine_03"], render: (p) => <ScaleCuirass metal={p.metal} trim={p.metalDark} belt={p.cloth} /> },
  tunic: { bones: ["spine_03"], render: (p) => <Tunic cloth={p.cloth} belt={p.metal} /> },
  aegis: { bones: ["spine_03"], render: (p) => <Aegis cloth={p.cloth} hem={p.accent} face={p.metalDark} /> },
  himation: { bones: ["spine_03"], render: (p) => <Himation cloth={p.cloth} clasp={p.metal} /> },
  short_cloak: { bones: ["spine_03"], render: (p) => <Cloak color={p.cloth} clasp={p.metal} length={0.56} width={0.52} /> },
  kilt: { bones: ["pelvis"], render: (p) => <Kilt color={p.cloth} /> },
  long_kilt: { bones: ["pelvis"], render: (p) => <Kilt color={p.cloth} length={0.48} hem={p.accent} /> },
  plain_greaves: { bones: BOTH_CALVES, render: (p) => <PlainGreave color={p.metal} /> },

  slung_trident: { bones: ["spine_03"], render: (p) => <SlungTrident metal={p.accent} /> },
  thunderbolt: { bones: ["spine_03"], render: (p) => <Thunderbolt color={p.metal} /> },
  owl_shield: { bones: ["spine_03"], render: (p) => <OwlShield face={p.metal} rim={p.metalDark} owl={p.cloth} eyes={p.accent} /> },
  round_shield: { bones: ["spine_03"], render: (p) => <RoundShield face={p.metalDark} rim={p.metal} /> },
  sword: { bones: ["pelvis"], render: (p) => <HipSword scabbard={LEATHER} hilt={p.metal} /> },
};
