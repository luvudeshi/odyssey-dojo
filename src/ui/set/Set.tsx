// The storm kit's few React pieces (set.css has the rest): the painted backdrop and a title. Only rendered under ?look=storm.
import type { ReactNode } from "react";

/** A full-bleed painting at full quality, with a soft veil where the words sit. Place it first in a positioned screen. */
export function Backdrop(props: { src: string }) {
  return <div className="set-backdrop" aria-hidden="true"><img src={props.src} alt="" /><i /></div>;
}

export function SetTitle(props: { kicker?: string; children: ReactNode; as?: "h1" | "p" }) {
  const Tag = props.as ?? "h1";
  return <>{props.kicker && <p className="set-kicker">{props.kicker}</p>}<Tag className="set-title">{props.children}</Tag></>;
}
