// The move guide: a large stick figure doing the move on a loop, its name and one line on how, the time left, and
// a live checklist of what the move's detector is seeing. Drawn with SVG; everything that changes per frame is
// written straight to the page inside one animation-frame loop, so React renders only when the move changes.
// The figure and the checklist come from ../guide.
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { Baseline, MoveDef, PoseHistory } from "../../core/types";
import { VIEW, guideFor, liveChecks, poseAt, toScreen, towardOf } from "../guide";
import type { Guide, GuideEnd, GuideJoint, ScreenFigure } from "../guide";
import "./moveGuide.css";

export interface MoveGuideProps {
  move: MoveDef;
  /** The frames the game holds right now, read once per animation frame. Null with no camera: the checklist stays empty. */
  history: () => PoseHistory | null;
  /** The player's standing measure. Left out, the history's own baseline is used. */
  baseline?: Baseline | null;
  /** Time left to make the move and the whole time given. Left out, no time bar is drawn. */
  msLeft?: number;
  msTotal?: number;
  size?: "large" | "medium";
  /** True (the default): the player's left is at the left of the picture, like the camera view, so it is copied like a mirror. */
  mirrored?: boolean;
}

type Side = "left" | "right";
const SIDES: readonly Side[] = ["left", "right"];
const ROWS = 4;
/** How long the match stays lit after a strike is read, which is over in a frame or two. */
const MATCH_SHOWN_MS = 700;
const HEAD = 11;
const END = 5.5;
const KNEE = 3.5;

const BONES: readonly (readonly [GuideJoint, GuideJoint, GuideEnd])[] = SIDES.flatMap((side): [GuideJoint, GuideJoint, GuideEnd][] => [
  [`${side}Shoulder`, `${side}Elbow`, `${side}Wrist`], [`${side}Elbow`, `${side}Wrist`, `${side}Wrist`],
  [`${side}Hip`, `${side}Knee`, `${side}Foot`], [`${side}Knee`, `${side}Foot`, `${side}Foot`],
]);
const DOTS: readonly (readonly [GuideEnd, number])[] = [
  ["leftKnee", KNEE], ["rightKnee", KNEE], ["leftFoot", END], ["rightFoot", END], ["leftWrist", END], ["rightWrist", END],
];
const TORSO: readonly GuideJoint[] = ["leftShoulder", "rightShoulder", "rightHip", "leftHip"];

const n = (value: number): string => value.toFixed(1);
const torsoPoints = (figure: ScreenFigure): string => TORSO.map((name) => `${n(figure.at[name][0])},${n(figure.at[name][1])}`).join(" ");
/** A limb is lit when its end is the moving one; a leg is one limb whether the move is named for its knee or its foot. */
const lit = (moving: readonly GuideEnd[], end: GuideEnd): boolean =>
  moving.some((each) => each === end || (each.slice(0, -4) === end.slice(0, -4) && !each.endsWith("Wrist") && !end.endsWith("Wrist")));

/** One figure. Every part carries a data attribute so `paint` can move it without React. */
function Figure({ figure, moving, live, children }: { figure: ScreenFigure; moving: readonly GuideEnd[]; live?: boolean; children?: React.ReactNode }) {
  const body = moving.includes("head") ? "mg-lit" : undefined;
  return (
    <svg className={live ? "mg-svg mg-live" : "mg-svg"} viewBox={`0 ${String(VIEW.top)} ${String(VIEW.width)} ${String(VIEW.height)}`} aria-hidden="true">
      <line className="mg-floor" x1="20" y1="192" x2={VIEW.width - 20} y2="192" />
      {children}
      <polygon className={body} data-torso="" points={torsoPoints(figure)} />
      <circle className={body} data-j="head" data-r={HEAD} cx={n(figure.at.head[0])} cy={n(figure.at.head[1])} r={HEAD} />
      {BONES.map(([a, b, end]) => (
        <line key={a} className={lit(moving, end) ? "mg-lit" : undefined} data-a={a} data-b={b}
          x1={n(figure.at[a][0])} y1={n(figure.at[a][1])} x2={n(figure.at[b][0])} y2={n(figure.at[b][1])} />
      ))}
      {DOTS.map(([end, r]) => (
        <g key={end} className={lit(moving, end) ? "mg-lit" : undefined}>
          <circle className="mg-ring" data-ring={end} data-r={r} cx={n(figure.at[end][0])} cy={n(figure.at[end][1])}
            r={n(r * figure.size[end] * 1.5)} opacity={n(Math.min(1, figure.size[end] - 1))} />
          <circle data-j={end} data-r={r} cx={n(figure.at[end][0])} cy={n(figure.at[end][1])} r={n(r * figure.size[end])} />
        </g>
      ))}
    </svg>
  );
}

