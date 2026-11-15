// The god's own emblem, for the reveal when no picture of the player was taken (the lot, or keyboard play).
// It is an SVG built as text, on the same dark ground, gold ring and laurel as the marble portrait, so it needs
// no canvas, no camera and no network, and it cannot fail to draw.
import { GODS } from "./gods";
import type { GodId } from "./gods";
import { gilded, laurelBranch } from "./marble";
import { RING_RADIUS, RING_WIDTH, wreathColours } from "./portrait";

type Rgb = readonly [number, number, number];

const SIZE = 512;
const HALF = SIZE / 2;
const INK: Rgb = [20, 12, 34];
const GOLD: Rgb = [232, 184, 74];
/** The symbols are drawn in a box from -100 to 100 and scaled by this to sit inside the wreath. */
const SYMBOL_SCALE = 1.42;

function rgb(colour: Rgb, alpha = 1): string {
  const [r, g, b] = colour.map((channel) => Math.round(Math.min(255, Math.max(0, channel))));
  return alpha >= 1 ? `rgb(${String(r)},${String(g)},${String(b)})` : `rgba(${String(r)},${String(g)},${String(b)},${alpha.toFixed(2)})`;
}

function mix(from: Rgb, to: Rgb, amount: number): Rgb {
  return [from[0] + (to[0] - from[0]) * amount, from[1] + (to[1] - from[1]) * amount, from[2] + (to[2] - from[2]) * amount];
}

