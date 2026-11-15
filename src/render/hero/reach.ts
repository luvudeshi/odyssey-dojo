// Carries the hero's model to the monster on a counted strike (the rule is in ../strikeReach.ts). Each frame it reads
// where his fists, feet and any held blade's tip are, picks the one striking, and moves his whole body so that limb
// meets the contact point on arrival. It moves the body, never bends a limb, so it works the same for webcam play
// (the tracker poses the arms) and keyboard play (a clip does). Writes battle.reachX/Y/Z; the hero's group adds them.
import { Vector3 } from "three";
import type { Object3D } from "three";
import { battle } from "../battle";
import { KICKS, REACH, contactPoint, reachWeight, strikingLimb, travel } from "../strikeReach";

const LIMB_BONES: readonly string[] = ["hand_l", "hand_r", "foot_l", "foot_r"];
const FEET: ReadonlySet<string> = new Set(["foot_l", "foot_r"]);
/** Name of the point of the held spear and stake (gear/carriedGear.tsx), so a blade's tip can strike. */
export const STRIKE_TIP = "strikeTip";
/** Used when the model has none of the limbs: a fist a little ahead of the chest. */
const FALLBACK_LIMB: readonly [number, number, number] = [0, 1.3, -1.2];

const scale = new Vector3();

/** Visible, and for a tip drawn at near full size: stowed gear is scaled toward 0 (bone mounts undo the rig's scale). */
function shown(node: Object3D): boolean {
  for (let n: Object3D | null = node; n; n = n.parent) if (!n.visible) return false;
  return node.name !== STRIKE_TIP || node.getWorldScale(scale).x > 0.5;
}

export interface HeroReach {
  /** `group` is the hero's own group and `home` its mark before any reach; call once the pose is final. */
  update(group: Object3D, home: readonly [number, number, number], now: number): void;
}

export function createReach(root: Object3D): HeroReach {
  const limbs: Object3D[] = [];
  root.traverse((node) => {
    if (LIMB_BONES.includes(node.name) && !limbs.some((limb) => limb.name === node.name)) limbs.push(node);
  });
  const locals: ([number, number, number] | null)[] = [];
  const world = new Vector3();
  const base = new Vector3();
  const contact: [number, number, number] = [0, 0, 0];
  const toTarget: [number, number, number] = [0, 0, 0];
  const offset: [number, number, number] = [0, 0, 0];
  let tipsFound = false;
  let at = -Infinity;
  let landed = false;

  const measure = (node: Object3D): void => {
    if (!shown(node) || (FEET.has(node.name) && !KICKS.has(battle.struckMove))) { locals.push(null); return; }
    node.getWorldPosition(world).sub(base);
    locals.push([world.x, world.y, world.z]);
  };

  return {
    update(group, home, now) {
      const since = now - battle.reachAt;
      const w = battle.hitSpot ? reachWeight(since) : 0;
      if (w === 0) {
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
      battle.reachX = offset[0] * w; battle.reachY = offset[1] * w; battle.reachZ = offset[2] * w;
    },
  };
}
