// Carries the hero's model to the monster on a counted strike (the rule and timing are in ../strikeReach.ts). Each
// frame it reads where his fists, feet, knees and any held blade's tip are, picks the one striking, and moves his whole
// body along a jump's arc so that limb meets the contact point on arrival. leapPose.ts acts the jump out with his legs
// first, so the limb is measured in the pose the player sees. Writes battle.reachX/Y/Z; the hero's group adds them.
import { Vector3 } from "three";
import type { Object3D } from "three";
import { battle } from "../battle";
import { KICKS, REACH, arcHeight, contactPoint, strikingLimb, travel } from "../strikeReach";
import type { Leap } from "../strikeReach";

const LIMB_BONES: readonly string[] = ["hand_l", "hand_r", "foot_l", "foot_r", "calf_l", "calf_r"];
const FEET: ReadonlySet<string> = new Set(["foot_l", "foot_r"]);
/** The knee joints (where the shin bones start): only a knee strike lands with one. */
const KNEES: ReadonlySet<string> = new Set(["calf_l", "calf_r"]);
/** Name of the point of the held spear and stake (gear/carriedGear.tsx), so a blade's tip can strike. */
export const STRIKE_TIP = "strikeTip";
/** Used when the model has none of the limbs: a fist a little ahead of the chest. */
const FALLBACK_LIMB: readonly [number, number, number] = [0, 1.3, -1.2];

function shown(node: Object3D): boolean {
  for (let n: Object3D | null = node; n; n = n.parent) if (!n.visible) return false;
  return true;
}

export interface HeroReach {
  /** `group` is the hero's own group and `home` its mark before any reach; call once the pose is final. */
  update(group: Object3D, home: readonly [number, number, number], now: number, leap: Leap): void;
}

export function createReach(root: Object3D): HeroReach {
  const limbs: Object3D[] = [];
  root.traverse((node) => {
    if (LIMB_BONES.includes(node.name) && !limbs.some((limb) => limb.name === node.name)) limbs.push(node);
  });
  const locals: ([number, number, number] | null)[] = [];
  const world = new Vector3();
  const grip = new Vector3();
  const base = new Vector3();
  const contact: [number, number, number] = [0, 0, 0];
  const toTarget: [number, number, number] = [0, 0, 0];
  const offset: [number, number, number] = [0, 0, 0];
  let tipsFound = false;
  let at = -Infinity;
  let landed = false;

  const measure = (node: Object3D): void => {
    const move = battle.struckMove;
    if (!shown(node) || (FEET.has(node.name) && !KICKS.has(move)) || (KNEES.has(node.name) && move !== "knee")) { locals.push(null); return; }
    node.getWorldPosition(world);
    const gear = node.name === STRIKE_TIP ? node.parent : null;
    if (gear) {
      // A blade is still growing to full size as it is drawn; measure its point where it will be once drawn, or the
      // body would leap short and the point overshoot into the monster as it finished growing.
      const s = gear.scale.x;
      if (s < 0.05) { locals.push(null); return; }
      gear.getWorldPosition(grip);
      world.sub(grip).divideScalar(s).add(grip);
    }
    world.sub(base);
    locals.push([world.x, world.y, world.z]);
  };

  return {
    update(group, home, now, leap) {
      const since = now - battle.reachAt;
      if (!battle.hitSpot || (leap.across === 0 && leap.up === 0 && leap.arc === 0)) {
        battle.reachX = 0; battle.reachY = 0; battle.reachZ = 0;
        return;
      }
      if (at !== battle.reachAt) { at = battle.reachAt; landed = false; }
      // Tracks the striking limb on the way out and on the frame it lands; after that the body holds where it struck
      // and the limb recoils on its own, so he does not float on after the blow.
      if (!landed) {
        // The gear mounts on the bones after the model is prepared, so its tips are looked up on first use.
        if (!tipsFound) {
          root.traverse((node) => { if (node.name === STRIKE_TIP) limbs.push(node); });
          tipsFound = true;
        }
        group.getWorldPosition(base);
        locals.length = 0;
        limbs.forEach(measure);
        contactPoint(battle.hitSpot, contact);
        toTarget[0] = contact[0] - home[0]; toTarget[1] = contact[1] - home[1]; toTarget[2] = contact[2] - home[2];
        travel(contact, home, locals[strikingLimb(locals, toTarget)] ?? FALLBACK_LIMB, offset);
        landed = since >= REACH.out;
      }
      const arc = arcHeight(Math.hypot(offset[0], offset[2])) * leap.arc;
      battle.reachX = offset[0] * leap.across; battle.reachY = offset[1] * leap.up + arc; battle.reachZ = offset[2] * leap.across;
    },
  };
}
