// A slab of the Obsidian Rift's black glass for a banner or chip to sit on: the boss bar's slab (geometry.ts) stretched to
// the piece's box, with an edge in the piece's colour (violet glass, ice for a defend, lava for a strike) and, for lava, a
// seam of the baked melt (lava.ts) along its foot. Optional glass blades at both ends, as on the boss bar. It is still,
// with no filter, so the piece around it can pop and fade on transform and opacity alone. The parent needs
// `isolation: isolate` (the plate sits at z-index -1, behind the words).
import { END_BLADES, SLAB } from "./geometry";
import "./plate.css";

export type RiftTone = "glass" | "ice" | "lava";

function Ends({ side }: { side: "left" | "right" }) {
  return (
    <svg className={`rift-plate__ends rift-plate__ends--${side}`} viewBox="0 0 130 60">
      {END_BLADES.map((b) => (
        <g key={b.body}>
          <path d={b.body} className="rift-plate__blade" />
          <path d={b.light} className="rift-plate__blade-light" />
          <path d={b.edge} className="rift-plate__blade-edge" />
          <path d={b.vein} className="rift-plate__vein" />
        </g>
      ))}
    </svg>
  );
}

export function RiftPlate({ tone, blades = false }: { tone: RiftTone; blades?: boolean }) {
  return (
    <span className={`rift-plate rift-plate--${tone}`} aria-hidden="true">
      <svg className="rift-plate__glass" viewBox="0 0 1000 56" preserveAspectRatio="none">
        <path d={SLAB.outline} className="rift-plate__shade" />
        {SLAB.facets.map((f) => <path key={f.d} d={f.d} fill={f.fill} />)}
        <path d={SLAB.outline} className="rift-plate__tint" />
        {tone !== "glass" && <path d={SLAB.cracksDown} className="rift-plate__crack" vectorEffect="non-scaling-stroke" />}
        <path d={SLAB.top} className="rift-plate__edge" vectorEffect="non-scaling-stroke" />
        <path d={SLAB.bottom} className="rift-plate__under" vectorEffect="non-scaling-stroke" />
      </svg>
      {tone === "lava" && <span className="rift-plate__seam" />}
      {blades && <><Ends side="left" /><Ends side="right" /></>}
    </span>
  );
}
