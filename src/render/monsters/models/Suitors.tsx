// The Suitors (Odyssey book 22): Antinous in front, a noble in purple and gold larger than life, with four more
// suitors behind him. Spears fly from the side the attack comes from, the men fall as the phases pass.
import { useMemo } from "react";
import type { ReactNode } from "react";
import type { MonsterModel } from "../registry";
import type { MonsterProps } from "../../../core/types";
import { BoneMount } from "../../models/boneMount";
import { Figure } from "../suitors/Figure";
import { Cloak, Cuirass, Cup, Helm, Hoof, Pauldron, RoundShield, Skirt, Spear, Sword, TableShield } from "../suitors/gear";
import {
  ANTINOUS_HEIGHT, ANTINOUS_PALETTE, EXTRAS, antinousClips, antinousLook, extraClips, gearScale, handProp, isFallen, turnFor,
} from "../suitors/look";
import type { Extra } from "../suitors/look";

const BRONZE = "#b98a3e";
const FLIP: [number, number, number] = [0, 0, Math.PI];

function Antinous(props: MonsterProps) {
  const { attackId, phaseIndex, windup } = props;
  const look = antinousLook(phaseIndex);
  const k = gearScale(ANTINOUS_HEIGHT);
  const palette = ANTINOUS_PALETTE;
  const held = handProp(attackId, look);
  const glow = windup > 0.15 ? 1 : 0;
  const anchors = useMemo((): Record<string, ReactNode> => ({
    Head: <BoneMount follow><group scale={k}><Helm palette={palette} plume={look.plume} metal={palette.trim} /></group></BoneMount>,
    spine_03: <BoneMount>{<group scale={k}><Cuirass palette={palette} armour={look.cuirass} />{look.cloak && <Cloak palette={palette} />}</group>}</BoneMount>,
    pelvis: <BoneMount><group scale={k}><Skirt palette={palette} /></group></BoneMount>,
    upperarm_l: <BoneMount><group scale={k}><Pauldron palette={palette} /></group></BoneMount>,
    upperarm_r: <BoneMount><group scale={k}><Pauldron palette={palette} /></group></BoneMount>,
    hand_r: held === "none" ? null : (
      <BoneMount follow>
        <group scale={k} rotation={FLIP}>
          {held === "hoof" && <Hoof />}
          {held === "spear" && <Spear glow={glow} />}
          {held === "sword" && <Sword palette={palette} />}
        </group>
      </BoneMount>
    ),
    hand_l: (
      <BoneMount>
        <group scale={k}>
          {look.guard === "cup" && <Cup palette={palette} />}
          {look.guard === "round" && <RoundShield palette={palette} />}
          {look.guard === "table" && <TableShield />}
        </group>
      </BoneMount>
    ),
  }), [k, palette, look.plume, look.cuirass, look.cloak, look.guard, held, glow]);
  return (
    <Figure
      meshHeight={ANTINOUS_HEIGHT}
      palette={palette}
      clips={antinousClips(phaseIndex)}
      state={props}
      anchors={anchors}
      yaw={turnFor(attackId)}
      fallen={props.defeated}
      standInGear={<Helm palette={palette} plume={look.plume} metal={palette.trim} />}
    />
  );
}

function Other({ extra, props }: { extra: Extra; props: MonsterProps }) {
  const k = gearScale(extra.height);
  const active = extra.throws !== null && props.attackId === extra.throws;
  const state = useMemo(
    () => ({ windup: active ? props.windup : 0, attackId: active ? extra.throws : null, defeated: props.defeated || isFallen(extra, props.phaseIndex, false), phaseIndex: props.phaseIndex, hitFlash: props.defeated ? 0 : props.hitFlash * 0.6 }),
    [active, props.windup, props.defeated, props.phaseIndex, props.hitFlash, extra],
  );
  const glow = active && props.windup > 0.15 ? 1 : 0;
  const { palette } = extra;
  const anchors = useMemo((): Record<string, ReactNode> => ({
    Head: <BoneMount follow><group scale={k}><Helm palette={palette} plume={0.5} metal={BRONZE} /></group></BoneMount>,
    spine_03: <BoneMount><group scale={k}><Cuirass palette={palette} armour={false} /><Cloak palette={palette} /></group></BoneMount>,
    pelvis: <BoneMount><group scale={k}><Skirt palette={palette} /></group></BoneMount>,
    hand_r: <BoneMount follow><group scale={k} rotation={FLIP}><Spear glow={glow} /></group></BoneMount>,
  }), [k, palette, glow]);
  return (
    <Figure
      meshHeight={extra.height}
      palette={palette}
      clips={extraClips(extra)}
      state={state}
      anchors={anchors}
      x={extra.x}
      z={extra.z}
      yaw={extra.yaw}
      fallen={isFallen(extra, props.phaseIndex, props.defeated)}
      lite
      standInGear={<Helm palette={palette} plume={0.5} metal={BRONZE} />}
    />
  );
}

export function Suitors(props: MonsterProps) {
  return (
    <>
      <Antinous {...props} />
      {EXTRAS.map((extra) => <Other key={extra.id} extra={extra} props={props} />)}
    </>
  );
}

export const model: MonsterModel = { enemyId: "suitors", Component: Suitors };
