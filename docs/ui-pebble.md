# Pebble mosaic UI kit

The interface is laid in small river pebbles on a dark ground, outlined in lead strips, with a wave scroll along borders. The kit lives in `src/ui/pebble/`; the palette in `src/theme.css`. See every piece at real size, on a dark and a bright ground: `npm run dev`, then `/tools/pebble/index.html` (`window.pebbleBench()` in its console prints the costs below).

```ts
import { Panel, Button, PebbleBar, CardFrame /* ... */ } from "../ui/pebble"; // also loads theme.css and pebble.css
```

## Pieces

| Piece | Props | Notes |
|---|---|---|
| `Panel` | `tone` ground/dusk/blood/olive, `ornament` (wave on top), `as`, `className` | Lead frame, pebble ground from a repeating tile (`--pebble-*`, installed on mount). Zero per-panel stone cost |
| `WaveBorder` | `size`, `className` | Wave scroll as wide as its parent, 26 px tall |
| `PebbleHeading` | `text`, `px`, `tone` cream/ochre/terra, `spacing`, `as` | Titles and headings only. Text mask filled with stones, cached per string/size/tone. `aria-label` set; plain text fallback without a canvas |
| `PebbleBar` | `value 0..1`, `width`, `tone` player/enemy/power/slate/ochre, `d`, `rows`, `dir` (-1 fills from right), `glow`, `knock`, `label` | Fills stone by stone; repaints only flipped stones; hits knock pebbles loose below the bar (off under reduced motion) |
| `PebbleDots` | `value`, `n`, `d`, `tone`, `glow`, `trough`, `label` | Power meter, timers |
| `PebbleRing` | `value`, `radius`, `n`, `d`, `tone`, `label` | Round timer, lights clockwise from the top |
| `CardFrame` | `kind` defend/strike, `timer 0..1` (optional), `children` | The ONE prompt card. Shield (round shoulders, pearls) vs spearhead (point, teeth). Width `--pb-card-w` (248 px) |
| `Button` | `primary`, `disabled`, button props | Rest, hover (CSS fade), focus-visible (cream outline plus flank stones), pressed, disabled. Label is real text |
| `Toggle`, `Slider`, `Select` | same props as `src/ui/controls.tsx` | Drop-in swap; native inputs underneath |
| `Logo`, `Emblem` | `height` / `size` | Drawn at run time, cached. Emblem below 140 px uses the plain ring |
| `PebbleCanvas` | `width`, `height`, `cacheKey`, `draw(ctx)` | Escape hatch for a screen's own static piece |

CSS classes for card contents (plain type): `.pb-move` (move word), `.pb-target`, `.pb-hint`, `.pb-teach`, `.pb-tag` (HOLD), `.pb-key`. Pure helpers (`stones.ts`, `meter.ts`, `mask.ts`, `wave.ts`, `brand.ts`) are deterministic from a seed and tested.

## Readability rules

- The move word, HOLD, the key hint, health, the timer: plain system type, 14 px or more, light with a dark outline (`text-shadow`). Never pebble-set. `PebbleHeading` is for titles and headings.
- Pieces that sit over the 3D fight have a solid underlay (bars have a dark trough, cards and buttons a solid base), so they read over the dark cave and the bright courtyard and sea.
- The card stays at the right edge and never covers the hero or the monster.
- System fonts only: `--font-display` (Copperplate first), `--pb-font-body` (Optima first), headings are set in Rockwell then serif fallbacks.

## Performance rules and what is cached

- A static piece is drawn once into a bitmap cached by key, size and pixel ratio (`cachedBitmap`, 96 entries, least recently used out). Remounting a button or card of the same size draws nothing.
- Panel ground is a 192 px seamless tile (`installGround`, data URL, drawn once per tone, about 1.4 ms).
- Meters never redraw in full per frame: a value change repaints only the stones that flip, clipped to their own box (`MeterView.set`). Above 24 flips it does one full repaint.
- Nothing draws thousands of stones per frame. Loose pebbles are at most 5, animated for one second, then the loop stops.
- `prefers-reduced-motion`: no loose pebbles, no transitions.
- Do not render a `PebbleHeading` with a string that changes every frame; do not pass a fresh `cacheKey` per render.

## Measured (headless Chrome, loaded machine, 1x)

| Thing | Cost |
|---|---|
| Logo (about 5k stones), first draw | 12 to 16 ms, then free |
| Both prompt cards + logo + one heading, first draw | about 57 ms once |
| Heading, first draw | 2 to 4 ms |
| Ground tile, first draw | 1.4 ms |
| Whole dev page (two copies of every piece), first paint | about 310 ms |
| `PebbleBar` value change (87 stones, about 4 repainted) | 0.02 ms |
| Bar emptied then refilled in one go | 0.2 ms |

## Theme

`src/theme.css` re-points every old variable and lists old to new at its top. New names: `--pb-ground`, `--pb-ground-deep`, `--pb-ground-2`, `--pb-dusk`, `--pb-blood`, `--pb-lead`, `--pb-foam`, `--pb-cream`, `--pb-ochre`, `--pb-ochre-light`, `--pb-terra`, `--pb-terra-dark`, `--pb-slate`, `--pb-slate-light`, `--pb-olive`, `--pb-sea`, `--pb-dim`, `--pb-outline`, `--pb-text`, `--pb-text-dim`, `--pb-text-on-ochre`, `--pb-focus`, `--pb-font-body`, `--pb-radius`, `--pb-radius-panel`, `--pebble-ground/-dusk/-blood/-olive`. `src/ui/theme.css` (`--ui-*`) now reads these.

The favicon is generated: `npx tsx scripts/gen-pebble-favicon.ts` (34 KB).
