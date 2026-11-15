// Owns the camera. It eases toward the shot that cameraShots picks for the fight, then adds HitEffects' shake on
// top, so the shake never fights the rig for the transform. No allocation per frame.
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { MathUtils, PerspectiveCamera } from "three";
import { battle, calmMotion, nowSeconds } from "./battle";
import { cameraShot, makeShot } from "./cameraShots";
import { dodge } from "./effects/dodge/dodgeMotion";
import type { Shot } from "./cameraShots";

const DEBUG = new URLSearchParams(window.location.search).has("debug");

export function CameraRig() {
  const shots = useRef<{ target: Shot; now: Shot } | null>(null);

  useFrame(({ camera }, delta) => {
    const dt = Math.min(delta, 0.05);
    const { target, now } = (shots.current ??= { target: makeShot(), now: makeShot() });
    cameraShot(target, battle, nowSeconds(), calmMotion());
    if (dodge.variant > 0) {
      // ?dodge: the shot follows the hero sideways, which hides his travel. Give back most of that, and on the Hermes look push in as the blow misses.
      target.px -= dodge.x * 0.45; target.lx -= dodge.x * 0.28;
      target.kick += 0.07 * dodge.push; target.fovKick -= 5 * dodge.push;
    }
    const k = target.lambda;
    now.px = MathUtils.damp(now.px, target.px, k, dt);
    now.py = MathUtils.damp(now.py, target.py, k, dt);
    now.pz = MathUtils.damp(now.pz, target.pz, k, dt);
    now.lx = MathUtils.damp(now.lx, target.lx, k, dt);
    now.ly = MathUtils.damp(now.ly, target.ly, k, dt);
    now.lz = MathUtils.damp(now.lz, target.lz, k, dt);
    now.fov = MathUtils.damp(now.fov, target.fov, k, dt);
    const push = target.kick;
    camera.position.set(
      now.px + (now.lx - now.px) * push + battle.shakeX,
      now.py + (now.ly - now.py) * push + battle.shakeY,
      now.pz + (now.lz - now.pz) * push,
    );
    camera.lookAt(now.lx, now.ly, now.lz);
    if (DEBUG) {
      // Lets a browser test read the camera and the fight.
      Reflect.set(window, "__camera", camera);
      Reflect.set(window, "__battle", battle);
    }
    if (camera instanceof PerspectiveCamera) {
      const fov = now.fov + target.fovKick;
      if (Math.abs(camera.fov - fov) > 0.01) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
    }
  });
  return null;
}
