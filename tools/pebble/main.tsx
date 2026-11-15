// Dev-only page: every piece of the pebble kit at real size, on a dark and on a bright ground.
// /tools/pebble/index.html. window.pebbleBench() prints the cost numbers (docs/ui-pebble.md).
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { Button, CardFrame, Emblem, Logo, Panel, PebbleBar, PebbleDots, PebbleHeading, PebbleRing, Select, Slider, Toggle, WaveBorder } from "../../src/ui/pebble";
import { drawLayout, drawWrapped, newCanvas } from "../../src/ui/pebble/draw";
import { logoLayout } from "../../src/ui/pebble/brand";
import { MeterView } from "../../src/ui/pebble/MeterView";
import { barMeter } from "../../src/ui/pebble/meter";
import { timeHeading } from "../../src/ui/pebble/PebbleHeading";
import { PAL } from "../../src/ui/pebble/palette";
import { pick, tileStones } from "../../src/ui/pebble/stones";
import { cardLayout } from "../../src/ui/pebble/Cards";
import "./page.css";

function Hud({ hp, setHp }: { hp: number; setHp: (n: number) => void }) {
  return (
    <div className="hud">
      <div className="hud__bars">
        <div><span className="chip">YOU</span><PebbleBar value={hp} width={440} tone="player" label="Your health" /></div>
        <div><span className="chip chip--r">POLYPHEMUS</span><PebbleBar value={0.62} width={440} dir={-1} tone="enemy" label="Enemy health" /></div>
      </div>
      <div className="hud__row">
        <PebbleDots value={0.55} n={16} d={14} label="Power" />
        <PebbleDots value={1} n={16} d={14} glow label="Power full" />
        <PebbleRing value={0.7} label="Round timer" />
        <Button onClick={() => { setHp(Math.max(0, hp - 0.18)); }}>Hit me</Button>
        <Button onClick={() => { setHp(1); }}>Heal</Button>
      </div>
      <div className="hud__cards">
        <CardFrame kind="defend" timer={0.7}>
          <div className="pb-move">Dodge left</div>
          <div className="pb-target">Club swing incoming</div>
          <p className="pb-hint"><span className="pb-tag">Hold</span> Lean or step to your left</p>
          <p><span className="pb-key">ArrowLeft</span></p>
          <p className="pb-teach">Step off the line of a rush: a moving target is hard to reach.</p>
        </CardFrame>
        <CardFrame kind="strike" timer={0.4}>
          <div className="pb-move">Spear thrust</div>
          <div className="pb-target">Hit his gut</div>
          <p className="pb-hint">Both hands straight forward</p>
          <p><span className="pb-key">U</span></p>
          <p className="pb-teach">Two open hands out front keep him at arm&apos;s length.</p>
        </CardFrame>
      </div>
    </div>
  );
}

function Pieces() {
  const [hp, setHp] = useState(0.85), [on, setOn] = useState(true), [vol, setVol] = useState(0.7), [q, setQ] = useState<"high" | "low">("high");
  return (
    <>
      <div className="logo-row"><Logo height={170} /><div><Emblem size={64} /> <Emblem size={32} /></div></div>
      <PebbleHeading text="CHOOSE YOUR STYLE" px={44} tone="ochre" />
      <PebbleHeading text="POLYPHEMUS FALLS" px={44} tone="cream" />
      <WaveBorder />
      <div className="btns">
        <Button>Rest</Button>
        <Button className="is-hover">Hover</Button>
        <Button className="is-focus">Focus</Button>
        <Button primary>Fight with your body</Button>
        <Button disabled>Disabled</Button>
      </div>
      <Panel ornament className="settings">
        <Toggle label="Mirror webcam picture" checked={on} onChange={setOn} />
        <Slider label="Effects volume" value={vol} onChange={setVol} />
        <Select label="Graphics quality" value={q} options={[{ value: "high", label: "High" }, { value: "low", label: "Low" }]} onChange={setQ} />
      </Panel>
      <Hud hp={hp} setHp={setHp} />
    </>
  );
}

function App() {
  return (
    <div className="grid">
      <div className="ground ground--dark"><h1>Dark ground</h1><Pieces /></div>
      <div className="ground ground--bright"><h1>Bright ground</h1><Pieces /></div>
    </div>
  );
}

declare global { interface Window { pebbleBench: () => Record<string, number> } }

/** Milliseconds for the things that matter. Each uncached draw is timed alone; the bar is timed over 300 value changes. */
window.pebbleBench = () => {
  const out: Record<string, number> = {};
  const time = (name: string, f: () => void): void => { const t = performance.now(); f(); out[name] = Math.round((performance.now() - t) * 100) / 100; };
  const dpr = window.devicePixelRatio || 1;
  time("logoFullUncached", () => { const c = newCanvas(980, 344, dpr); if (c) drawLayout(c.ctx, logoLayout(1)); });
  time("groundTile192Uncached", () => { const c = newCanvas(192, 192, 1); if (c) drawWrapped(c.ctx, tileStones(192, 192, { seed: 5, size: 7, col: PAL.ground }), 192, 192); });
  time("titlePanelAllUncached", () => {
    const c = newCanvas(1100, 620, dpr);
    if (c) { drawLayout(c.ctx, logoLayout(0.9)); drawLayout(c.ctx, cardLayout("defend", 248, 392)); drawLayout(c.ctx, cardLayout("strike", 248, 392)); }
    timeHeading("Fight with your body", 30);
  });
  out.headingUncached = Math.round(timeHeading("Choose your style", 34) * 100) / 100;
  const m = barMeter({ width: 440, d: 9.5, rows: 2, seed: 11, lit: (_k, r) => pick(PAL.ochre, r) }), c = newCanvas(m.w, m.h, dpr);
  if (c) {
    const view = new MeterView(c.ctx, m);
    view.set(1);
    let painted = 0;
    const t = performance.now();
    for (let i = 0; i < 300; i++) painted += view.set(1 - ((i % 100) / 100) * 0.9);
    out.barPerValueChangeMs = Math.round(((performance.now() - t) / 300) * 1000) / 1000;
    out.barStonesRepaintedPerChange = Math.round(painted / 300);
    out.barStonesTotal = m.stones.length;
    view.set(0);
    const t2 = performance.now();
    view.set(1);
    out.barFullRefillMs = Math.round((performance.now() - t2) * 100) / 100;
  }
  return out;
};

const root = document.getElementById("root");
if (root) {
  const t0 = performance.now();
  createRoot(root).render(<StrictMode><App /></StrictMode>);
  requestAnimationFrame(() => { requestAnimationFrame(() => { document.title = `Pebble kit (first paint ${String(Math.round(performance.now() - t0))} ms)`; }); });
}
