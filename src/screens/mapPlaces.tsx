// Draft round two (?look=a|b|c): the places on the quest map scene, each drawn as what it is. Every drawing sits in a
// 200 x 150 box whose waterline is y = 140, and is made of marks each look paints its own way (mapScene*.css):
// .rk land and rock, .rk2 darker rock and trees, .bd built stone, .dk openings, .gl light, .fx fire, .sm smoke,
// .fm foam, .ln lines, .nk necks, .halo a soft glow behind the light.
import type { ReactNode } from "react";
import { prefersReducedMotion } from "../ui/pebble";

// The whirlpool turns; with reduced motion it holds still.
const SPIN = prefersReducedMotion() ? null : <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="10s" repeatCount="indefinite" />;

/** Base centre of each place on the 1600 x 900 scene, by enemy id. */
export const PLACE_AT: Record<string, readonly [number, number]> = {
  polyphemus: [390, 430],
  circe: [610, 650],
  sirens: [830, 385],
  scylla: [1040, 605],
  charybdis: [1225, 700],
  suitors: [1395, 410],
};
export const TROY_AT = [245, 610] as const;

const PIG = "c0 -7 6 -11 13 -11 c7 0 11 3 12 7 l4 1 l-2 4 c-1 3 -4 5 -9 5 l-1 3 h-3 l-1 -3 h-6 l-1 3 h-3 l-1 -3 c-2 -1 -2 -3 -2 -6 z";
const HEAD = "M0 0 L14 -6 L22 -2 L14 3 Z";
const NECKS: readonly (readonly [string, number, number, number])[] = [
  ["M44 72 C70 40 96 30 122 24", 122, 24, -12],
  ["M46 74 C80 60 112 56 144 48", 144, 48, -8],
  ["M48 76 C86 80 122 80 158 74", 158, 74, 4],
  ["M46 78 C78 98 108 106 136 102", 136, 102, 14],
  ["M44 80 C66 112 86 126 106 126", 106, 126, 18],
  ["M42 70 C56 30 72 14 92 6", 92, 6, -30],
];

