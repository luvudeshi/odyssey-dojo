// The move guide: a large stick figure doing the move on a loop, its name and one line on how, the time left, and
// a live checklist of what the move's detector is seeing. Drawn with SVG; everything that changes per frame is
// written straight to the page inside one animation-frame loop, so React renders only when the move changes.
// The figure and the checklist come from ../guide.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Baseline, MoveDef, PoseHistory } from "../../core/types";
import { CARD_ROOM, MARK, RING, VIEW, frameOf, guideFor, liveChecks, markSize, motionPaths, poseAt, toScreen, towardOf, viewOf } from "../guide";
import type { Frame, Guide, GuideEnd, GuideJoint, GuideKeyframe, Room, ScreenFigure } from "../guide";
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
  /**
   * "card" (the default) fits the prompt card: a box 260 px wide and at most `--mg-max` (300 px) tall, with the figure
   * framed tight on the part that moves, the instruction and three checks, and no name (the card has its own).
   * "medium" and "large" are for a screen of their own.
   */
  size?: "card" | "medium" | "large";
  /** True (the default): the player's left is at the left of the picture, like the camera view, so it is copied like a mirror. */
  mirrored?: boolean;
}

type Side = "left" | "right";
const SIDES: readonly Side[] = ["left", "right"];
/** How long the match stays lit after a strike is read, which is over in a frame or two. */
const MATCH_SHOWN_MS = 700;
const { head: HEAD, end: END, knee: KNEE } = MARK;
/** On the card an arrow shorter than this is left out: a fist that only grows toward the camera has its ring. */
const SHORT_ARROW = 24;
/** On the card an arrow along a limb's path stops this far, in the drawing's units, before where the fist or foot lands. */
const ARROW_STOP = 14;
/**
 * Whether two still poses on the card get the arrows too. Not for a move of the whole body: its arrow is beside the
 * figure, and in half the card's width that would halve the figure. The two poses show which way it goes.
 */
