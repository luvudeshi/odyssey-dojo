// The live camera panel on the fight screen: the player's own picture with the tracked skeleton drawn on it,
// and a caption saying whether the body is tracked and which move was just recognised. Drawn from one
// requestAnimationFrame loop over refs, so React never re-renders per frame (memo keeps the per-frame FightScreen state from reaching it).
import { memo, useContext, useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { PoseFrame } from "../core/types";
import { duoCamera } from "../duo/duoCamera";
import { MOVES } from "../moves/registry";
import type { PoseTracker } from "../pose/tracker";
import { battle } from "../render/battle";
import { useSettings } from "../settings/store";
import { NO_FLASH, flashText, nextFlash, presenceOf } from "./cameraCaption";
import type { Flash } from "./cameraCaption";
import { CameraPanelContext, offersCamera, panelNote, panelState } from "./cameraPanel";
import "./cameraView.css";
import { headStones, skeletonLines, stonesAlong } from "./skeletonLines";

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
  const tag = useRef<HTMLSpanElement>(null);
  // Never null on the fight screen: without a live picture the same frame says why, and offers the camera when it can.
  const panel = useContext(CameraPanelContext);
  const shown = panelState(tracker !== null, panel.status);
  const video = tracker && shown === "live" ? tracker.video : null;

  useEffect(() => {
    const box = holder.current;
    const surface = canvas.current;
    const context = surface?.getContext("2d");
    const label = state.current;
    const flashLabel = move.current;
    const tagLabel = tag.current;
    if (!video || !box || !surface || !context) return;
    box.append(video);
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
    let shownTag = "";
    const tick = (): void => {
      // Size the frame to the camera's real shape so the skeleton lines up with the picture whatever the aspect.
      const { videoWidth, videoHeight } = video;
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
      if (frame && tracking && !pausedRef.current) draw(context, duoCamera.seen(frame), mirrorRef.current, width, height, ratio);
      const now = performance.now() / 1000;
      flash = nextFlash(flash, battle, now, nameOf);
      const text = presence.ok ? "Tracking your body" : presence.reason;
      const recognised = flashText(flash, now);
      // Two players on one camera (src/duo): the tag says whether the second player is in.
      const who = !duoCamera.on() || !tracking ? "Your body" : duoCamera.players(performance.now()) === 2 ? "Both seen" : "One seen";
      if (tag.current && who !== shownTag) { shownTag = who; tag.current.textContent = who; }
      if (state.current && text !== shownState) { shownState = text; state.current.textContent = text; state.current.dataset.on = String(tracking); }
      if (move.current && recognised !== shownMove) { shownMove = recognised; move.current.textContent = recognised; }
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(handle);
      watcher.disconnect();
      video.remove();
      if (label) label.dataset.on = "false";
      if (flashLabel) flashLabel.textContent = "";
      if (tagLabel) tagLabel.textContent = "Your body";
    };
  }, [video, poseRef]);

  return (
    <figure className={`camera-view${mirror ? " mirror" : ""}${shown === "keyboard" ? " camera-view--keys" : ""}`} aria-label="Your camera">
      <div className="camera-frame" ref={holder}>
        <canvas ref={canvas} />
      </div>
      <figcaption>
        <span ref={tag} className="camera-tag">Your body</span>
        <i className="camera-dot" aria-hidden="true" />
        <span ref={state} className="camera-state" data-on="false">{shown === "live" ? "I can't see you" : panelNote(shown)}</span>
        <span ref={move} className="camera-move" aria-live="polite" />
        {offersCamera(shown) && panel.onCamera && (
          <button type="button" className="camera-use" onClick={panel.onCamera}>Use camera</button>
        )}
      </figcaption>
    </figure>
  );
});

const CREAM = ["#f1e6cf", "#e8dabb", "#dccaa4"] as const;
const SLATE = ["#6f8791", "#5f7882", "#84a0aa"] as const;
const TERRA = "#b8553a";
const JOINT_EDGE = "#2a1a12";

/** The tracked body laid as stones in the one canvas pass that drew the lines: stones are batched into one path per colour. */
function draw(context: CanvasRenderingContext2D, frame: PoseFrame, mirror: boolean, width: number, height: number, ratio: number): void {
  const { lines, dots } = skeletonLines(frame.image, mirror, width, height);
  const stone = Math.max(2.2 * ratio, width * 0.017);
  const batches = new Map<string, Path2D>();
  const lay = (color: string, faint: boolean, x: number, y: number, radius: number): void => {
    const key = `${color}|${String(faint)}`;
    let path = batches.get(key);
    if (!path) { path = new Path2D(); batches.set(key, path); }
    path.moveTo(x + radius, y);
    path.arc(x, y, radius, 0, Math.PI * 2);
  };
  context.lineCap = "round";
  context.lineWidth = 1.4 * ratio;
  context.strokeStyle = "#e8dabb";
  lines.forEach(({ from, to, faint }, bone) => {
    context.globalAlpha = faint ? 0.2 : 0.7;
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    stonesAlong(from, to, stone * 2.1).forEach((spot, i) => { lay(SLATE[(bone + i) % SLATE.length] ?? TERRA, faint, spot.x, spot.y, stone); });
  });
  // A full landmark list has the nose first; it becomes the head cluster, sized from the shoulder span.
  const head = dots.length === 13 ? dots[0] : undefined;
  const shoulders = lines[0];
  if (head) {
    const span = shoulders ? Math.hypot(shoulders.to.x - shoulders.from.x, shoulders.to.y - shoulders.from.y) : 0;
    headStones(head, Math.max(span * 0.22, stone * 3), stone * 0.9).forEach((spot, i) => { lay(CREAM[i % CREAM.length] ?? TERRA, head.faint, spot.x, spot.y, stone * 0.9); });
  }
  for (const dot of dots) {
    if (dot === head) continue;
    lay(JOINT_EDGE, dot.faint, dot.x, dot.y, stone * 1.75);
    lay(TERRA, dot.faint, dot.x, dot.y, stone * 1.4);
  }
  // Every stone gets a dark edge, so the skeleton reads on a bright room as well as a dark one.
  context.strokeStyle = JOINT_EDGE;
  context.lineWidth = 1.6 * ratio;
  for (const [key, path] of batches) {
    const [color = TERRA, faint] = key.split("|");
    context.globalAlpha = faint === "true" ? 0.3 : 1;
    context.fillStyle = color;
    context.stroke(path);
    context.fill(path);
  }
  context.globalAlpha = 1;
}
