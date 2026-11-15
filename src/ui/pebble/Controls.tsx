// Button, Toggle, Slider, Select. The last three take the same props as src/ui/controls.tsx, so a screen can swap them in.
import { type ButtonHTMLAttributes, type CSSProperties, type ReactNode, useEffect, useId } from "react";
import { drawLayout } from "./draw";
import { useBoxSize } from "./hooks";
import { PebbleCanvas } from "./PebbleCanvas";
import { PAL } from "./palette";
import { type Layout, makeRng, newLayout, pebble } from "./stones";
import { installGround } from "./tile";

/** The two stones that flank a focused control, drawn in a strip 32 px wider than the button. */
function focusLayout(w: number, h: number): Layout {
  const l = newLayout(), r = makeRng(8);
  for (const x of [6, w + 26]) { pebble(l, r, x, h / 2, 9, PAL.ochre[2], { round: true }); pebble(l, r, x, h / 2, 3.6, PAL.cream[3], { round: true }); }
  return l;
}

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> {
  children: ReactNode;
  /** `primary` is the ochre call to action; one per screen. */
  primary?: boolean;
  className?: string;
}

/**
 * A plain stone plaque with real text on it: no pebbles behind the label, so it reads at a glance. States by CSS:
 * hover turns it terracotta, focus-visible adds a cream outline and two flanking stones, pressed nudges down, disabled dims.
 */
export function Button({ children, primary = false, className, type = "button", ...rest }: ButtonProps) {
  const [ref, box] = useBoxSize<HTMLButtonElement>();
  const ready = box.w > 8 && box.h > 8;
  return (
    <button ref={ref} type={type} className={`pb-btn ${primary ? "pb-btn--primary" : ""} ${className ?? ""}`} {...rest}>
      {ready && <PebbleCanvas className="pb-btn__focus" width={box.w + 32} height={box.h} cacheKey="btn-focus" draw={(ctx) => { drawLayout(ctx, focusLayout(box.w, box.h)); }} />}
      <span className="pb-btn__label">{children}</span>
    </button>
  );
}

export function Toggle(props: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  const id = useId();
  useEffect(() => { installGround(); }, []);
  return (
    <div className="pb-field">
      <label htmlFor={id}>{props.label}</label>
      <span className="pb-switch">
        <input id={id} type="checkbox" role="switch" checked={props.checked} onChange={(e) => { props.onChange(e.target.checked); }} />
        <span className="pb-switch__track" aria-hidden="true"><span className="pb-switch__thumb" /></span>
      </span>
      <span className="pb-field__value" aria-hidden="true">{props.checked ? "On" : "Off"}</span>
    </div>
  );
}

export function Slider(props: { label: string; value: number; onChange: (value: number) => void }) {
  const id = useId(), pct = Math.round(props.value * 100);
  return (
    <div className="pb-field">
      <label htmlFor={id}>{props.label}</label>
      <input id={id} className="pb-slider" type="range" min={0} max={100} step={5} value={pct} style={{ "--v": `${String(pct)}%` } as CSSProperties} onChange={(e) => { props.onChange(Number(e.target.value) / 100); }} />
      <span className="pb-field__value" aria-hidden="true">{pct}%</span>
    </div>
  );
}

export function Select<T extends string>(props: {
  label: string;
  value: T;
  options: readonly { readonly value: T; readonly label: string }[];
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <div className="pb-field">
      <label htmlFor={id}>{props.label}</label>
      <select id={id} className="pb-select" value={props.value} onChange={(e) => {
        const picked = props.options.find((o) => o.value === e.target.value);
        if (picked) props.onChange(picked.value);
      }}>
        {props.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <span />
    </div>
  );
}
