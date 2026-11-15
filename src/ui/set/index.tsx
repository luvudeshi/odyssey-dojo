// The shared kit of the "marble and gold" look (src/ui/set/set.css): a painted backdrop, a title, a panel, a primary and a
// secondary button, a back button, a stat and a plaque. Every screen of the look builds from these, so they read as one game.
import type { ButtonHTMLAttributes, ElementType, ReactNode } from "react";
import "./set.css";
import "./screens.css";

/** A painting filling the window at full quality. Only a veil sits over it, and only where the caller asks. */
export function SetBackdrop(props: { src: string; position?: string; veil?: "none" | "top" | "bottom" | "soft" }) {
  return (
    <div className="set-backdrop" aria-hidden="true">
      <img src={props.src} alt="" style={{ objectPosition: props.position ?? "50% 50%" }} draggable={false} />
      {props.veil && props.veil !== "none" && <div className={`set-veil set-veil--${props.veil}`} />}
    </div>
  );
}

/** The screen title: deep blue-black inscriptional capitals over a gold underline. */
export function SetTitle(props: { as?: ElementType; kicker?: string; className?: string; children: ReactNode }) {
  const Tag = props.as ?? "h1";
  return (
    <div className={`set-titleblock ${props.className ?? ""}`}>
      {props.kicker && <p className="set-kicker">{props.kicker}</p>}
      <Tag className="set-title">{props.children}</Tag>
      <span className="set-rule" aria-hidden="true"><i /></span>
    </div>
  );
}

/** A sheet of pale marble with a gold meander along its top edge. */
export function SetPanel(props: { as?: ElementType; className?: string; children: ReactNode }) {
  const Tag = props.as ?? "section";
  return <Tag className={`set-panel ${props.className ?? ""}`}>{props.children}</Tag>;
}

/** A carved marble plaque with a gold-leaf border; the primary one is solid gold with dark lettering. */
export function SetButton(props: ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  const { primary, className, type, ...rest } = props;
  return <button type={type ?? "button"} className={`set-btn ${primary ? "set-btn--primary" : ""} ${className ?? ""}`} {...rest} />;
}

/** The back button: a small marble disc with a gold arrow, and the word beside it. */
export function SetBack(props: { label: string; onClick: () => void; className?: string }) {
  return (
    <button type="button" className={`set-back ${props.className ?? ""}`} onClick={props.onClick}>
      <span className="set-back__disc" aria-hidden="true">
        <svg viewBox="0 0 32 32"><path d="M20 6 L9 16 L20 26 M9 16 H26" /></svg>
      </span>
      <span className="set-back__label">{props.label}</span>
    </button>
  );
}

/** A figure with a small caps label under it, such as a count on the Account. */
export function SetStat(props: { value: number | string; label: string; icon?: ReactNode }) {
  return (
    <div className="set-stat">
      {props.icon}
      <dd>{props.value}</dd>
      <dt>{props.label}</dt>
    </div>
  );
}

/** The gold the devices and arrows are cast in. Render once on a screen that shows a .set-device. */
export function SetDefs() {
  return (
    <svg className="set-defs" width="0" height="0" aria-hidden="true">
      <defs>
        <linearGradient id="set-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fbeaa8" />
          <stop offset="0.4" stopColor="#d9b04a" />
          <stop offset="0.75" stopColor="#a47a1f" />
          <stop offset="1" stopColor="#7b5710" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** One of the four choices of the main menu: a medallion of gold relief over a name and a line. */
export function SetPlaque(props: { primary?: boolean; device: ReactNode; name: string; line?: string; onClick: () => void }) {
  return (
    <button type="button" className={`set-plaque ${props.primary ? "set-plaque--primary" : ""}`} onClick={props.onClick}>
      <span className="set-plaque__medal" aria-hidden="true">
        <svg viewBox="0 0 120 120"><g className="set-device" transform="translate(17 17) scale(0.9)">{props.device}</g></svg>
      </span>
      <span className="set-plaque__name">{props.name}</span>
      {props.line && <small className="set-plaque__line">{props.line}</small>}
    </button>
  );
}
