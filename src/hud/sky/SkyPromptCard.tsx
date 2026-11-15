// The ONE prompt card in the Obsidian Rift look, at the right edge: a faceted slab of black glass. DEFEND is broad and
// flat-topped with cold ice-blue edges and counts down along a blue crack at its top; STRIKE rises to a spear point with
// lava cracks bleeding in from its edges and counts down along a lava seam at its foot; FINISH is the strike shard with
// a star burst and a pulsing rim. The glass is measured from the card's box, so it grows with its text and nothing runs
// into the countdown. Same props and same logic as the pebble PromptCard in Hud.tsx.
import { type CSSProperties, useId, useMemo } from "react";
import { promptLevel } from "../../combat/engine";
import { MoveGuide } from "../../coach/ui/MoveGuide";
import type { MoveDef, PoseHistory } from "../../core/types";
import { useSettings } from "../../settings/store";
import { useBoxSize } from "../../ui/pebble/hooks";
import { keyLabel } from "../Hud";
import { cardGlass, jagLine } from "./rift/geometry";
import { riftTextures } from "./rift/lava";
import "./tokens.css";
import "./card.css";

export type SkyCardKind = "defend" | "strike" | "finish";

/** Before the first measure (and in server rendering) the glass is drawn at this size. */
const FALLBACK = { w: 300, h: 500 } as const;
const ARROWS: Record<string, string> = { ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓" };
const n = (v: number): string => v.toFixed(1);
/** The keyboard and the guest have no camera frames: the guide then lists what to do without ticking it. */
const NO_HISTORY = (): null => null;

/** Letters in the longest word of a move name. The name breaks only at spaces; card.css shrinks it so this word fits. */
export function longestWord(text: string): number {
  return Math.max(1, ...text.split(/\s+/).map((word) => word.length));
}

/** A four-pointed star, for the finish burst and the glints on the ice. */
const star = (x: number, y: number, r: number): string => `M${n(x)},${n(y - r)} Q${n(x)},${n(y)} ${n(x + r)},${n(y)} Q${n(x)},${n(y)} ${n(x)},${n(y + r)} Q${n(x)},${n(y)} ${n(x - r)},${n(y)} Q${n(x)},${n(y)} ${n(x)},${n(y - r)}Z`;

function Shape({ kind, w, h, left, label }: { kind: SkyCardKind; w: number; h: number; left: number; label: string }) {
  const grad = `sky-card-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const pointed = kind !== "defend", pct = Math.max(0, Math.min(1, left)) * 100;
  // The timer redraws this every frame: the glass itself is only recut when the card changes size or kind.
  const g = useMemo(() => cardGlass(w, h, pointed), [w, h, pointed]);
  const timer = useMemo(() => (pointed ? jagLine(36, w - 36, h - 28, 9) : jagLine(32, w - 32, 30, 4)), [w, h, pointed]);
  // Both kinds are molten rock: the plate is dark and red-black, the rim cools from white-hot to deep red. Only the timer line and the tag are ice for a defend.
  const stops = ["#2a1012", "#0c0607", "#2a0c06"];
  const rim = `${grad}-rim`, melt = `${grad}-melt`, timerY = pointed ? h - 28 : 30, lava = riftTextures().lava;
  return (
    <svg className="sky-card__shape" viewBox={`0 0 ${n(w)} ${n(h)}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(left * 100)}>
      <defs>
        <linearGradient id={grad} x1="0" y1="0" x2="1" y2="1">
          {stops.map((c, i) => <stop key={c} offset={String(i / 2)} stopColor={c} />)}
        </linearGradient>
        <linearGradient id={rim} x1="0" y1="0" x2="0" y2="1">
          {[["0", "#fff2c0"], ["0.3", "#ff9a2a"], ["0.7", "#c8300a"], ["1", "#5a0e04"]].map(([o, c]) => <stop key={o} offset={o} stopColor={c} />)}
        </linearGradient>
        <pattern id={melt} patternUnits="userSpaceOnUse" x="0" y={n(timerY - 8)} width="80" height="16"><image href={lava} width="80" height="16" preserveAspectRatio="none" /></pattern>
      </defs>
      <path d={g.outline} className="sky-card__aura sky-card__aura--wide" />
      <path d={g.outline} className="sky-card__aura" />
      <path d={g.outline} className="sky-card__plate" />
      {g.facets.map((f) => <path key={f.d} d={f.d} fill={f.fill} />)}
      <path d={g.outline} className="sky-card__rim" stroke={`url(#${rim})`} />
      <path d={g.inner} fill={`url(#${grad})`} className="sky-card__panel" />
      <path d={g.cracks} className="sky-card__crack sky-card__crack--glow" />
      <path d={g.cracks} className="sky-card__crack" />
      {!pointed && <path d={g.topEdge} className="sky-card__sheen" />}
      {g.glints.map(([x, y]) => <path key={`${n(x)},${n(y)}`} d={star(x, y, 9)} className="sky-card__glint" />)}
      <path d={timer} pathLength="100" className="sky-card__trough" />
      <path d={timer} pathLength="100" strokeDasharray={`${String(pct)} 100`} className="sky-card__timer sky-card__timer--glow" />
      {pointed
        ? <><path d={timer} pathLength="100" strokeDasharray={`${String(pct)} 100`} className="sky-card__timer sky-card__timer--lava" style={{ stroke: `url(#${melt})` }} /><path d={timer} pathLength="100" strokeDasharray={`${String(pct)} 100`} className="sky-card__timer sky-card__timer--core" /></>
        : <path d={timer} pathLength="100" strokeDasharray={`${String(pct)} 100`} className="sky-card__timer" />}
      {kind === "finish" && <path d={g.outline} className="sky-card__pulse" />}
      {kind === "finish" && (
        <g className="sky-card__burst">
          <path d={star(w / 2, -18, 15)} />
          <path d={star(16, 100, 9)} />
          <path d={star(w - 16, 100, 9)} />
        </g>
      )}
    </svg>
  );
}

