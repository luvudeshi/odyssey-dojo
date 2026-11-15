// The Obsidian set's React pieces: only what CSS cannot do. Buttons, panels and the back button are plain classes in set.css.
import type { ReactNode } from "react";
import "./screens.css";

/** A painted picture filling its parent at full quality. Only a soft veil sits over it, where the text is. */
export function SetBackdrop(props: { src: string; className?: string }) {
  return (
    <div className={`set-backdrop ${props.className ?? ""}`} aria-hidden="true">
      <img src={props.src} alt="" decoding="async" />
      <i className="set-backdrop__veil" />
    </div>
  );
}

/** A molten screen title: white-hot letters with an ember glow. `kicker` is the small line above it. */
export function SetTitle(props: { children: ReactNode; kicker?: string }) {
  return (
    <div className="set-title" aria-hidden="true">
      {props.kicker && <span className="set-title__kicker">{props.kicker}</span>}
      {props.children}
    </div>
  );
}
