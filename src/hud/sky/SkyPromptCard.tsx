// The ONE prompt card in the star-chart look, at the right edge: an arch-topped stele for DEFEND, a spear-tip tablet for STRIKE,
// the same tablet with a star burst and a pulsing rim for FINISH. Same props and same logic as the pebble PromptCard in Hud.tsx.
import { promptLevel } from "../../combat/engine";
import type { MoveDef } from "../../core/types";
import { useSettings } from "../../settings/store";
import { keyLabel } from "../Hud";
import { SkyFigure } from "./SkyFigure";
import "./tokens.css";
import "./card.css";

type Level = ReturnType<typeof promptLevel>;
export type SkyCardKind = "defend" | "strike" | "finish";

const HEIGHT: Record<Level, number> = { full: 452, word: 330, mini: 250 };
const ARROWS: Record<string, string> = { ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓" };

const SHAPE = {
  defend: (h: number): string => `M0,136 A136,136 0 0 1 272,136 V${String(h)} H0Z`,
  strike: (h: number): string => `M0,116 L136,0 L272,116 V${String(h)} H0Z`,
};
const INNER = {
  defend: (h: number): string => `M14,140 V${String(h - 14)} H258 V140`,
  strike: (h: number): string => `M10,119 L136,12 L262,119 V${String(h - 10)} H10Z`,
};

/** A four-pointed star, for the finish burst and the tag glyph. */
const star = (x: number, y: number, r: number): string => `M${String(x)},${String(y - r)} Q${String(x)},${String(y)} ${String(x + r)},${String(y)} Q${String(x)},${String(y)} ${String(x)},${String(y + r)} Q${String(x)},${String(y)} ${String(x - r)},${String(y)} Q${String(x)},${String(y)} ${String(x)},${String(y - r)}Z`;

function TagGlyph({ kind }: { kind: SkyCardKind }) {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" className="sky-card__glyph">
      {kind === "defend" && <path d="M6,1 L11,3 V6 Q11,10 6,11.5 Q1,10 1,6 V3Z" />}
      {kind === "strike" && <path d="M6,0.5 L9,5 H7 V11.5 H5 V5 H3Z" />}
      {kind === "finish" && <path d={star(6, 6, 5.5)} />}
    </svg>
  );
}

function Shape({ kind, level, left, label }: { kind: SkyCardKind; level: Level; left: number; label: string }) {
  const h = HEIGHT[level], defend = kind === "defend", pct = Math.max(0, Math.min(1, left)) * 100;
  const base = defend ? SHAPE.defend(h) : SHAPE.strike(h);
  const rim = defend ? "M8,136 A128,128 0 0 1 264,136" : `M30,${String(h - 32)} H212`;
  const dash = `${String(pct)} 100`;
  return (
    <svg className="sky-card__shape" viewBox={`0 0 272 ${String(h)}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(left * 100)}>
      <path d={base} className="sky-card__plate" />
      <path d={defend ? INNER.defend(h) : INNER.strike(h)} className="sky-card__dots" />
      {kind === "finish" && <path d={INNER.strike(h)} className="sky-card__pulse" />}
      <path d={rim} pathLength="100" className="sky-card__trough" />
      <path d={rim} pathLength="100" strokeDasharray={dash} className="sky-card__timer" />
      {defend && <path d="M8,136 A128,128 0 0 1 264,136" pathLength="100" strokeDasharray={`0 ${String(pct)} 1 100`} className="sky-card__spark" />}
      {!defend && <path d={`M212,${String(h - 32)} q12,-10 30,0 q-12,10 -30,0Z`} className="sky-card__tip" />}
      {kind === "finish" && (
        <g className="sky-card__burst">
          <path d={star(136, 14, 12)} />
          <path d={star(22, 130, 8)} />
          <path d={star(250, 130, 8)} />
        </g>
      )}
    </svg>
  );
}

/** Same props as the pebble PromptCard; `finisher` turns a strike card into the FINISH card. */
export function SkyPromptCard(props: { move: MoveDef; target: string; successes: number; left: number; situation?: string | null; finisher?: boolean }) {
  const { move, target, successes, left, situation, finisher } = props;
  const level = promptLevel(successes);
  const { keyHints } = useSettings();
  const kind: SkyCardKind = move.kind === "defend" ? "defend" : finisher === true ? "finish" : "strike";
  const arrow = ARROWS[move.key];
  const key = keyHints ? (
    <span className="sky-key" data-arrow={arrow}>
      <kbd>{keyLabel(move.key)}</kbd>
    </span>
  ) : null;
  const tag = kind === "defend" ? "DEFEND" : kind === "finish" ? "FINISH" : "STRIKE";
  return (
    <div className={`sky-hud sky-card sky-card--${kind} sky-card--${level}`} style={{ height: HEIGHT[level] }}>
      <Shape kind={kind} level={level} left={left} label={`${move.kind === "defend" ? "Defend" : "Strike"} time left`} />
      <div className="sky-card__tag"><TagGlyph kind={kind} />{tag}</div>
      <div className="sky-card__in">
        {level === "full" && <SkyFigure diagram={move.diagram} />}
        <div className="sky-card__word">{move.prompt}</div>
        {level !== "mini" && <div className="sky-card__target">{target}</div>}
        {situation && <div className="sky-card__situation">{situation}</div>}
        {/* A defend only counts if it is still held when the attack lands. */}
        <div className="sky-card__hint">
          {move.kind === "defend" && <strong className="sky-card__hold">HOLD</strong>}
          {level === "full" && ` ${move.hint} `}
          {key}
        </div>
        {level === "full" && move.teaches && <div className="sky-card__teach">{move.teaches}</div>}
      </div>
    </div>
  );
}
