// Line icons for the Account page, drawn in code on a 64 x 64 grid in the same stroke style as the main menu's three cards.
// One entry per picture: the achievement badges first, then the section, button and stat icons.
import type { ReactNode } from "react";

const ICONS = {
  sword: <path d="M14 50 L48 16 L54 10 L52 18 L50 14 M20 38 L30 48 M14 50 L10 54" />,
  eye: <><path d="M6 32 Q32 8 58 32 Q32 56 6 32 Z" /><circle cx="32" cy="32" r="9" /><circle cx="32" cy="32" r="2.5" /></>,
  cup: <path d="M16 14 H48 L44 34 Q32 46 20 34 Z M32 42 V54 M22 54 H42 M24 22 Q32 28 40 22" />,
  siren: <><path d="M4 52 q7 -5 14 0 t14 0 t14 0 t14 0" /><circle cx="22" cy="38" r="5" /><circle cx="42" cy="34" r="5" /><path d="M27 38 V14 L47 10 V34" /></>,
  jaws: <path d="M10 46 Q32 4 54 46 M14 46 l6 -10 l6 10 l6 -10 l6 10 l6 -10 l6 10 M22 26 L28 18" />,
  whirl: <path d="M32 32 a3 3 0 0 1 6 0 a8 8 0 0 1 -16 0 a14 14 0 0 1 28 0 a20 20 0 0 1 -40 0" />,
  bow: <path d="M18 10 Q56 32 18 54 M18 10 V54 M8 32 H52 M52 32 l-7 -5 M52 32 l-7 5" />,
  temple: <path d="M6 26 L32 8 L58 26 Z M14 32 V50 M26 32 V50 M38 32 V50 M50 32 V50 M6 56 H58" />,
  owl: <><path d="M18 22 L20 10 L30 16 H34 L44 10 L46 22 V40 Q46 54 32 54 Q18 54 18 40 Z" /><circle cx="26" cy="30" r="5" /><circle cx="38" cy="30" r="5" /><path d="M32 36 L29 42 H35 Z" /></>,
  repeat: <path d="M48 20 A18 18 0 1 0 50 38 M48 8 V20 H36" />,
  lyre: <path d="M18 12 Q8 36 22 52 M46 12 Q56 36 42 52 M14 12 H50 M22 52 H42 M26 16 V50 M32 16 V50 M38 16 V50" />,
  bolt: <path d="M38 4 L14 36 H30 L24 60 L50 26 H34 Z" />,
  roundShield: <><circle cx="32" cy="32" r="25" /><circle cx="32" cy="32" r="16" /><circle cx="32" cy="32" r="4" /><path d="M32 7 V16 M32 48 V57 M7 32 H16 M48 32 H57" /></>,
  chain: <><circle cx="17" cy="32" r="11" /><circle cx="32" cy="32" r="11" /><circle cx="47" cy="32" r="11" /></>,
  lyreStar: <path d="M20 28 Q12 44 24 58 M44 28 Q52 44 40 58 M16 28 H48 M24 58 H40 M28 31 V56 M36 31 V56 M32 3 L34.5 10.5 L42 13 L34.5 15.5 L32 23 L29.5 15.5 L22 13 L29.5 10.5 Z" />,
  aegis: <><circle cx="32" cy="34" r="22" /><circle cx="24" cy="30" r="3" /><circle cx="40" cy="30" r="3" /><path d="M23 42 Q32 49 41 42 M32 32 V38 M14 20 q-8 -3 -5 -12 M50 20 q8 -3 5 -12 M24 13 q-3 -6 2 -10 M40 13 q3 -6 -2 -10" /></>,
  sandal: <path d="M6 54 H46 Q57 54 57 45 Q47 45 41 37 H27 L21 47 H6 Z M27 37 L21 47 M33 37 L30 54 M17 35 Q4 29 6 12 Q14 23 25 25 M13 23 Q10 14 15 5 Q19 16 28 20" />,
  peak: <path d="M4 56 L24 22 L34 38 L42 28 L60 56 Z M18 34 L24 40 L29 34 M32 2 L24 14 H32 L28 24" />,
  ring: <><circle cx="32" cy="11" r="6.5" /><circle cx="52" cy="25.5" r="6.5" /><circle cx="44.5" cy="49" r="6.5" /><circle cx="19.5" cy="49" r="6.5" /><circle cx="12" cy="25.5" r="6.5" /><circle cx="32" cy="32" r="3" /></>,
  scroll: <path d="M14 14 Q8 14 8 20 Q8 26 14 26 H18 V50 Q18 56 24 56 H52 Q58 56 58 50 Q58 44 52 44 H50 V14 Z M24 56 Q30 56 30 50 V44 H52 M26 24 H42 M26 32 H42" />,
  owlBranch: <><g transform="translate(6 -3) scale(0.82)"><path d="M18 22 L20 10 L30 16 H34 L44 10 L46 22 V40 Q46 54 32 54 Q18 54 18 40 Z" /><circle cx="26" cy="30" r="5" /><circle cx="38" cy="30" r="5" /><path d="M32 36 L29 42 H35 Z" /></g><path d="M6 52 Q32 44 58 52 M46 48 l8 -8 M51 50 l9 -1 M18 48 l-8 -8 M13 50 l-9 -1" /></>,
  helmets: <><g transform="translate(-4 12) scale(0.62)"><path d="M14 42 V28 Q14 10 32 10 Q50 10 50 28 V42 M14 42 H22 V54 H42 V42 H50 M32 10 V24 M24 36 H40" /></g><g transform="translate(28 12) scale(0.62)"><path d="M14 42 V28 Q14 10 32 10 Q50 10 50 28 V42 M14 42 H22 V54 H42 V42 H50 M32 10 V24 M24 36 H40" /></g></>,
  crest: <path d="M14 48 V34 Q14 18 32 18 Q50 18 50 34 V48 M14 48 H22 V58 H42 V48 H50 M24 42 H40 M32 18 V30 M9 22 Q32 -6 55 22 M16 17 l-4 -6 M24 11 l-2 -7 M32 9 V2 M40 11 l2 -7 M48 17 l4 -6" />,
  lock: <path d="M16 28 H48 V54 H16 Z M23 28 V20 Q23 8 32 8 Q41 8 41 20 V28 M32 38 V45" />,
  helmet: <path d="M14 42 V28 Q14 10 32 10 Q50 10 50 28 V42 M14 42 H22 V54 H42 V42 H50 M32 10 V24 M24 36 H40" />,
  trophy: <path d="M20 8 H44 V26 Q44 38 32 38 Q20 38 20 26 Z M20 14 H10 Q10 28 22 30 M44 14 H54 Q54 28 42 30 M32 38 V48 M22 56 H42 M26 48 H38" />,
  friends: <><circle cx="22" cy="20" r="8" /><circle cx="43" cy="22" r="7" /><path d="M6 52 Q6 34 22 34 Q38 34 38 52 M34 36 Q38 33 43 34 Q58 34 58 52" /></>,
  sliders: <><path d="M8 16 H16 M28 16 H56 M8 32 H36 M48 32 H56 M8 48 H22 M34 48 H56" /><circle cx="22" cy="16" r="5" /><circle cx="42" cy="32" r="5" /><circle cx="28" cy="48" r="5" /></>,
  fights: <path d="M12 12 L50 50 M52 12 L14 50 M8 16 L16 8 M56 16 L48 8 M8 48 L16 56 M56 48 L48 56" />,
  laurel: <path d="M30 56 C12 50 8 30 18 10 M34 56 C52 50 56 30 46 10 M13 40 l-8 -3 M11 30 l-8 0 M13 20 l-7 3 M51 40 l8 -3 M53 30 l8 0 M51 20 l7 3" />,
  star: <path d="M32 6 L40 25 L60 26 L44 39 L50 58 L32 47 L14 58 L20 39 L4 26 L24 25 Z" />,
  pen: <path d="M12 52 L16 38 L42 12 L52 22 L26 48 Z M36 18 L46 28 M12 52 L26 48" />,
  host: <path d="M16 56 V10 H46 V56 M8 56 H54 M38 32 H41" />,
  join: <path d="M6 32 H34 M26 22 L36 32 L26 42 M30 10 H56 V54 H30" />,
  house: <path d="M6 30 L32 8 L58 30 M12 26 V54 H52 V26 M27 54 V38 H37 V54" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof ICONS;

/** The icon of an achievement: one per stop, and one for each of the others. */
export const FEAT_ICON: Readonly<Record<string, IconName>> = {
  first_win: "sword",
  beat_polyphemus: "eye",
  beat_circe: "cup",
  beat_sirens: "siren",
  beat_scylla: "jaws",
  beat_charybdis: "whirl",
  beat_suitors: "bow",
  home: "temple",
  student: "owl",
  second_nature: "repeat",
  song: "lyre",
  ages: "lyreStar",
  favoured: "bolt",
  olympus: "peak",
  unbroken: "roundShield",
  chain: "chain",
  shield_wall: "aegis",
  light_footed: "sandal",
  many_ways: "ring",
  veteran: "crest",
  pupil: "scroll",
  pride: "owlBranch",
  shoulder: "helmets",
};

export function Icon(props: { name: IconName; className?: string }) {
  return <svg className={`acc-icon ${props.className ?? ""}`} viewBox="0 0 64 64" aria-hidden="true" focusable="false">{ICONS[props.name]}</svg>;
}
