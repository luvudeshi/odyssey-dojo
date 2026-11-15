// Look C, "The cave of the Cyclops": the whole screen is the rock wall of Polyphemus's cave by firelight. A deed won is
// painted on the wall in ochre; a deed not won is only a smudge of soot where it will go. The hero's name is cut into the
// flat stone before the fire, and the ram Odysseus hid under is painted over it. Dark and warm.
import { Icon } from "../../account/ui/icons";
import { Button } from "../../ui/pebble";
import "./lookA.css";
import "./lookC.css";
import { Detail, NameField, Stats, aria, groupsOf, hoverEvents, iconOf, useStage, type LookProps } from "./shared";

const CELL = 134;
/** The wall is painted in rows; each row is [group, first deed, count, x, y]. */
const ROWS = [["road", 0, 4, 34, 112], ["road", 4, 4, 34, 244], ["dojo", 0, 3, 34, 394], ["arms", 0, 4, 902, 112], ["arms", 4, 1, 902, 244], ["labours", 0, 4, 902, 394], ["labours", 4, 3, 1036, 524]] as const;
const CAPS = [["road", 34, 76], ["dojo", 34, 358], ["arms", 902, 76], ["labours", 902, 358]] as const;
const wobble = (n: number): number => ((n * 37) % 7) - 3;

export function LookC(props: LookProps) {
  const { profile, feats, activeId } = props;
  const { stage, stageStyle, coreStyle } = useStage();
  const groups = groupsOf(feats);
  const picked = feats.find((feat) => feat.id === activeId);
  const won = feats.filter((feat) => feat.done).length;
  let n = 0;
  return (
    <main className="lk lk-c">
      <div className="lk-stage" style={stageStyle}>
        <svg className="lk-c-rock" width={stage.w} height={stage.h} aria-hidden="true">
          <filter id="lkc-rock" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.012 0.03" numOctaves="4" seed="7" /><feColorMatrix values="0 0 0 0 0.16  0 0 0 0 0.1  0 0 0 0 0.07  0 0 0 1.1 -0.28" /></filter>
          <rect width="100%" height="100%" fill="#0b0705" /><rect width="100%" height="100%" filter="url(#lkc-rock)" />
        </svg>
        <div className="lk-c-glow" aria-hidden="true" />
        <div className="lk-core" style={coreStyle}>
          <svg className="lk-c-top" viewBox="0 0 1440 120" aria-hidden="true">
            <path d="M0 0H1440V30L1400 20L1380 70L1352 24L1300 16L1270 58L1236 22L1120 30L1090 92L1056 28L960 34L930 14L880 20L852 70L826 30L600 30L574 70L548 22L500 18L470 96L440 26L330 22L300 62L276 20L200 30L172 76L146 24L90 20L62 54L30 26L0 34Z" fill="#050302" />
          </svg>
          <svg className="lk-c-ram" viewBox="0 0 400 260" aria-hidden="true">
            <g fill="none" stroke="#c98a3c" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" opacity="0.45">
              <path d="M84 118 q-14 -36 22 -46 q14 -26 52 -14 q30 -18 64 2 q42 -8 52 28 q20 24 -4 54 q-6 24 -34 22 H130 q-38 4 -46 -22 q-14 -12 -2 -24 Z" />
              <path d="M296 96 Q330 78 362 104 Q374 132 350 146 Q318 152 298 130 Z M318 96 C294 58 334 32 356 54 C370 70 354 86 340 76 M338 112 l2 2 M352 140 q8 8 4 16" />
              <path d="M124 164 V230 M164 168 V232 M262 168 V232 M300 160 V230 M84 98 q-24 -6 -20 -26" />
            </g>
          </svg>
          <h1 className="lk-c-title"><span>Account</span>The Cave of the Cyclops</h1>
          {CAPS.map(([key, x, y]) => {
            const group = groups.find((g) => g.key === key);
            return group ? <h2 key={key} className="lk-c-cap" style={{ left: x, top: y }}><span>{group.title}</span><b>{group.feats.filter((feat) => feat.done).length}/{group.feats.length}</b></h2> : null;
          })}
          {ROWS.map(([key, from, count, x, y]) => {
            const list = groups.find((g) => g.key === key)?.feats.slice(from, from + count) ?? [];
            return list.map((feat, i) => {
              n += 1;
              return (
                <button key={feat.id} type="button" className={`lk-c-mark ${feat.done ? "is-done" : "is-locked"} ${activeId === feat.id ? "is-active" : ""}`}
                  style={{ left: x + i * CELL, top: y + wobble(n) * 2, transform: `rotate(${String(wobble(n + 3) * 0.7)}deg)` }} aria-label={aria(feat)} {...hoverEvents(props.setActiveId, feat.id)}>
                  <span className="lk-c-mark__ring"><Icon name={iconOf(feat)} className="lk-c-mark__icon" /></span>
                  <span className="lk-c-mark__name">{feat.name}{feat.progress && !feat.done && <small> {feat.progress.have}/{feat.progress.goal}</small>}</span>
                </button>
              );
            });
          })}
          <p className="lk-c-count" style={{ left: 1040, top: 244 }}><b>{won}</b> of {feats.length}<br />deeds painted</p>
          <div className="lk-c-detail"><Detail feat={picked ?? feats.find((feat) => !feat.done)} picked={picked !== undefined} doneText="The wall is full" /></div>
          <div className="lk-c-slab">
            <NameField name={profile.name} max={46} room={380} />
            <Stats profile={profile} />
          </div>
          <svg className="lk-c-fire" viewBox="0 0 400 130" aria-hidden="true">
            <ellipse cx="200" cy="112" rx="170" ry="16" fill="#00000099" />
            <path d="M60 104 L330 88 M70 90 L340 106" stroke="#3a2210" strokeWidth="16" strokeLinecap="round" />
            <g className="lk-c-flames">
              <path d="M110 100 C90 60 140 50 130 6 C170 30 176 62 168 100 Z" fill="#c83a10" />
              <path d="M170 102 C140 56 210 40 196 -6 C250 24 262 62 244 102 Z" fill="#f06a14" />
              <path d="M236 100 C220 66 262 56 256 18 C292 42 300 72 288 100 Z" fill="#d84a10" />
              <path d="M150 100 C150 70 196 60 190 30 C226 52 232 78 224 100 Z" fill="#ffb82e" />
              <path d="M178 100 C176 82 204 76 204 58 C224 72 224 88 218 100 Z" fill="#fff0a0" />
            </g>
          </svg>
          <div className="lk-c-actions lk-actions">
            <Button onClick={props.onSettings}><Icon name="sliders" className="lk-btn__icon" />Open settings</Button>
            <Button primary onClick={props.onBack}><Icon name="house" className="lk-btn__icon" />Main menu</Button>
          </div>
        </div>
      </div>
    </main>
  );
}