/** Moves the parts of a live figure to `figure`. */
function paint(svg: SVGSVGElement, figure: ScreenFigure): void {
  svg.querySelector("[data-torso]")?.setAttribute("points", torsoPoints(figure));
  for (const line of svg.querySelectorAll<SVGLineElement>("[data-a]")) {
    const [x1, y1] = figure.at[line.dataset.a as GuideJoint];
    const [x2, y2] = figure.at[line.dataset.b as GuideJoint];
    line.setAttribute("x1", n(x1)); line.setAttribute("y1", n(y1)); line.setAttribute("x2", n(x2)); line.setAttribute("y2", n(y2));
  }
  for (const dot of svg.querySelectorAll<SVGCircleElement>("[data-j], [data-ring]")) {
    const name = (dot.dataset.j ?? dot.dataset.ring) as GuideJoint;
    const grow = name === "head" ? 1 : figure.size[name as GuideEnd];
    const ring = dot.dataset.ring !== undefined;
    dot.setAttribute("cx", n(figure.at[name][0])); dot.setAttribute("cy", n(figure.at[name][1]));
    dot.setAttribute("r", n(Number(dot.dataset.r) * grow * (ring ? 1.5 : 1)));
    if (ring) dot.setAttribute("opacity", n(Math.min(1, grow - 1)));
  }
}

