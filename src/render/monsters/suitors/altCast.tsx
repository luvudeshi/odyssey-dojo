// Who stands where in the alternate looks, and what each holds. Look a: KayKit Knight and Barbarian (rigged, 16 clips each).
// Look b: Gobkit court and warrior men (one shared rig, baked weapons). Positions, heights and who falls when come from look.ts.
import { useMemo } from "react";
import type { MonsterProps } from "../../../core/types";
import type { MonsterClipConfig } from "../../models/clipMap";
import { AltFigure } from "./alt";
import type { AltSpec, Prop } from "./alt";
import { ANTINOUS_HEIGHT, ANTINOUS_PALETTE, EXTRAS, isFallen, turnFor } from "./look";
import type { Extra } from "./look";

const KAY_WEAPONS = ["1H_Sword", "2H_Sword", "1H_Sword_Offhand", "Badge_Shield", "Rectangle_Shield", "Round_Shield", "Spike_Shield", "1H_Axe", "2H_Axe", "1H_Axe_Offhand", "Mug"];
const KAY = { boneRatio: 0.57, weapons: KAY_WEAPONS, head: "head", hand: "handslotr", helmY: null, helmSize: 1, handTurn: [0, 0, 0] } as const;

const KNIGHT: AltSpec = { ...KAY, url: "/models/suitors/kay_Knight.glb", tint: "#ffe2c0", hidden: [] };
const BARB: AltSpec = { ...KAY, url: "/models/suitors/kay_Barbarian.glb", tint: "#ffd7b0", hidden: ["Barbarian_Hat"] };

// Gobkit: 13 bones with scrambled names, the head is the last leaf and the arms end in the two x=+-0.053 bones.
function gob(file: string, head: string, hand: string, tint: string): AltSpec {
  return { url: `/models/suitors/gob_${file}.glb`, boneRatio: 0.38, footOffset: 0.014, tint, weapons: [], hidden: [], head, hand, helmY: null, helmSize: 1, handTurn: [0, 0, 0] };
}
const KING = gob("King", "tvbace", "vsfhv4", "#ffffff");
const HEAVY = gob("HeavyWarrior", "tvbace", "vsfhv4", "#ffe6cc");
const CAPTAIN = gob("KnightCaptain", "tvbace", "vsfhv4", "#ffe6cc");
const PRINCE = gob("Prince", "gbx8vc", "mvzhrd", "#ffffff");
const HALB = gob("PalaceHalberdier", "tvbace", "vsfhv4", "#ffe6cc");

export type AltLook = "a" | "b";

function kayClips(idle: string): MonsterClipConfig {
  return {
    idle,
    windup: {
      default: "1H_Melee_Attack_Chop",
      byAttackId: { ox_hoof: "1H_Melee_Attack_Chop", spear_left: "Throw", spear_right: "Throw", sword_rush: "2H_Melee_Attack_Spin" },
    },
    hit: "Hit_A",
    death: "Death_A",
  };
}

function gobClips(): MonsterClipConfig {
  return { idle: "Idle", windup: { default: "Attack" }, hit: "Hit", death: "Death" };
}

function propFor(attackId: string | null, windup: number): { prop: Prop; glow: number } {
  if (attackId === "ox_hoof" && windup > 0) return { prop: "hoof", glow: 0 };
  if ((attackId === "spear_left" || attackId === "spear_right") && windup > 0) return { prop: "spear", glow: windup > 0.15 ? 1 : 0 };
  return { prop: null, glow: 0 };
}

/** Antinous holds a mug at the feast, then an axe and a round shield, then both hands on the great axe. */
function antinousShown(phase: number): readonly string[] {
  if (phase <= 0) return ["Mug"];
  return phase === 1 ? ["1H_Axe", "Round_Shield"] : ["2H_Axe"];
}

const EXTRA_KAY: Record<Extra["id"], { spec: AltSpec; shown: readonly string[]; idle: string }> = {
  left: { spec: KNIGHT, shown: ["1H_Sword", "Round_Shield"], idle: "Idle" },
  right: { spec: BARB, shown: ["Mug"], idle: "Use_Item" },
  rear: { spec: BARB, shown: ["1H_Axe", "Round_Shield"], idle: "Idle" },
  rearB: { spec: KNIGHT, shown: ["1H_Sword"], idle: "2H_Melee_Idle" },
};
const EXTRA_GOB: Record<Extra["id"], AltSpec> = { left: HEAVY, right: CAPTAIN, rear: HALB, rearB: PRINCE };

export function AltSuitors({ look, props }: { look: AltLook; props: MonsterProps }) {
  const a = look === "a";
  const phase = props.phaseIndex;
  const { prop, glow } = propFor(props.attackId, props.windup);
  const antClips = useMemo(() => (a ? kayClips(phase === 0 ? "Use_Item" : phase === 1 ? "Idle" : "2H_Melee_Idle") : gobClips()), [a, phase]);
  const gearHeld = a ? antinousShown(phase) : [];
  return (
    <>
      <AltFigure
        spec={a ? BARB : KING}
        height={ANTINOUS_HEIGHT}
        clips={antClips}
        state={props}
        shown={prop === null ? gearHeld : gearHeld.filter((n) => n !== "1H_Axe" && n !== "2H_Axe" && n !== "Mug")}
        prop={prop}
        glow={glow}
        palette={ANTINOUS_PALETTE}
        yaw={turnFor(props.attackId)}
      />
      {EXTRAS.map((extra) => <Other key={extra.id} extra={extra} props={props} a={a} />)}
    </>
  );
}

function Other({ extra, props, a }: { extra: Extra; props: MonsterProps; a: boolean }) {
  const active = extra.throws !== null && props.attackId === extra.throws;
  const state = useMemo(
    () => ({ windup: active ? props.windup : 0, attackId: active ? extra.throws : null, defeated: props.defeated || isFallen(extra, props.phaseIndex, false), phaseIndex: props.phaseIndex, hitFlash: props.defeated ? 0 : props.hitFlash * 0.6 }),
    [active, props.windup, props.defeated, props.phaseIndex, props.hitFlash, extra],
  );
  const { prop, glow } = active ? propFor(extra.throws, props.windup) : { prop: null, glow: 0 };
  const kay = EXTRA_KAY[extra.id];
  const clips = useMemo(() => (a ? kayClips(kay.idle) : gobClips()), [a, kay.idle]);
  const held = prop === null ? kay.shown : kay.shown.filter((n) => n === "Round_Shield");
  return (
    <AltFigure
      spec={a ? kay.spec : EXTRA_GOB[extra.id]}
      height={extra.height}
      clips={clips}
      state={state}
      shown={a ? held : []}
      prop={prop}
      glow={glow}
      palette={extra.palette}
      x={extra.x}
      z={extra.z}
      yaw={extra.yaw}
    />
  );
}
