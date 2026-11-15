// A bronze relief device for each fighting style's shield in the Training Dojo (drawn like menuShields.tsx's devices).
import type { ReactNode } from "react";

export const STYLE_DEVICES: Readonly<Record<string, ReactNode>> = {
  // Achilles, whom Homer calls swift-footed: a kicker in black-figure, as on a Greek vase, the heel of the kicking foot bright.
  taekwondo: (
    <>
      <circle className="f" cx="48" cy="48" r="38" />
      <circle className="h" cx="31" cy="21" r="6.5" />
      <rect className="h" x="26" y="29" width="11" height="25" rx="4.5" transform="rotate(-12 31.5 41.5)" />
      <rect className="h" x="29" y="29.5" width="20" height="5.5" rx="2.75" transform="rotate(150 29 32)" />
      <rect className="h" x="33" y="29.5" width="14" height="5.5" rx="2.75" transform="rotate(-30 33 32)" />
      <circle className="h" cx="46" cy="24" r="4" />
      <rect className="h" x="29" y="51" width="8" height="31" rx="4" transform="rotate(8 33 66)" />
      <rect className="h" x="21" y="79" width="15" height="5.5" rx="2.75" />
      <rect className="h" x="35" y="46" width="46" height="8.5" rx="4.25" transform="rotate(-20 35 50)" />
      <rect className="h" x="75" y="22" width="6.5" height="14" rx="3.25" transform="rotate(-20 78 29)" />
      <circle className="e" cx="76.5" cy="37" r="3" />
      <circle className="s" cx="48" cy="48" r="38" />
    </>
  ),
  // Theseus, who won by skill and found his way out: the labyrinth of Knossos, walled round its centre.
  jiu_jitsu: (
    <>
      <rect className="f" x="10" y="10" width="76" height="76" rx="6" />
      <path className="l" d="M44 80 H16 V16 H80 V80 H52 M52 26 H70 V70 H26 V26 H44 M44 60 H36 V36 H60 V60 H52 M48 16 V26 M26 48 H16 M70 48 H80" />
      <path className="s" d="M10 10 H86 V86 H10 Z" />
      <circle className="e" cx="48" cy="48" r="5" />
    </>
  ),
  boxer: (
    <>
      <rect className="f" x="22" y="12" width="52" height="46" rx="22" />
      <path className="s" d="M32 30 H64 M32 40 H64" />
      <rect className="f" x="30" y="58" width="36" height="22" rx="4" />
      <path className="s" d="M30 68 H66" />
      <circle className="e" cx="40" cy="22" r="3" />
    </>
  ),
  karate: (
    <>
      <circle className="f" cx="48" cy="48" r="18" />
      <circle className="s" cx="48" cy="48" r="12" />
      <path className="l" d="M48 8 V22 M48 74 V88 M8 48 H22 M74 48 H88 M20 20 L30 30 M66 66 L76 76 M76 20 L66 30 M30 66 L20 76" />
      <circle className="e" cx="48" cy="48" r="4" />
    </>
  ),
  kung_fu: (
    <>
      <circle className="f" cx="48" cy="48" r="32" />
      <path className="h" d="M48 16 A16 16 0 0 1 48 48 A16 16 0 0 0 48 80 A32 32 0 0 1 48 16 Z" />
      <circle className="e" cx="48" cy="32" r="4.5" />
      <circle className="h" cx="48" cy="64" r="4.5" />
      <circle className="s" cx="48" cy="48" r="32" />
    </>
  ),
};