/** The path each moving end takes from the start pose through the move, as arrows. A move of the whole body gets one beside it. */
function arrows(guide: Guide, mirrored: boolean): string[] {
  const whole = guide.moving.includes("head");
  return guide.moving.flatMap((end) => {
    const path = guide.keyframes.map((key) => toScreen(key.pose, towardOf(key), mirrored).at[end]);
    const points = path.filter((point, index) => index === 0 || Math.hypot(point[0] - (path[index - 1]?.[0] ?? 0), point[1] - (path[index - 1]?.[1] ?? 0)) > 1);
    const [first, last] = [points[0], points.at(-1)];
    if (!first || !last || points.length < 2) return [];
    const sideways = Math.abs(last[0] - first[0]) > Math.abs(last[1] - first[1]);
    const [dx, dy] = whole ? (sideways ? [0, -34] : [70, 0]) : [0, 0];
    return [points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${n(x + dx)} ${n(y + dy)}`).join(" ")];
  });
}

const REDUCED = "(prefers-reduced-motion: reduce)";
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (changed) => {
      const query = window.matchMedia(REDUCED);
      query.addEventListener("change", changed);
      return () => { query.removeEventListener("change", changed); };
    },
    () => window.matchMedia(REDUCED).matches,
    () => false,
  );
}

export function MoveGuide(props: MoveGuideProps) {
  const { move, history, baseline, msLeft, msTotal, size = "large", mirrored = true } = props;
  const guide = useMemo(() => guideFor(move), [move]);
  const still = useReducedMotion();
  const root = useRef<HTMLElement>(null);
  // The newest props, so a parent that re-renders every frame does not restart the loop.
  const latest = useRef({ history, baseline, msLeft, msTotal });
  useEffect(() => { latest.current = { history, baseline, msLeft, msTotal }; }, [history, baseline, msLeft, msTotal]);

  useEffect(() => {
    const holder = root.current;
    if (!holder) return;
    const svg = holder.querySelector<SVGSVGElement>(".mg-live");
    const rows = [...holder.querySelectorAll<HTMLLIElement>(".mg-checks li")];
    const labels = rows.map((row) => row.querySelector(".mg-label"));
    const began = performance.now();
    let matchedAt = -Infinity;
    let handle = 0;
    const loop = (now: number): void => {
      if (svg && guide && !still) {
        const { pose, toward } = poseAt(guide, now - began);
        paint(svg, toScreen(pose, toward, mirrored));
      }
      const { history: read, baseline: standing, msLeft: left, msTotal: total } = latest.current;
      const frames = read();
      const live = standing === undefined ? liveChecks(move, frames) : liveChecks(move, frames, standing);
      if (live.matched) matchedAt = now;
      const matched = now - matchedAt < MATCH_SHOWN_MS;
      rows.forEach((row, index) => {
        const check = live.checks[index];
        row.hidden = !check;
        if (!check) return;
        const label = labels[index];
        if (label && label.textContent !== check.label) label.textContent = check.label;
        // While the match is lit every row stays ticked: "fast" and "first" stop being true a moment after a strike lands.
        row.dataset.met = String(check.met || matched);
        row.style.setProperty("--mg-progress", (matched ? 1 : check.progress).toFixed(3));
      });
      holder.dataset.matched = String(matched);
      holder.dataset.live = String(frames !== null && frames.frames.length > 0);
      holder.style.setProperty("--mg-match", (matched ? 1 : live.overall).toFixed(3));
      holder.style.setProperty("--mg-time", (total !== undefined && total > 0 ? Math.min(1, Math.max(0, (left ?? 0) / total)) : 0).toFixed(3));
      const percent = holder.querySelector(".mg-match-number");
      const text = matched ? "Match!" : `${String(Math.round(live.overall * 100))}%`;
      if (percent && percent.textContent !== text) percent.textContent = text;
      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(handle); };
  }, [move, guide, still, mirrored]);

  const first = guide?.keyframes[0];
  const checks = liveChecks(move, null).checks;
  // Without motion: every different pose of the loop side by side, in order.
  const steps = (guide?.keyframes ?? []).filter((key, index, all) => JSON.stringify(key.pose) !== JSON.stringify(all[index - 1]?.pose));
  const screen = (key: Guide["keyframes"][number]): ScreenFigure => toScreen(key.pose, towardOf(key), mirrored);

  return (
    <section ref={root} className={`move-guide ${size} ${move.kind}`} aria-label={`How to do ${move.name}`}>
      {guide && first && (
        <div className={still ? "mg-figure mg-steps" : "mg-figure"}>
          {guide.keyframes.some((key) => key.toward > 0) && <p className="mg-depth">Bigger = toward the camera</p>}
          {still
            ? steps.map((key, index) => (
              <figure key={key.t}>
                <Figure figure={screen(key)} moving={guide.moving} />
                <figcaption>{String(index + 1)}</figcaption>
              </figure>
            ))
            : (
              <Figure figure={screen(first)} moving={guide.moving} live>
                <defs>
                  <marker id="mg-head" viewBox="0 0 10 10" refX="6" refY="5" markerUnits="userSpaceOnUse" markerWidth="16" markerHeight="16" orient="auto">
                    <path d="M0 0L10 5L0 10z" />
                  </marker>
                </defs>
                {arrows(guide, mirrored).map((d) => <path key={d} className="mg-arrow" d={d} markerEnd="url(#mg-head)" />)}
              </Figure>
            )}
        </div>
      )}
      <div className="mg-words">
        <p className="mg-kind">{move.kind === "defend" ? "Defend: hold it" : "Strike"}</p>
        <h2 className="mg-name">{guide?.title ?? move.name}</h2>
        <p className="mg-how">{guide?.how ?? move.hint}</p>
        {msTotal !== undefined && <div className="mg-time" role="presentation"><div className="mg-time-fill" /></div>}
        <div className="mg-match">
          <span className="mg-match-word">Match</span>
          <div className="mg-match-bar"><div className="mg-match-fill" /></div>
          <span className="mg-match-number">0%</span>
        </div>
        <ol className="mg-checks" aria-label="What the camera is looking for">
          {Array.from({ length: ROWS }, (_, index) => (
            <li key={index} hidden={!checks[index]} data-met="false">
              <span className="mg-tick" aria-hidden="true" />
              <span className="mg-label">{checks[index]?.label ?? ""}</span>
              <span className="mg-bar"><span className="mg-bar-fill" /></span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
