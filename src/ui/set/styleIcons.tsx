// The Training Dojo's five fighting styles as devices cut into glass, drawn with the same marks as the menu's (.f figure, .l line, .s detail, .e accent).
import type { ReactNode } from "react";

const THICK = { strokeWidth: 7 } as const;

const ICONS: Readonly<Record<string, ReactNode>> = {
  // Boxer: a glove with its cuff and thumb.
  boxer: (
    <>
      <path className="f" d="M32 64 L32 38 C32 20 44 10 58 10 C74 10 82 22 82 38 L82 56 C82 62 78 66 72 66 Z" />
      <path className="f" d="M32 42 C20 40 14 50 21 58 C26 63 33 62 38 59 Z" />
      <path className="s" d="M44 33 C52 37 64 37 76 33 M62 66 V54" />
      <rect className="f" x="34" y="66" width="38" height="22" rx="4" />
      <path className="l" d="M42 74 V82 M52 74 V82 M62 74 V82" />
    </>
  ),
  // Hoplite: a spear, tip up and leaning.
  hoplite: (
    <g transform="rotate(32 48 48)">
      <path className="l" d="M48 40 V90" {...THICK} />
      <path className="f" d="M48 2 C60 16 60 30 48 42 C36 30 36 16 48 2 Z" />
      <path className="s" d="M48 10 V38" />
      <path className="l" d="M40 44 H56" />
      <circle className="e" cx="48" cy="90" r="3.5" />
    </g>
  ),
  // Karate: a knotted belt with two tails.
  karate: (
    <>
      <path className="f" d="M42 56 L32 90 L46 85 L52 92 L56 56 Z" />
      <path className="f" d="M52 56 L68 88 L78 78 L64 54 Z" />
      <path className="f" d="M6 38 L38 34 L58 34 L90 38 L90 54 L58 52 L38 52 L6 54 Z" />
      <rect className="f" x="36" y="30" width="24" height="26" rx="5" />
      <path className="s" d="M8 46 H34 M62 46 H88 M42 38 L54 48 M54 38 L42 48" />
    </>
  ),
  // Kung fu: an open palm.
  kung_fu: (
    <>
      <rect className="f" x="28" y="14" width="10" height="40" rx="5" />
      <rect className="f" x="40" y="6" width="10" height="48" rx="5" />
      <rect className="f" x="52" y="8" width="10" height="46" rx="5" />
      <rect className="f" x="64" y="18" width="10" height="38" rx="5" />
      <rect className="f" x="26" y="46" width="50" height="42" rx="12" />
      <path className="f" d="M28 66 L12 50 Q8 45 13 41 Q18 38 22 43 L36 58 Z" />
      <path className="s" d="M36 68 Q50 76 66 68" />
    </>
  ),
  // Pankration: a high kick.
  pankration: (
    <>
      <circle className="f" cx="30" cy="12" r="7" />
      <path className="l" d="M30 22 V48 M30 48 L26 70 L30 90 M30 48 L58 46 L78 36" {...THICK} />
      <path className="l" d="M30 28 L16 40 M30 28 L44 38" />
      <path className="f" d="M74 40 L90 30 L94 42 L80 50 Z" />
      <path className="e" d="M84 12 L90 20 L80 20 Z M94 26 L98 32 L90 32 Z" />
    </>
  ),
};

/** The device for a style, in a 96 x 96 box, drawn in the slab's vein colour. */
export function StyleIcon(props: { id: string }) {
  return <svg className="set-style-icon" viewBox="0 0 96 96" aria-hidden="true">{ICONS[props.id] ?? ICONS.boxer}</svg>;
}