const stillArrows = (guide: Guide): boolean => !guide.moving.includes("head");
/** The gap between two still poses on the card, in pixels: the same as in moveGuide.css. */
const STEP_GAP = 4;

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
/** `fit` is the card's framing of it (frameOf in ../guide); without one it is drawn whole in the usual box. */
function Figure(props: { figure: ScreenFigure; moving: readonly GuideEnd[]; fit?: Frame | undefined; live?: boolean; children?: React.ReactNode }) {
  const { figure, moving, fit, live, children } = props;
  const body = moving.includes("head") ? "mg-lit" : undefined;
  const marks = fit?.marks ?? 1;
  // On the card a move of the arms is cut off under the hips and hangs from the top of its box; any other stands on the floor.
  const framed = fit ? (fit.whole ? " mg-whole" : " mg-upper") : "";
  return (
    <svg className={`mg-svg${live ? " mg-live" : ""}${framed}`} viewBox={fit ? viewOf(fit) : `0 ${String(VIEW.top)} ${String(VIEW.width)} ${String(VIEW.height)}`}
      preserveAspectRatio={fit ? (fit.whole ? "xMidYMax meet" : "xMidYMin meet") : undefined} aria-hidden="true">
      {(!fit || fit.whole) && <line className="mg-floor" x1="20" y1="192" x2={VIEW.width - 20} y2="192" />}
      {children}
      <polygon className={body} data-torso="" points={torsoPoints(figure)} />
      <circle className={body} data-j="head" data-r={HEAD} cx={n(figure.at.head[0])} cy={n(figure.at.head[1])} r={HEAD} />
      {BONES.map(([a, b, end]) => (
        <line key={a} className={body ?? (lit(moving, end) ? "mg-lit" : undefined)} data-a={a} data-b={b}
          x1={n(figure.at[a][0])} y1={n(figure.at[a][1])} x2={n(figure.at[b][0])} y2={n(figure.at[b][1])} />
      ))}
      {DOTS.map(([end, r]) => (
        <g key={end} className={body ?? (lit(moving, end) ? "mg-lit" : undefined)}>
          <circle className="mg-ring" data-ring={end} data-r={r} data-marks={marks} cx={n(figure.at[end][0])} cy={n(figure.at[end][1])}
            r={n(r * markSize(figure.size[end], marks) * RING)} opacity={n(Math.min(1, figure.size[end] - 1))} />
          <circle data-j={end} data-r={r} data-marks={marks} cx={n(figure.at[end][0])} cy={n(figure.at[end][1])} r={n(r * markSize(figure.size[end], marks))} />
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
    dot.setAttribute("r", n(Number(dot.dataset.r) * markSize(grow, Number(dot.dataset.marks ?? 1)) * (ring ? RING : 1)));
    if (ring) dot.setAttribute("opacity", n(Math.min(1, grow - 1)));
  }
}

/**
 * The path of each moving end as an SVG path. `least` leaves out the ones too short to read as an arrow, and `short`
 * stops each that far before its end, so the arrow's head points at the fist where it lands and is not under it.
 */
function arrows(guide: Guide, mirrored: boolean, least = 0, short = 0): string[] {
  type Point = readonly [number, number];
  const length = (points: readonly Point[]): number =>
    points.reduce((sum, [x, y], index) => sum + Math.hypot(x - (points[index - 1]?.[0] ?? x), y - (points[index - 1]?.[1] ?? y)), 0);
  const stopped = (points: readonly Point[]): readonly Point[] => {
    const [before, last] = [points.at(-2), points.at(-1)];
    if (!before || !last) return points;
    const span = Math.hypot(last[0] - before[0], last[1] - before[1]);
    // A last stretch too short to shorten is left as it is.
    if (span < short * 2) return points;
    const keep = (span - short) / span;
    return [...points.slice(0, -1), [before[0] + (last[0] - before[0]) * keep, before[1] + (last[1] - before[1]) * keep]];
  };
  return motionPaths(guide, mirrored)
    .filter((points) => length(points) >= least)
    .map((points) => stopped(points).map(([x, y], index) => `${index === 0 ? "M" : "L"}${n(x)} ${n(y)}`).join(" "));
}

/**
 * Says whether the game is reading a body. With none (keyboard, no camera) the match bar and the ticks are hidden,
 * and on the card the height the match bar had goes to the figure (`--mg-spare`), so the guide is exactly as tall
 * as before. Where the card around it already hides the bar there is nothing to hand over. Measures only on a change.
 */
function showLive(holder: HTMLElement, live: boolean): void {
  if (holder.dataset.live === String(live)) return;
  delete holder.dataset.live;
  const match = holder.querySelector<HTMLElement>(".mg-match");
  const height = live || !match ? 0 : match.offsetHeight;
  const gap = height > 0 ? Number.parseFloat(getComputedStyle(holder).rowGap) || 0 : 0;
  holder.style.setProperty("--mg-spare", `${String(height + gap)}px`);
  holder.dataset.live = String(live);
}
const isLive = (frames: PoseHistory | null): boolean => frames !== null && frames.frames.length > 0;

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
  const { move, history, baseline, msLeft, msTotal, size = "card", mirrored = true } = props;
  const rowCount = size === "card" ? 3 : 4;
  const guide = useMemo(() => guideFor(move), [move]);
  const still = useReducedMotion();
  const root = useRef<HTMLElement>(null);
  // The newest props, so a parent that re-renders every frame does not restart the loop.
  const latest = useRef({ history, baseline, msLeft, msTotal });
  useEffect(() => { latest.current = { history, baseline, msLeft, msTotal }; }, [history, baseline, msLeft, msTotal]);

  // Before the first paint, so the match bar never flashes in a keyboard fight.
  useLayoutEffect(() => {
    if (root.current) showLive(root.current, isLive(latest.current.history()));
  }, [move]);

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
      const live = liveChecks(move, frames, standing === undefined ? frames?.baseline : standing, rowCount);
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
      showLive(holder, isLive(frames));
      holder.style.setProperty("--mg-match", (matched ? 1 : live.overall).toFixed(3));
      holder.style.setProperty("--mg-time", (total !== undefined && total > 0 ? Math.min(1, Math.max(0, (left ?? 0) / total)) : 0).toFixed(3));
      const percent = holder.querySelector(".mg-match-number");
      const text = matched ? "Match!" : `${String(Math.round(live.overall * 100))}%`;
      if (percent && percent.textContent !== text) percent.textContent = text;
      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(handle); };
  }, [move, guide, still, mirrored, rowCount]);

  // How much room the figure has on the card, read from the page: its box, and the corners the card cuts off
  // (`--mg-corner-w`, `--mg-corner-h`). Read again only when the box changes size, never per frame.
  const card = size === "card";
  const [room, setRoom] = useState<Room>(CARD_ROOM);
  useLayoutEffect(() => {
    const box = root.current?.querySelector<HTMLElement>(".mg-figure");
    if (!box || !card) return;
    const read = (): void => {
      const style = getComputedStyle(box);
      const px = (value: string): number => Number.parseFloat(value) || 0;
      const [width, height] = [px(style.width), px(style.height)];
      const [cornerWidth, cornerHeight] = [px(style.getPropertyValue("--mg-corner-w")), px(style.getPropertyValue("--mg-corner-h"))];
      if (width <= 0 || height <= 0) return;
      setRoom((now) => (now.width === width && now.height === height && now.cornerWidth === cornerWidth && now.cornerHeight === cornerHeight
        ? now : { width, height, cornerWidth, cornerHeight }));
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const watcher = new ResizeObserver(read);
    watcher.observe(box);
    return () => { watcher.disconnect(); };
  }, [card, move, still]);

  const first = guide?.keyframes[0];
  const checks = liveChecks(move, null, null, rowCount).checks;
  // Without motion: every different pose of the loop side by side, in order. The card has room for two big ones,
  // so it shows the last two: where the telling part of the move begins and where it ends.
  const steps = useMemo((): readonly GuideKeyframe[] => {
    const poses = (guide?.keyframes ?? []).filter((key, index, all) => JSON.stringify(key.pose) !== JSON.stringify(all[index - 1]?.pose));
    return card ? poses.slice(-2) : poses;
  }, [guide, card]);
  // On the card the figure is framed to fill its box. Two still poses share it: half each, at one scale, each
  // keeping clear of the corner on its own side.
  const fits = useMemo((): readonly Frame[] => {
    if (!guide || !card) return [];
    if (!still || steps.length < 2) return [frameOf(guide, mirrored, room, still ? { keys: steps, arrows: false } : {})];
    const half = (corners: "left" | "right"): Room => ({ ...room, width: (room.width - STEP_GAP) / 2, corners });
    const fit = (corners: "left" | "right", atMost = Infinity): Frame => frameOf(guide, mirrored, half(corners), { keys: steps, arrows: stillArrows(guide), atMost });
    const scale = Math.min(fit("left").scale, fit("right").scale);
    const [one, two] = [fit("left", scale), fit("right", scale)];
    // Both at the height of the lower one, which keeps each clear of its corner.
    const top = Math.min(one.top, two.top);
    return [{ ...one, top }, { ...two, top }];
  }, [guide, card, still, steps, mirrored, room]);
  const screen = (key: Guide["keyframes"][number]): ScreenFigure => toScreen(key.pose, towardOf(key), mirrored);
  const paths = guide ? arrows(guide, mirrored, card ? SHORT_ARROW : 0, card && !guide.moving.includes("head") ? ARROW_STOP : 0) : [];
  const head = card ? 26 : 16;
  const trail = (
    <>
      <defs>
        <marker id="mg-head" viewBox="0 0 10 10" refX="6" refY="5" markerUnits="userSpaceOnUse" markerWidth={head} markerHeight={head} orient="auto">
          <path d="M0 0L10 5L0 10z" />
        </marker>
      </defs>
      {paths.map((d) => <path key={d} className="mg-arrow" d={d} markerEnd="url(#mg-head)" />)}
    </>
  );

  return (
    <section ref={root} className={`move-guide ${size} ${move.kind}`} aria-label={`How to do ${move.name}`}>
      {guide && first && (
        <div className={still ? "mg-figure mg-steps" : "mg-figure"}>
          {guide.keyframes.some((key) => key.toward > 0) && <p className="mg-depth">Bigger = toward the camera</p>}
          {still
            ? steps.map((key, index) => (
              <figure key={key.t}>
                <Figure figure={screen(key)} moving={guide.moving} fit={fits[index]}>
                  {card && stillArrows(guide) && steps.length > 1 && index === steps.length - 1 ? trail : null}
                </Figure>
                <figcaption>{String(index + 1)}</figcaption>
              </figure>
            ))
            : <Figure figure={screen(first)} moving={guide.moving} fit={fits[0]} live>{trail}</Figure>}
        </div>
      )}
      <div className="mg-words">
        <p className="mg-kind">{move.kind === "defend" ? "Defend" : "Strike"}</p>
        <h2 className="mg-name">{guide?.title ?? move.name}</h2>
        <p className="mg-how">{guide?.how ?? move.hint}</p>
        {msTotal !== undefined && <div className="mg-time" role="presentation"><div className="mg-time-fill" /></div>}
        <div className="mg-match">
          <span className="mg-match-word">Match</span>
          <div className="mg-match-bar"><div className="mg-match-fill" /></div>
          <span className="mg-match-number">0%</span>
        </div>
        <ol className="mg-checks" aria-label="What the camera is looking for">
          {Array.from({ length: rowCount }, (_, index) => (
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