const PLACES: Record<string, ReactNode> = {
  polyphemus: (
    <>
      <path className="rk" d="M0 142 C14 118 22 84 44 70 C58 40 82 18 104 22 C128 26 146 52 158 78 C176 96 190 122 200 142 Z" />
      <path className="rk2" d="M104 22 C112 48 118 62 136 74 C146 82 158 78 158 78 C146 52 128 26 104 22 Z M0 142 C14 118 22 84 44 70 C40 96 34 120 30 142 Z" />
      <path className="ln" d="M44 70 L58 84 M150 70 L142 86 M30 100 L42 108 M120 40 L114 56" />
      <path className="dk" d="M62 142 C60 112 76 86 100 84 C124 86 140 112 138 142 Z" />
      <circle className="halo" cx="100" cy="112" r="34" />
      <ellipse className="gl" cx="100" cy="112" rx="16" ry="11" />
      <ellipse className="dk" cx="100" cy="112" rx="3.6" ry="9.5" />
      <path className="rk2" d="M136 142 C134 126 146 114 160 116 C174 118 178 132 176 142 Z" />
      <path className="fm" d="M0 142 q12 -5 24 0 t24 0 M152 142 q12 -5 24 0 t24 0" />
    </>
  ),
  circe: (
    <>
      <path className="rk" d="M0 142 C24 118 56 110 100 110 C144 110 176 118 200 142 Z" />
      <path className="sm" d="M100 46 C88 34 110 24 98 10 C90 0 102 -8 96 -18 M126 60 C134 46 120 38 130 24" />
      <path className="rk2" d="M26 118 C18 90 28 60 36 48 C44 60 54 90 46 118 Z M158 118 C150 92 160 64 166 56 C172 64 182 92 174 118 Z" />
      <path className="bd" d="M56 74 L100 48 L144 74 Z M58 74 H142 V81 H58 Z M54 106 H146 V113 H54 Z" />
      <path className="ln" d="M66 81 V106 M82 81 V106 M118 81 V106 M134 81 V106" />
      <circle className="halo" cx="100" cy="96" r="26" />
      <path className="gl" d="M91 84 H109 V106 H91 Z" />
      <path className="rk2" d={`M14 140 ${PIG} M150 140 ${PIG}`} />
      <path className="fm" d="M0 142 q12 -5 24 0 t24 0 M152 142 q12 -5 24 0 t24 0" />
    </>
  ),
  sirens: (
    <>
      <circle className="halo" cx="104" cy="36" r="34" />
      <path className="rk" d="M30 142 L46 96 L60 104 L74 60 L90 82 L104 42 L118 72 L132 62 L152 142 Z" />
      <path className="rk2" d="M74 60 L86 142 L60 142 Z M104 42 L112 142 L96 142 Z M132 62 L152 142 L136 142 Z" />
      <path className="rk2" d="M104 42 c-3 -6 -2 -12 2 -14 c4 2 4 8 2 14 z M104 30 c-10 -8 -22 -6 -26 0 c8 -2 16 0 22 4 z M107 30 c10 -8 22 -6 26 0 c-8 -2 -16 0 -22 4 z" />
      <circle className="gl" cx="106" cy="24" r="3.4" />
      <path className="rk2" d="M74 60 c-3 -6 -2 -10 2 -12 c4 2 4 7 2 12 z M74 50 c-8 -6 -18 -4 -20 1 c6 -1 12 0 18 3 z M77 50 c8 -6 18 -4 20 1 c-6 -1 -12 0 -18 3 z" />
      <path className="rk2" d="M150 136 Q172 148 196 128 L190 142 L152 142 Z M4 140 Q14 146 30 138 L28 142 L6 142 Z" />
      <path className="ln" d="M176 136 L190 104 M182 122 L196 118 M14 140 L24 112 M18 126 L30 124" />
      <path className="bn" d="M40 140 l8 -2 M122 140 l7 -3 M160 128 l6 -2" />
      <path className="fm" d="M20 142 q10 -5 20 0 t20 0 M140 142 q10 -5 20 0 t20 0 t20 0" />
    </>
  ),
  scylla: (
    <>
      <path className="rk" d="M0 142 L6 60 L22 24 L44 12 L58 34 L66 80 L76 142 Z" />
      <path className="rk2" d="M22 24 L30 142 L0 142 L6 60 Z M58 34 L66 80 L76 142 L60 142 Z" />
      <path className="dk" d="M30 70 C34 58 48 56 54 66 C56 78 48 86 40 86 C34 86 30 80 30 70 Z" />
      {NECKS.map(([d, x, y, a]) => (
        <g key={d}>
          <path className="nk" d={d} />
          <path className="rk2" d={HEAD} transform={`translate(${String(x - 2)} ${String(y)}) rotate(${String(a)})`} />
          <circle className="gl" cx={x + 9} cy={y - 1} r="1.6" transform={`rotate(${String(a)} ${String(x)} ${String(y)})`} />
        </g>
      ))}
      <path className="fm" d="M0 142 q12 -6 24 0 t24 0 t24 0 t24 0" />
    </>
  ),
  charybdis: (
    <>
      <ellipse className="dk" cx="112" cy="116" rx="86" ry="26" />
      <g transform="translate(112 116) scale(1.85 0.55)">
        <g className="spin">
          {SPIN}
          <path className="fm" d="M0 0 a6 6 0 0 1 12 0 a12 12 0 0 1 -24 0 a18 18 0 0 1 36 0 a24 24 0 0 1 -48 0 a30 30 0 0 1 60 0 a36 36 0 0 1 -72 0 a42 42 0 0 1 84 0" />
        </g>
      </g>
      <ellipse className="fm" cx="112" cy="116" rx="92" ry="28" />
      <path className="rk" d="M0 142 C6 120 20 108 34 108 C48 110 54 124 56 142 Z" />
      <path className="ln" d="M30 108 C28 92 34 80 30 64" />
      <path className="rk2" d="M8 68 C8 50 26 42 38 48 C52 44 62 56 56 68 C52 78 18 80 8 68 Z" />
    </>
  ),
  suitors: (
    <>
      <path className="rk" d="M0 142 C14 112 40 92 70 86 C98 70 132 70 156 88 C180 102 194 122 200 142 Z" />
      <path className="rk2" d="M0 142 C14 112 40 92 70 86 C60 108 52 126 48 142 Z" />
      <path className="lit-only fx" d="M100 40 C90 28 98 16 100 4 C104 16 112 26 100 40 Z" />
      <path className="bd" d="M58 94 V64 L100 40 L142 64 V94 Z" />
      <path className="ln" d="M70 66 V94 M82 66 V94 M118 66 V94 M130 66 V94 M58 64 H142" />
      <circle className="halo" cx="100" cy="84" r="24" />
      <path className="gl" d="M90 94 V72 H110 V94 Z" />
      <path className="ln" d="M168 98 C166 88 170 82 168 72" />
      <path className="rk2" d="M150 74 C150 60 166 54 176 60 C190 58 196 70 188 78 C182 86 156 86 150 74 Z" />
      <path className="fm" d="M0 142 q12 -5 24 0 t24 0 M152 142 q12 -5 24 0 t24 0" />
    </>
  ),
};

/** One place, drawn for its button. */
export function PlaceArt(props: { id: string }) {
  return <svg className="lk-place" viewBox="0 0 200 150" aria-hidden="true">{PLACES[props.id]}</svg>;
}

/** Troy burning behind, drawn straight into the scene at TROY_AT. */
export const TROY = (
  <g className="lk-troy" transform={`translate(${String(TROY_AT[0] - 94)} ${String(TROY_AT[1] - 128)}) scale(0.85)`}>
    <ellipse className="halo" cx="100" cy="80" rx="120" ry="80" />
    <path className="sm" d="M74 40 C62 20 86 0 70 -34 M132 56 C144 34 124 14 140 -18 M30 80 C22 64 36 50 28 30" />
    <path className="fx" d="M28 98 C20 80 30 70 28 52 C38 64 46 80 40 98 Z M66 86 C56 60 70 48 70 24 C84 44 92 64 82 86 Z M124 94 C116 76 128 62 126 46 C138 60 144 78 136 94 Z M172 100 C166 84 174 72 172 58 C184 70 186 86 182 100 Z" />
    <path className="rk" d="M10 150 V108 H24 V96 H40 V108 H62 V84 H86 V108 H120 V92 H140 V108 H170 V98 H186 V108 H210 V150 Z" />
    <path className="ln" d="M10 122 H210 M24 108 V150 M86 108 V150 M140 108 V150 M186 108 V150" />
    <path className="dk" d="M100 150 V128 Q108 118 116 128 V150 Z" />
    <path className="gl" d="M44 116 h6 v8 h-6 z M152 116 h6 v8 h-6 z M70 98 h5 v7 h-5 z" />
  </g>
);
