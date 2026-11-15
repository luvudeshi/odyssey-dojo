// A bronze relief device for each fighting style's shield in the Training Dojo (drawn like menuShields.tsx's devices).
import type { ReactNode } from "react";
import { DEVICES } from "../../screens/menuShields";

export const STYLE_DEVICES: Readonly<Record<string, ReactNode>> = {
  taekwondo: DEVICES.pair,
  jiu_jitsu: (
    <>
      <path className="f" d="M40 46 L26 86 L38 80 L44 90 L50 48 Z" />
      <path className="f" d="M56 46 L70 86 L58 80 L52 90 L46 48 Z" />
      <rect className="f" x="26" y="30" width="44" height="22" rx="6" />
      <path className="s" d="M26 41 H70" />
      <rect className="e" x="40" y="26" width="16" height="30" rx="5" />
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
