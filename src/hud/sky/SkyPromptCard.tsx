// The ONE prompt card in the star-chart look, at the right edge: an arch-topped dark stele for DEFEND, a spear-tip light
// tablet for STRIKE, the same tablet with a star burst and a pulsing rim for FINISH. The plate grows with its text, so
// nothing runs into the countdown line. Same props and same logic as the pebble PromptCard in Hud.tsx.
import { promptLevel } from "../../combat/engine";
import { MoveGuide } from "../../coach/ui/MoveGuide";
import type { MoveDef, PoseHistory } from "../../core/types";
import { useSettings } from "../../settings/store";
import { useBoxSize } from "../../ui/pebble/hooks";
import { keyLabel } from "../Hud";
import "./tokens.css";
import "./card.css";

export type SkyCardKind = "defend" | "strike" | "finish";

/** Before the first measure (and in server rendering) the plate is drawn at this size. */
const FALLBACK = { w: 300, h: 460 } as const;
const ARROWS: Record<string, string> = { ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓" };
const n = (v: number): string => v.toFixed(1);
/** The keyboard and the guest have no camera frames: the guide then lists what to do without ticking it. */
const NO_HISTORY = (): null => null;

/** A four-pointed star, for the finish burst. */
const star = (x: number, y: number, r: number): string => `M${n(x)},${n(y - r)} Q${n(x)},${n(y)} ${n(x + r)},${n(y)} Q${n(x)},${n(y)} ${n(x)},${n(y + r)} Q${n(x)},${n(y)} ${n(x - r)},${n(y)} Q${n(x)},${n(y)} ${n(x)},${n(y - r)}Z`;

function Shape({ kind, w, h, left, label }: { kind: SkyCardKind; w: number; h: number; left: number; label: string }) {
  const defend = kind === "defend", pct = Math.max(0, Math.min(1, left)) * 100, r = w / 2, tip = w * 0.43;
  const base = defend ? `M0,${n(r)} A${n(r)},${n(r)} 0 0 1 ${n(w)},${n(r)} V${n(h)} H0Z` : `M0,${n(tip)} L${n(r)},0 L${n(w)},${n(tip)} V${n(h)} H0Z`;
  // DEFEND counts down along its arch, STRIKE along a line at its foot.
  const rim = defend ? `M8,${n(r)} A${n(r - 8)},${n(r - 8)} 0 0 1 ${n(w - 8)},${n(r)}` : `M24,${n(h - 22)} H${n(w - 24)}`;
  return (
    <svg className="sky-card__shape" viewBox={`0 0 ${n(w)} ${n(h)}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(left * 100)}>
      <path d={base} className="sky-card__plate" />
      <path d={rim} pathLength="100" className="sky-card__trough" />
      <path d={rim} pathLength="100" strokeDasharray={`${String(pct)} 100`} className="sky-card__timer" />
      {kind === "finish" && <path d={base} className="sky-card__pulse" />}
      {kind === "finish" && (
        <g className="sky-card__burst">
          <path d={star(r, 0, 14)} />
          <path d={star(14, tip + 12, 9)} />
          <path d={star(w - 14, tip + 12, 9)} />
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
  return (
    <div ref={ref} className={`sky-hud sky-card sky-card--${kind} sky-card--${level}`}>
      <Shape kind={kind} w={box.w || FALLBACK.w} h={box.h || FALLBACK.h} left={left} label={`${move.kind === "defend" ? "Defend" : "Strike"} time left`} />
      <div className="sky-card__tag">{tag}</div>
      <div className="sky-card__in">
        {full && <MoveGuide key={move.id} move={move} history={history} />}
        <div className="sky-card__word">{move.prompt}</div>
        {level !== "mini" && <div className="sky-card__target">{target}</div>}
        {full && situation && <div className="sky-card__situation">{situation}</div>}
        {/* No HOLD tag: a defend made once while the attack is coming counts. */}
        <div className="sky-card__hint">
          {full && <span className="sky-card__how">{move.hint}</span>}
          {key}
        </div>
      </div>
    </div>
  );
}
