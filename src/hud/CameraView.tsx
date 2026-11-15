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
import { NO_FLASH, flashText, isTracking, nextFlash } from "./cameraCaption";
import type { Flash } from "./cameraCaption";
import "./cameraView.css";
import { skeletonLines } from "./skeletonLines";

const nameOf = (id: string): string => MOVES.get(id)?.name ?? id;

export const CameraView = memo(function CameraView(props: { tracker: PoseTracker | null; poseRef: RefObject<PoseFrame | null> }) {
  const { tracker, poseRef } = props;
  const { mirror } = useSettings();
  const mirrorRef = useRef(mirror);
  useEffect(() => { mirrorRef.current = mirror; }, [mirror]);
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
    let flash: Flash = NO_FLASH;
    let handle = 0;
    let shownState = "";
    let shownMove = "";
    const tick = (): void => {
      // Size the frame to the camera's real shape so the skeleton lines up with the picture whatever the aspect.
      const { videoWidth, videoHeight } = tracker.video;
      const shape = videoWidth > 0 && videoHeight > 0 ? `${videoWidth} / ${videoHeight}` : "";
      if (box.style.aspectRatio !== shape) box.style.aspectRatio = shape;
      const rect = box.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const width = Math.round(rect.width * ratio);
      const height = Math.round(rect.height * ratio);
      if (surface.width !== width || surface.height !== height) { surface.width = width; surface.height = height; }
      context.clearRect(0, 0, width, height);
      const frame = poseRef.current;
      const tracking = isTracking(frame, performance.now());
      if (frame && tracking) draw(context, frame, mirrorRef.current, width, height, ratio);
      const now = performance.now() / 1000;
      flash = nextFlash(flash, battle, now, nameOf);
      const text = tracking ? "Tracking your body" : "No body in view";
      const recognised = flashText(flash, now);
      if (state.current && text !== shownState) { shownState = text; state.current.textContent = text; state.current.dataset.on = String(tracking); }
      if (move.current && recognised !== shownMove) { shownMove = recognised; move.current.textContent = recognised; }
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(handle); tracker.video.remove(); };
  }, [tracker, poseRef]);

  if (!tracker) return null;
  return (
    <figure className={mirror ? "camera-view mirror" : "camera-view"} aria-label="Your camera">
      <div className="camera-frame" ref={holder}>
        <canvas ref={canvas} />
      </div>
      <figcaption>
        <span ref={state} className="camera-state" data-on="false">No body in view</span>
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
    context.strokeStyle = "#e9a15f";
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  }
  for (const { x, y, faint } of dots) {
    context.globalAlpha = faint ? 0.25 : 1;
    context.fillStyle = "#f1e6cf";
    context.beginPath();
    context.arc(x, y, 3.2 * ratio, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
}
