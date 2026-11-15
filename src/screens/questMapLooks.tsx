// Draft round (?look=a|b|c): the quest map's tokens, Troy, Ithaca, the ship and the frame, drawn once and painted per look
// in questMapLooks.css. The marks reuse the menu cards' classes (.f figure, .l lines, .s incised, .e accent, .h opening),
// so look A is bronze, B is laid in stones and C is black-figure, matching the cards of the same letter.
import type { ReactNode } from "react";
import { look } from "../ui/lookSwitch";
import { LookDefs, PebbleFrame, RICH_ICONS } from "./menuCardLooks";
import "./menuCardLooks.css";
import "./questMapLooks.css";

type Point = readonly [number, number];

/** One emblem per monster, in a 40 x 40 box. */
const EMBLEMS: Record<string, ReactNode> = {
  polyphemus: (
    <>
      <path className="f" d="M2 21 Q20 5 38 21 Q20 37 2 21 Z" />
      <circle className="h" cx="20" cy="21" r="6" />
      <path className="l" d="M8 12 l-3 -4 M14 9 l-2 -5 M20 8 v-5 M26 9 l2 -5 M32 12 l3 -4" />
    </>
  ),
  circe: (
    <>
      <path className="f" d="M5 10 H35 Q34 24 20 25 Q6 24 5 10 Z" />
      <path className="s" d="M8 15 H32" />
      <path className="l" d="M20 25 V33 M33 5 L38 1" />
      <path className="f" d="M11 37 Q20 31 29 37 Z" />
    </>
  ),
  sirens: (
    <>
      <path className="l" d="M10 34 Q3 18 11 5 M30 34 Q37 18 29 5 M9 9 H31" />
      <path className="l t" d="M16 10 V31 M20 10 V31 M24 10 V31" />
      <path className="f" d="M7 31 H33 V37 H7 Z" />
    </>
  ),
  scylla: (
    <>
      <path className="l" d="M7 39 Q2 24 10 15 M20 39 Q15 22 20 11 M33 39 Q39 26 30 17" />
      <ellipse className="f" cx="12" cy="12" rx="5" ry="3.2" transform="rotate(-30 12 12)" />
      <ellipse className="f" cx="22" cy="8" rx="5" ry="3.2" transform="rotate(-10 22 8)" />
      <ellipse className="f" cx="28" cy="14" rx="5" ry="3.2" transform="rotate(25 28 14)" />
      <path className="s" d="M14 11 l2 1 M24 7 l2 1 M30 14 l2 1" />
    </>
  ),
  charybdis: <path className="l" d="M20 20 a2 2 0 0 1 4 0 a4 4 0 0 1 -8 0 a6 6 0 0 1 12 0 a8 8 0 0 1 -16 0 a10 10 0 0 1 20 0 a12 12 0 0 1 -24 0" />,
  suitors: (
    <>
      <path className="l" d="M11 3 Q32 20 11 37" />
      <path className="l t" d="M11 3 V37" />
      <path className="l" d="M3 20 H33" />
      <path className="f" d="M38 20 L30 15 L30 25 Z" />
      <path className="s" d="M4 20 l3 -3 M4 20 l3 3" />
    </>
  ),
};

/** A stop on the map: a round token with the monster's emblem. */
export function MapToken(props: { id: string }) {
  return (
    <svg className="lk-token" viewBox="0 0 64 64" aria-hidden="true">
      <circle className="lk-disc" cx="32" cy="32" r="28" />
      <g className="lk-icon" transform="translate(12 12)">{EMBLEMS[props.id]}</g>
    </svg>
  );
}

const TROY = (
  <>
    <path className="f" d="M-26 12 V-6 H-19 V-14 H-12 V-6 H-6 V-18 H6 V-6 H12 V-14 H19 V-6 H26 V12 Z" />
    <path className="h" d="M-4 12 V2 Q0 -3 4 2 V12 Z" />
    <path className="s" d="M-26 0 H-6 M6 0 H26 M-19 -10 H-12 M12 -10 H19" />
  </>
);

const TEMPLE = (
  <>
    <path className="f" d="M-30 -12 L0 -30 L30 -12 Z" />
    <path className="f" d="M-28 -10 H28 V-5 H-28 Z M-31 18 H31 V23 H-31 Z" />
    <path className="l" d="M-20 -3 V17 M-7 -3 V17 M7 -3 V17 M20 -3 V17" />
    <circle className="e" cx="0" cy="-17" r="3" />
  </>
);

/** Where the ship is: halfway along the leg to the first stop not yet won, on the same curve as the route. */
function shipAt(points: readonly Point[], next: number): Point {
  const a = points[next] ?? [0, 0], b = points[next + 1] ?? a, off = next % 2 === 0 ? -60 : 60;
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + off / 2];
}

/** Everything the looks add inside the chart's SVG: the frame's compass, Troy, Ithaca and the ship. */
export function MapDecor(props: { points: readonly Point[]; next: number; home: boolean }) {
  const { points, next, home } = props;
  const troy = points[0] ?? [0, 0], ithaca = points[points.length - 1] ?? [0, 0];
  const [sx, sy] = home ? [ithaca[0] - 6, ithaca[1] + 104] : shipAt(points, next);
  return (
    <g className="lk-decor">
      {look === "a" && (
        <g className="lk-compass lk-icon" transform="translate(940 356)">
          <path className="f" d="M0 -38 L6 -6 L38 0 L6 6 L0 38 L-6 6 L-38 0 L-6 -6 Z" />
          <path className="l t" d="M0 -38 V38 M-38 0 H38 M-20 -20 L20 20 M20 -20 L-20 20" />
          <circle className="h" r="5" />
        </g>
      )}
      <g className="lk-icon lk-troy" transform={`translate(${String(troy[0])} ${String(troy[1] - 8)})`}>{TROY}</g>
      <g className={`lk-icon lk-ithaca ${home ? "lk-lit" : ""}`} transform={`translate(${String(ithaca[0])} ${String(ithaca[1] - 10)})`}>
        {home && <path className="lk-rays" d="M0 -46 V-62 M-34 -34 L-44 -46 M34 -34 L44 -46 M-46 -4 H-62 M46 -4 H62" />}
        {TEMPLE}
      </g>
      <g className="lk-icon lk-ship" transform={`translate(${String(sx - 24)} ${String(sy - 31)}) scale(0.5)`}>{RICH_ICONS.ship}</g>
    </g>
  );
}

/** The paint the marks use, and look B's mosaic frame round the chart. */
export function ChartFrame() {
  return (
    <>
      <LookDefs />
      {look === "b" && <div className="lk-chartframe"><PebbleFrame /></div>}
    </>
  );
}
