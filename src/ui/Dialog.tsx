// A modal panel over the game: takes focus when it opens, keeps Tab inside, moves between buttons with Up and Down,
// and gives focus back to whatever had it when it closes. Esc is handled by the owner (see onEscape).
import { useEffect, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import "./theme.css";
import "./ui.css";
import { installGround } from "./pebble";
import { Backdrop } from "./set/Set";
import "./set/screens-flow.css";

const FOCUSABLE = "button, input, select, [tabindex]:not([tabindex='-1'])";

/** `scene` paints a full screen behind the panel and, with `onBack`, puts the kit Back button at the top left. */
export function Dialog(props: { title: string; children: ReactNode; onEscape?: () => void; scene?: string; onBack?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { onEscape } = props;

  useEffect(() => {
    installGround();
    const before = document.activeElement;
    ref.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => { if (before instanceof HTMLElement) before.focus(); };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape" && onEscape) {
      // Marked as handled so a window-level Esc listener (the fight's pause) does not act on it a second time.
      event.preventDefault();
      event.stopPropagation();
      onEscape();
      return;
    }
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Tab" && items.length > 0) {
      event.preventDefault();
      items[(at + (event.shiftKey ? -1 : 1) + items.length) % items.length]?.focus();
    } else if ((event.key === "ArrowDown" || event.key === "ArrowUp") && document.activeElement instanceof HTMLButtonElement) {
      event.preventDefault();
      items[(at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    }
  };

  return (
    <div className={`ui-backdrop${props.scene ? " ui-backdrop--scene" : ""}`}>
      {props.scene && <Backdrop src={props.scene} />}
      <div ref={ref} className="ui-panel set-panel" role="dialog" aria-modal="true" aria-label={props.title} tabIndex={-1} onKeyDown={onKeyDown}>
        <h2 className="ui-title set-title">{props.title}</h2>
        {props.children}
        {props.onBack && <button type="button" className="set-back" onClick={props.onBack}>Back</button>}
      </div>
    </div>
  );
}
