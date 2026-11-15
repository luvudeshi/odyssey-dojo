// Two players on one camera: what the screen adds so that both people can see both are followed and both are counted.
//   1. Player two's skeleton over the camera's picture, in the second hero's blue, wherever that picture is shown
//      (the calibration screen and the fight). Player one's is the camera panel's own, in gold, in the same fine lines.
//   2. In the fight, each player's hits and points (src/duo/tally.ts) on two small plates right above the camera
//      panel, player two's in the same blue. Before player two has scored, their plate says what the camera makes
//      of them, so two people who get one hero know to step apart. It is there and not by the "You + Friend" tag
//      because the prompt card covers that corner for most of the fight. When the fight is over the same numbers go
//      on the end panel, after its "Score".
// The camera panel and the HUD belong to src/hud, which this does not change. It lays a canvas of its own into the
// panel's frame and the plates beside the panel, finds its places by their class names, and takes everything away
// again when the two-player choice is turned off. It runs only from startDuo() until then: a fight alone, in a room
// or on a FaceTime call never has it.
import type { Landmark } from "../../core/types";
import { FINE_INK, drawFine } from "../../hud/fineSkeleton";
import { battle } from "../../render/battle";
import { duoCamera } from "../duoCamera";
import type { DuoCamera } from "../duoCamera";
import { duoTally, firstPart, secondPart, tallyLine } from "../tally";
import type { SecondState, TallyStore } from "../tally";

/** Player two's plate is set in the same blue, so each reads their own numbers. */
const SECOND_INK = "#9fd0ff";
/** Between the camera panel's top edge and the plates above it, in pixels. */
const ABOVE_PANEL = 8;

/** Player two's body on the panel: the same fine lines the camera panel draws for player one (src/hud/fineSkeleton.ts), in blue. */
export function drawSecond(context: CanvasRenderingContext2D, image: readonly Landmark[], mirror: boolean, width: number, height: number, ratio: number): void {
  drawFine(context, image, mirror, width, height, ratio, FINE_INK[1]);
}

let running = false;

/** Starts drawing. Safe to call again while it runs; it stops by itself once the camera's two-player choice is off. */
export function startDuoOverlay(camera: DuoCamera = duoCamera, store: TallyStore = duoTally): void {
  if (running || typeof document === "undefined") return;
  running = true;
  const surface = document.createElement("canvas");
  surface.className = "duo-skeleton";
  surface.style.pointerEvents = "none";
  const context = surface.getContext("2d");
  // The plates wear the camera panel's own tag (.camera-tag, "Both seen"), so they read as part of it.
  const plates = document.createElement("div");
  plates.className = "duo-tally";
  Object.assign(plates.style, { position: "absolute", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "4px", fontWeight: "700", textTransform: "uppercase", pointerEvents: "none" });
  const first = document.createElement("span");
  const second = document.createElement("span");
  first.className = "camera-tag";
  second.className = "camera-tag";
  Object.assign(second.style, { color: SECOND_INK, borderColor: FINE_INK[1] });
  plates.append(first, second);
  /** The same numbers for the end panel: they follow its "Score" on the same line, so the panel grows no taller. */
  const closing = document.createElement("span");
  closing.className = "duo-tally-end";
  let size = { width: 0, height: 0 };
  /** Set whenever the panel may have moved or changed size: the plates are then put above it again. */
  let moved = true;
  const watcher = new ResizeObserver((entries) => {
    const box = entries[0]?.contentRect;
    if (box) size = { width: box.width, height: box.height };
    moved = true;
  });
  let shown = "";

  const tick = (): void => {
    if (!camera.on()) {
      watcher.disconnect();
      surface.remove();
      plates.remove();
      closing.remove();
      running = false;
      return;
    }
    const now = performance.now();
    const frame = document.querySelector<HTMLElement>(".camera-frame");
    if (frame && surface.parentElement !== frame) {
      watcher.disconnect();
      frame.append(surface);
      size = { width: frame.clientWidth, height: frame.clientHeight };
      watcher.observe(frame);
      moved = true;
    }
    if (frame && context) {
      const ratio = window.devicePixelRatio || 1;
      const width = Math.round(size.width * ratio);
      const height = Math.round(size.height * ratio);
      if (surface.width !== width || surface.height !== height) { surface.width = width; surface.height = height; }
      context.clearRect(0, 0, width, height);
      const body = camera.secondSeen(now);
      if (body && width > 0) drawSecond(context, body.image, frame.closest(".camera-view")?.classList.contains("mirror") ?? true, width, height, ratio);
    }
    // On the end panel the numbers move onto the panel's own score line.
    const kind = battle.state?.phase.kind;
    const score = kind === "won" || kind === "lost" ? document.querySelector(".fight > .overlay > h1 + p:not([class])") : null;
    const panel = score ? null : document.querySelector<HTMLElement>(".fight > .camera-view");
    const fight = panel?.parentElement;
    if (panel && fight) {
      if (plates.parentElement !== fight) { fight.append(plates); moved = true; }
      if (moved) {
        moved = false;
        const box = panel.getBoundingClientRect();
        const around = fight.getBoundingClientRect();
        Object.assign(plates.style, { left: `${String(box.left - around.left)}px`, bottom: `${String(around.bottom - box.top + ABOVE_PANEL)}px`, zIndex: getComputedStyle(panel).zIndex });
      }
    } else plates.remove();
    if (score && closing.parentElement !== score) score.append(closing);
    if (!score) closing.remove();
    const tally = store.get();
    const state: SecondState = score || camera.players(now) === 2 ? "in" : camera.second(now) ? "joining" : "out";
    const text = tallyLine(tally, state);
    if (text !== shown) {
      shown = text;
      first.textContent = firstPart(tally);
      second.textContent = secondPart(tally, state);
      closing.textContent = ` · ${text}`;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
