// The glass behind the prompt card in the three HUD look drafts (src/ui/lookSwitch.ts), drawn at the card's measured size:
// A broken shards, B blade slabs, C stones. Each carries its own timer, so STRIKE and DEFEND differ in silhouette and glyph as well as colour.
// B's timer is the HTML fissure in SkyPromptCard (it needs the baked lava texture). Delete this folder when a look is picked.
import { useMemo } from "react";
import type { Look } from "../../../ui/lookSwitch";
import { END_BLADES } from "../rift/geometry";
import { GLYPHS, guardPlate, shardGlass, slabGlass, stoneGlass } from "./geometry";
import "./lookA.css";
import "./lookB.css";
import "./lookC.css";

const n = (v: number): string => v.toFixed(1);

interface ShapeProps { look: Look; strike: boolean; w: number; h: number; left: number; label: string }

function Timer({ d, left }: { d: string; left: number }) {
  const dash = `${String(Math.max(0, Math.min(1, left)) * 100)} 100`;
  return (
    <>
      <path d={d} pathLength="100" className="lk-trough" />
      <path d={d} pathLength="100" strokeDasharray={dash} className="lk-timer lk-timer--glow" />
      <path d={d} pathLength="100" strokeDasharray={dash} className="lk-timer" />
    </>
  );
}

function ShardsA({ strike, w, h, left }: Omit<ShapeProps, "look" | "label">) {
  const g = useMemo(() => shardGlass(w, h, strike), [w, h, strike]);
  const glyph = strike ? GLYPHS.spear : GLYPHS.shield;
  return (
    <>
      <path d={g.outline} className="lk-aura" />
      <path d={g.outline} className="lk-plate" />
      {g.facets.map((f) => <path key={f.d} d={f.d} fill={f.fill} />)}
      <path d={g.outline} className="lk-rim" />
      <path d={g.edge} className="lk-edge" />
      <g transform={`translate(${n(w / 2 - 66)} ${n(h * 0.5)}) scale(1.32)`}><path d={glyph} className="lk-glyph" /></g>
      <path d={g.branch} className="lk-vein lk-vein--glow" />
      <path d={g.vein} className="lk-vein lk-vein--glow" />
      <path d={g.branch} className="lk-vein" />
      <path d={g.vein} className="lk-vein lk-vein--core" />
      <Timer d={g.timer} left={left} />
    </>
  );
}

function SlabB({ strike, w, h }: Omit<ShapeProps, "look" | "label" | "left">) {
  const g = useMemo(() => slabGlass(w, h), [w, h]), s = 0.5, y = h / 2 - 30 * s;
  return (
    <>
      <path d={g.outline} className="lk-shade" />
      {g.facets.map((f) => <path key={f.d} d={f.d} fill={f.fill} />)}
      <path d={g.outline} className="lk-tint" />
      <path d={g.top} className="lk-edge" />
      <path d={g.bottom} className="lk-under" />
      {strike
        ? [`translate(${n(w - 6)} ${n(y)}) scale(${String(s)})`, `translate(6 ${n(y)}) scale(${String(-s)} ${String(s)})`].map((t) => (
          <g key={t} transform={t}>
            {END_BLADES.map((b) => (
              <g key={b.body}><path d={b.body} className="lk-blade" /><path d={b.light} className="lk-blade-light" /><path d={b.edge} className="lk-blade-edge" /><path d={b.vein} className="lk-blade-vein" /></g>
            ))}
          </g>
        ))
        : [1, -1].map((side) => <g key={side}><path d={guardPlate(w, h, side === 1 ? 1 : -1)} className="lk-guard" /><path d={guardPlate(w, h, side === 1 ? 1 : -1)} className="lk-guard-edge" /></g>)}
    </>
  );
}

function StoneC({ strike, w, h, left }: Omit<ShapeProps, "look" | "label">) {
  const g = useMemo(() => stoneGlass(w, h, strike), [w, h, strike]);
  const glyph = strike ? GLYPHS.tiwaz : GLYPHS.algiz;
  return (
    <>
      <path d={g.outline} className="lk-aura" />
      <path d={g.outline} className="lk-plate" />
      {g.facets.map((f) => <path key={f.d} d={f.d} fill={f.fill} />)}
      <path d={g.cracks} className="lk-crack" />
      <path d={g.outline} className="lk-rim" />
      <g transform={`translate(${n(w / 2 - 70)} ${n(h * 0.5 - 70)}) scale(1.4)`}><path d={glyph} className="lk-rune lk-rune--glow" /><path d={glyph} className="lk-rune" /></g>
      <Timer d={g.ring} left={left} />
    </>
  );
}

export function LookShape({ look, strike, w, h, left, label }: ShapeProps) {
  return (
    <svg className={`sky-card__shape lk-shape lk-shape--${look}`} viewBox={`0 0 ${n(w)} ${n(h)}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(left * 100)}>
      {look === "a" && <ShardsA strike={strike} w={w} h={h} left={left} />}
      {look === "b" && <SlabB strike={strike} w={w} h={h} />}
      {look === "c" && <StoneC strike={strike} w={w} h={h} left={left} />}
    </svg>
  );
}
