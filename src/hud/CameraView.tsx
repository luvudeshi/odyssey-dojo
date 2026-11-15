// The live camera panel on the fight screen: the player's own picture with the tracked skeleton drawn on it,
// and a caption saying whether the body is tracked and which move was just recognised. Drawn from one
// requestAnimationFrame loop over refs, so React never re-renders per frame (memo keeps the per-frame FightScreen state from reaching it).
import { memo, useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { PoseFrame } from "../core/types";
import { MOVES } from "../moves/registry";
import type { PoseTracker } from "../pose/tracker";
import { battle } from "../render/battle";
import { useSettings } from "../settings/store";
import { NO_FLASH, flashText, nextFlash, presenceOf } from "./cameraCaption";
import type { Flash } from "./cameraCaption";
import "./cameraView.css";
import { skeletonLines } from "./skeletonLines";

const nameOf = (id: string): string => MOVES.get(id)?.name ?? id;

export const CameraView = memo(function CameraView(props: { tracker: PoseTracker | null; poseRef: RefObject<PoseFrame | null>; paused: boolean }) {
  const { tracker, poseRef, paused } = props;
  const { mirror } = useSettings();
  const mirrorRef = useRef(mirror);
  useEffect(() => { mirrorRef.current = mirror; }, [mirror]);
  const pausedRef = useRef(paused);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  const holder = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const state = useRef<HTMLSpanElement>(null);
  const move = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const box = holder.current;
    const surface = canvas.current;
    const context = surface?.getContext("2d");
    if (!tracker || !box || !surface || !context) return;
    box.append(tracker.video);
    // The size changes rarely, so it is read when the box resizes and not every frame.
    let cssWidth = box.clientWidth;
    let cssHeight = box.clientHeight;
    const watcher = new ResizeObserver((entries) => {
      const size = entries[0]?.contentRect;
      if (size) { cssWidth = size.width; cssHeight = size.height; }
    });
    watcher.observe(box);
    let flash: Flash = NO_FLASH;
    let handle = 0;
    let shownState = "";
    let shownMove = "";
    const tick = (): void => {
      // Size the frame to the camera's real shape so the skeleton lines up with the picture whatever the aspect.
      const { videoWidth, videoHeight } = tracker.video;
      const shape = videoWidth > 0 && videoHeight > 0 ? `${String(videoWidth)} / ${String(videoHeight)}` : "";
      if (box.style.aspectRatio !== shape) box.style.aspectRatio = shape;
      const ratio = window.devicePixelRatio || 1;
      const width = Math.round(cssWidth * ratio);
      const height = Math.round(cssHeight * ratio);
      if (surface.width !== width || surface.height !== height) { surface.width = width; surface.height = height; }
      context.clearRect(0, 0, width, height);
      const frame = poseRef.current;
      const presence = presenceOf(frame, performance.now());
      const tracking = presence.ok;
      if (frame && tracking && !pausedRef.current) draw(context, frame, mirrorRef.current, width, height, ratio);
      const now = performance.now() / 1000;
      flash = nextFlash(flash, battle, now, nameOf);
      const text = presence.ok ? "Tracking your body" : presence.reason;
      const recognised = flashText(flash, now);
      if (state.current && text !== shownState) { shownState = text; state.current.textContent = text; state.current.dataset.on = String(tracking); }
      if (move.current && recognised !== shownMove) { shownMove = recognised; move.current.textContent = recognised; }
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(handle); watcher.disconnect(); tracker.video.remove(); };
  }, [tracker, poseRef]);

  if (!tracker) return null;
  return (
    <figure className={mirror ? "camera-view mirror" : "camera-view"} aria-label="Your camera">
      <div className="camera-frame" ref={holder}>
        <canvas ref={canvas} />
      </div>
      <figcaption>
        <span ref={state} className="camera-state" data-on="false">I can't see you</span>
        <span ref={move} className="camera-move" aria-live="polite" />
      </figcaption>
    </figure>
  );
});

function draw(context: CanvasRenderingContext2D, frame: PoseFrame, mirror: boolean, width: number, height: number, ratio: number): void {
  const { lines, dots } = skeletonLines(frame.image, mirror, width, height);
  context.lineCap = "round";
  context.lineWidth = 2.5 * ratio;
  for (const { from, to, faint } of lines) {
    context.globalAlpha = faint ? 0.25 : 0.95;
    context.strokeStyle = "#efe3c6";
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  }
  for (const { x, y, faint } of dots) {
    context.globalAlpha = faint ? 0.25 : 1;
    context.fillStyle = "#d0603a";
    context.beginPath();
    context.arc(x, y, 3.6 * ratio, 0, Math.PI * 2);
    context.fill();
    context.lineWidth = 1.2 * ratio;
    context.strokeStyle = "#2a1a12";
    context.stroke();
  }
  context.globalAlpha = 1;
}
