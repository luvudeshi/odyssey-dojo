// The divine power in the scene. One component mounted in Scene.tsx; it plays when FightScreen stamps
// battle.powerAt / powerGod (the same moment the engine's powerUnleashed event lands), so keyboard and webcam play
// look alike and the effect follows the fight clock (a pause pushes powerAt on, see pauseState).
// This file owns what every god shares: the one point light that lights the cave, a thin screen tint or flash laid
// over the canvas, the camera shake (added to battle.shakeX/Y after HitEffects writes them), and the hit pulse that
// flashes the monster. Each god's own picture is in its Strike file. Under reduced motion all of it is replaced by
// a soft glow on the monster that fades in and out: no shake, no flicker, no flash.
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { PointLight, Sprite } from "three";
import { battle, calmMotion, nowSeconds } from "../../battle";
import { markHit } from "../pulse";
import { AthenaStrike } from "./AthenaStrike";
import { ApolloStrike } from "./ApolloStrike";
import { ArtemisStrike } from "./ArtemisStrike";
import { HermesStrike } from "./HermesStrike";
import { PoseidonStrike } from "./PoseidonStrike";
import { ZeusStrike } from "./ZeusStrike";
import { GLOW_PROPS, glowTexture, makeAnchors, readAnchors, setGlow } from "./powerKit";
import { POWER_COLOR, calmGlow, lightLevel, lightTravel, screenLayer, shakeAmount } from "./powerLook";
import type { Rgb } from "./powerLook";
import { POWER_SPAN, makeClock, readClock } from "./powerTiming";

const HERO_LIGHT_Y = 1.3;

export function PowerStrike() {
  const gl = useThree((three) => three.gl);
  const light = useRef<PointLight>(null);
  const calm = useRef<Sprite>(null);
  const overlay = useRef<HTMLDivElement | null>(null);
  const k = useMemo(() => ({ clock: makeClock(), a: makeAnchors(), tint: { r: 0, g: 0, b: 0, a: 0 } }), []);
  const live = useRef({ firedAt: -Infinity, hits: 0, shownKey: -1, shownAlpha: 0 });

  // The tint is a plain element over the canvas, like the red hurt flash in HitEffects.
  useEffect(() => {
    const element = document.createElement("div");
    element.dataset.powerTint = "";
    Object.assign(element.style, { position: "absolute", inset: "0", pointerEvents: "none", opacity: "0", display: "none" });
    gl.domElement.parentElement?.append(element);
    overlay.current = element;
    return () => { element.remove(); overlay.current = null; };
  }, [gl]);

  useFrame(() => {
    const now = nowSeconds();
    const c = readClock(k.clock, battle.powerGod, battle.powerAt, now);
    const s = live.current;
    const l = light.current;
    const el = overlay.current;
    const god = c.god;
    if (god === null || c.phase === "idle") {
      if (l && l.intensity !== 0) l.intensity = 0;
      if (el && s.shownAlpha !== 0) { el.style.display = "none"; s.shownAlpha = 0; }
      setGlow(calm.current, 0, 0, 0, 0, 0, 0, 0, 0);
      return;
    }
    const a = readAnchors(k.a);
    const rgb: Rgb = POWER_COLOR[god];
    if (s.firedAt !== battle.powerAt) { s.firedAt = battle.powerAt; s.hits = 0; }

    if (calmMotion()) {
      if (l && l.intensity !== 0) l.intensity = 0;
      if (el && s.shownAlpha !== 0) { el.style.display = "none"; s.shownAlpha = 0; }
      setGlow(calm.current, a.tx, a.ty, a.tz, 6, 0.6 * calmGlow(god, c), rgb.r, rgb.g, rgb.b);
      return;
    }

    // The light travels with the thing that is thrown and is strongest on the hit.
    if (l) {
      const f = lightTravel(god, c);
      l.color.setRGB(rgb.r, rgb.g, rgb.b);
      l.position.set(a.hx + (a.tx - a.hx) * f, HERO_LIGHT_Y + (a.ty - HERO_LIGHT_Y) * f + 0.4, a.hz + (a.tz - a.hz) * f + 0.6);
      l.intensity = lightLevel(god, c);
    }

    // The tint over the canvas.
    if (el) {
      screenLayer(god, c, k.tint);
      const on = k.tint.a > 0.004;
      if (on) {
        const key = (Math.round(k.tint.r * 255) << 16) | (Math.round(k.tint.g * 255) << 8) | Math.round(k.tint.b * 255);
        if (key !== s.shownKey) { el.style.backgroundColor = `rgb(${String(key >> 16)} ${String((key >> 8) & 255)} ${String(key & 255)})`; s.shownKey = key; }
        el.style.opacity = String(Math.min(1, k.tint.a));
      }
      el.style.display = on ? "block" : "none";
      s.shownAlpha = on ? k.tint.a : 0;
    }

    // Each hit pulses the monster (bloom and its own flash) once, and shakes the camera.
    const span = POWER_SPAN[god];
    let shake = 0;
    for (let h = 0; h <= span.echoes.length; h++) {
      const at = span.hit + (h === 0 ? 0 : span.echoes[h - 1] ?? 0);
      if (c.t >= at && s.hits <= h) { s.hits = h + 1; markHit(); }
      shake = Math.max(shake, shakeAmount(god, c.t - at) * (h === 0 ? 1 : 0.7));
    }
    battle.shakeX += (Math.random() - 0.5) * 2 * shake;
    battle.shakeY += (Math.random() - 0.5) * 2 * shake;
  });

  return (
    <>
      <pointLight ref={light} intensity={0} distance={14} decay={1.5} />
      <sprite ref={calm} visible={false}><spriteMaterial map={glowTexture()} {...GLOW_PROPS} depthTest={false} /></sprite>
      <ZeusStrike />
      <PoseidonStrike />
      <AthenaStrike />
      <HermesStrike />
      <ArtemisStrike />
      <ApolloStrike />
    </>
  );
}