/** Same props as the pebble PromptCard; `finisher` turns a strike card into the FINISH card. */
export function SkyPromptCard(props: { move: MoveDef; target: string; successes: number; left: number; situation?: string | null; finisher?: boolean; history?: () => PoseHistory | null }) {
  const { move, target, successes, left, situation, finisher, history = NO_HISTORY } = props;
  const level = promptLevel(successes);
  const { keyHints } = useSettings();
  const [ref, box] = useBoxSize<HTMLDivElement>();
  const kind: SkyCardKind = move.kind === "defend" ? "defend" : finisher === true ? "finish" : "strike";
  const key = keyHints ? (
    <span className="sky-key" data-arrow={ARROWS[move.key]}>
      <kbd>{keyLabel(move.key)}</kbd>
    </span>
  ) : null;
  const tag = kind === "defend" ? "DEFEND" : kind === "finish" ? "FINISH" : "STRIKE";
  const full = level === "full";
  const word = { "--chars": String(longestWord(move.prompt)) } as CSSProperties;
  return (
    <div ref={ref} className={`sky-hud sky-card sky-card--${kind} sky-card--${level}`}>
      <Shape kind={kind} w={box.w || FALLBACK.w} h={box.h || FALLBACK.h} left={left} label={`${move.kind === "defend" ? "Defend" : "Strike"} time left`} />
      <div className="sky-card__tag">{tag}</div>
      <div className="sky-card__in">
        <MoveGuide key={move.id} move={move} history={history} />
        <div className="sky-card__word" style={word}>{move.prompt}</div>
        {level !== "mini" && <div className="sky-card__target">{target}</div>}
        {full && situation && <div className="sky-card__situation">{situation}</div>}
        {/* No HOLD tag: a defend made once while the attack is coming counts. */}
        <div className="sky-card__hint">{key}</div>
      </div>
    </div>
  );
}
