// The scene behind the main menu: one painted picture of the ship between Scylla and Charybdis (public/ui/menu-scylla.webp)
// that drifts slowly, with rain, lightning and sea mist drawn in CSS over it. The layers follow the pointer a little,
// each by a different amount, for depth. Every moving part is a transform or an opacity, so the menu stays smooth.
import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "../ui/pebble";
import "./menuScene.css";

/** How far the pointer is from the middle of a window `size` wide, from -0.5 to 0.5. */
export function pointerOffset(at: number, size: number): number {
  return size > 0 ? Math.min(0.5, Math.max(-0.5, at / size - 0.5)) : 0;
}

export function MenuScene() {
  const scene = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scene.current;
    if (!el || prefersReducedMotion()) return;
    const follow = (event: PointerEvent): void => {
      el.style.setProperty("--mx", pointerOffset(event.clientX, window.innerWidth).toFixed(3));
      el.style.setProperty("--my", pointerOffset(event.clientY, window.innerHeight).toFixed(3));
    };
    window.addEventListener("pointermove", follow);
    return () => { window.removeEventListener("pointermove", follow); };
  }, []);
  return (
    <div ref={scene} className="menu-scene" aria-hidden="true">
      <div className="menu-scene__sea" />
      <div className="menu-scene__glow" />
      <div className="menu-scene__mist" />
      <div className="menu-scene__rain menu-scene__rain--far" />
      <div className="menu-scene__rain menu-scene__rain--near" />
      <div className="menu-scene__shade" />
    </div>
  );
}