/** A "#rrggbb" or "#rgb" colour as numbers; plain gold for anything else. */
function parseHex(colour: string): Rgb {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(colour.trim())?.[1];
  if (hex === undefined) return GOLD;
  const full = hex.length === 3 ? hex.replace(/./g, "$&$&") : hex;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

function n(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** What one emblem is called, and its drawing: `ink` paints the shape and `cut` the holes in it (an owl's eyes). */
interface Emblem {
  readonly name: string;
  readonly draw: (ink: string, cut: string) => string;
}

function sunRays(): string {
  const rays: string[] = [];
  for (let ray = 0; ray < 12; ray++) {
    const angle = (ray / 12) * Math.PI * 2 - Math.PI / 2;
    const reach = ray % 2 === 0 ? 100 : 80;
    const spread = 0.15;
    const at = (around: number, radius: number): string => `${n(Math.cos(around) * radius)} ${n(Math.sin(around) * radius)}`;
    rays.push(`M${at(angle - spread, 52)}L${at(angle, reach)}L${at(angle + spread, 52)}Z`);
  }
  return rays.join("");
}

const WING = "M5 -66C24 -94 58 -98 86 -82C72 -78 64 -75 58 -71C68 -68 74 -64 78 -58C62 -58 52 -58 45 -57C52 -53 56 -49 58 -45C38 -44 18 -48 5 -58Z";
const SNAKE = "M0 94C42 74 42 52 0 38C-36 24 -36 2 0 -10C26 -20 28 -34 14 -42";

export const EMBLEMS: Readonly<Record<GodId, Emblem>> = {
  zeus: {
    name: "thunderbolt",
    draw: (ink) => `<path fill="${ink}" d="M26 -102L-56 12L-10 12L-34 102L58 -26L12 -26L46 -102Z"/>`,
  },
  poseidon: {
    name: "trident",
    draw: (ink) =>
      `<g fill="none" stroke="${ink}" stroke-width="13" stroke-linecap="round"><path d="M0 -80V96"/>` +
      `<path d="M-54 -68V-40Q-54 -6 0 -6Q54 -6 54 -40V-68"/><path d="M-20 62H20"/></g>` +
      `<path fill="${ink}" d="M-18 -76L0 -108L18 -76ZM-72 -64L-54 -98L-36 -64ZM36 -64L54 -98L72 -64Z"/>`,
  },
  athena: {
    name: "owl",
    draw: (ink, cut) =>
      `<path fill="${ink}" d="M0 -74C52 -74 66 -28 62 22C58 76 30 100 0 100C-30 100 -58 76 -62 22C-66 -28 -52 -74 0 -74Z` +
      `M-58 -50L-58 -92L-24 -70ZM58 -50L58 -92L24 -70Z"/>` +
      `<g fill="${cut}"><circle cx="-27" cy="-26" r="23"/><circle cx="27" cy="-26" r="23"/><path d="M-10 -4H10L0 20Z"/></g>` +
      `<g fill="${ink}"><circle cx="-27" cy="-26" r="10"/><circle cx="27" cy="-26" r="10"/></g>` +
      `<path fill="none" stroke="${cut}" stroke-width="5" stroke-linecap="round" d="M-30 40q10 12 20 0M-10 40q10 12 20 0M10 40q10 12 20 0M-20 62q10 12 20 0M0 62q10 12 20 0"/>`,
  },
  hermes: {
    name: "herald's staff",
    draw: (ink) =>
      `<g fill="none" stroke="${ink}" stroke-linecap="round"><path stroke-width="10" d="M0 -78V100"/>` +
      `<path stroke-width="8" d="${SNAKE}"/><path stroke-width="8" transform="scale(-1 1)" d="${SNAKE}"/></g>` +
      `<g fill="${ink}"><circle cy="-86" r="12"/><circle cx="15" cy="-45" r="7"/><circle cx="-15" cy="-45" r="7"/>` +
      `<path d="${WING}"/><path transform="scale(-1 1)" d="${WING}"/></g>`,
  },
  artemis: {
    name: "bow and crescent",
    draw: (ink) =>
      `<g transform="translate(-14 0)"><path fill="${ink}" d="M-20 -95A96 96 0 0 1 -20 95A112 112 0 0 0 -20 -95Z"/>` +
      `<g fill="none" stroke="${ink}" stroke-linecap="round" stroke-linejoin="round"><path stroke-width="3.5" d="M-20 -95L-62 0L-20 95"/>` +
      `<path stroke-width="7" d="M-62 0H84"/><path stroke-width="5" d="M-62 0l-14 -13M-62 0l-14 13M-46 0l-14 -13M-46 0l-14 13"/></g>` +
      `<path fill="${ink}" d="M80 -15L112 0L80 15Z"/></g>`,
  },
  apollo: {
    name: "sun",
    draw: (ink) => `<circle fill="${ink}" r="40"/><path fill="${ink}" d="${sunRays()}"/>`,
  },
};

/** The ring and the laurel crown, placed and coloured as portrait.ts draws them on the marble bust. */
function wreath(gilt: Rgb): string {
  const colours = wreathColours(gilt);
  const branch = laurelBranch(true);
  const radius = SIZE * branch.radius;
  const belly = 0.24;
  const upper = `M0 0C0.25 ${n(-belly)} 0.7 ${n(-belly * 0.8)} 1 0`;
  const leaf =
    `<g id="leaf"><path fill="${colours.body}" d="${upper}C0.7 ${n(belly * 0.8)} 0.25 ${n(belly)} 0 0Z"/>` +
    `<path fill="${colours.lit}" d="${upper}Z"/><path stroke="${colours.dark}" stroke-width="0.035" d="M0.08 0H0.94"/></g>`;
  const leaves = branch.leaves
    .map((one) => `<use href="#leaf" transform="translate(${n(one.x * SIZE)} ${n(one.y * SIZE)}) rotate(${n((one.angle * 180) / Math.PI)}) scale(${n(one.length * SIZE)})"/>`)
    .join("");
  const stem = `<path fill="none" stroke="${colours.body}" stroke-width="${n(SIZE * 0.009)}" stroke-linecap="round" d="M0 ${n(radius)}A${n(radius)} ${n(radius)} 0 0 0 ${n(Math.cos(branch.end) * radius)} ${n(Math.sin(branch.end) * radius)}"/>`;
  const side = stem + leaves;
  return (
    `<defs>${leaf}</defs><g transform="translate(${String(HALF)} ${String(HALF)})">` +
    `<circle r="${n(SIZE * RING_RADIUS)}" fill="none" stroke="${colours.body}" stroke-width="${n(SIZE * RING_WIDTH)}"/>` +
    `<circle r="${n(SIZE * (RING_RADIUS - RING_WIDTH * 0.2))}" fill="none" stroke="${colours.lit}" stroke-width="${n(SIZE * RING_WIDTH * 0.25)}"/>` +
    `<g>${side}</g><g transform="scale(-1 1)">${side}</g>` +
    `<circle cy="${n(radius)}" r="${n(SIZE * 0.017)}" fill="${colours.body}"/>` +
    `<circle cx="${n(-SIZE * 0.004)}" cy="${n(radius - SIZE * 0.004)}" r="${n(SIZE * 0.008)}" fill="${colours.lit}"/></g>`
  );
}

/** The emblem as SVG text: dark veined stone lit in the god's colour, the gold ring and laurel, then the symbol. */
export function emblemSvg(god: GodId): string {
  const accent = parseHex(GODS[god].accent);
  const symbol = EMBLEMS[god].draw;
  const centre = `translate(${String(HALF)} ${String(HALF + 4)}) scale(${String(SYMBOL_SCALE)})`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(SIZE)} ${String(SIZE)}" width="${String(SIZE)}" height="${String(SIZE)}">` +
    `<defs><radialGradient id="stone" cx="50%" cy="46%" r="52%">` +
    `<stop offset="0" stop-color="${rgb(mix(INK, accent, 0.34))}"/><stop offset="0.6" stop-color="${rgb(mix(INK, accent, 0.12))}"/><stop offset="1" stop-color="${rgb(INK)}"/></radialGradient>` +
    `<linearGradient id="metal" gradientUnits="userSpaceOnUse" x1="-40" y1="-105" x2="40" y2="105">` +
    `<stop offset="0" stop-color="${rgb(mix(accent, [255, 255, 255], 0.6))}"/><stop offset="0.55" stop-color="${rgb(accent)}"/><stop offset="1" stop-color="${rgb(mix(accent, INK, 0.3))}"/></linearGradient></defs>` +
    `<rect width="${String(SIZE)}" height="${String(SIZE)}" fill="${rgb(INK)}"/><circle cx="${String(HALF)}" cy="${String(HALF)}" r="${n(SIZE * RING_RADIUS)}" fill="url(#stone)"/>` +
    `<g fill="none" stroke="#f8f3e6" stroke-opacity="0.07" stroke-width="2.5" stroke-linecap="round">` +
    `<path d="M70 150C150 190 190 120 270 170S400 150 450 210"/><path d="M90 330C170 300 210 370 300 340S400 360 440 320"/><path d="M200 60C230 130 180 200 230 270"/></g>` +
    wreath(gilded(accent)) +
    `<g transform="translate(5 7)" opacity="0.6"><g transform="${centre}">${symbol(rgb(INK), "none")}</g></g>` +
    `<g transform="${centre}">${symbol("url(#metal)", rgb(mix(INK, accent, 0.1)))}</g></svg>`
  );
}

/** The emblem as a picture an <img> can show: a data URL, so nothing is fetched. */
export function emblemPortrait(god: GodId): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(emblemSvg(god))}`;
}

/**
 * What fills the portrait circle the moment the god is named. With a picture of the player, nothing yet: the
 * portrait is still coming. With no picture none ever will, so the circle holds the god's emblem from the start.
 */
export function firstPortrait(god: GodId, pictureTaken: boolean): string | null {
  return pictureTaken ? null : emblemPortrait(god);
}
