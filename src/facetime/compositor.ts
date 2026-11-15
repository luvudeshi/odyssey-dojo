// Makes the video track that goes back to the phone: a 2D canvas the frame is painted on every animation frame,
// captured as a stream. The fight is found on the page (the one <canvas> inside .fight, drawn by the 3D scene).
//
// The scene's WebGL canvas is not copied directly: without preserveDrawingBuffer (set in src/render, not here) a
// copy made at the wrong moment of the frame is blank. Its own captured stream, played in a parked <video>, always
// holds the last picture shown, at the cost of one frame of delay.
import { drawFrame } from "./frameDraw";
import type { PictureSource } from "./frameDraw";
import type { FrameHud } from "./frameHud";
import { frameLayout } from "./frameLayout";
import type { FrameShape } from "./frameLayout";

/** Pictures a second sent to the phone. A fight reads well at this, and it keeps the upload small. */
export const OUT_FPS = 20;

export interface Compositor {
  readonly track: MediaStreamTrack;
  /** The outgoing picture, to show the host what the friend sees. */
  readonly canvas: HTMLCanvasElement;
  draw(hud: FrameHud): void;
  stop(): void;
}

const findFight = (): HTMLCanvasElement | null => document.querySelector<HTMLCanvasElement>(".fight canvas");

export function startCompositor(shape: FrameShape = "portrait", findScene: () => HTMLCanvasElement | null = findFight): Compositor {
  const layout = frameLayout(shape);
  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2D canvas for the call's picture");
  const stream = canvas.captureStream(OUT_FPS);
  const track = stream.getVideoTracks()[0];
  if (!track) throw new Error("no video track for the call's picture");

  const park = document.createElement("div");
  park.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;overflow:hidden;opacity:0;pointer-events:none";
  document.body.append(park);
  let scene: HTMLCanvasElement | null = null;
  let sceneVideo: HTMLVideoElement | null = null;
  let sceneStream: MediaStream | null = null;

  const drop = (): void => {
    sceneStream?.getTracks().forEach((each) => { each.stop(); });
    sceneVideo?.remove();
    scene = null;
    sceneVideo = null;
    sceneStream = null;
  };
  const follow = (found: HTMLCanvasElement | null): void => {
    if (found === scene) return;
    drop();
    if (!found) return;
    scene = found;
    sceneStream = found.captureStream(30);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = sceneStream;
    park.append(video);
    void video.play().catch(() => undefined);
    sceneVideo = video;
  };

  return {
    track,
    canvas,
    draw(hud) {
      follow(findScene());
      const picture: PictureSource | null = sceneVideo && sceneVideo.videoWidth > 0
        ? { image: sceneVideo, width: sceneVideo.videoWidth, height: sceneVideo.videoHeight }
        : null;
      drawFrame(ctx, layout, hud, picture);
    },
    stop() {
      drop();
      park.remove();
      track.stop();
    },
  };
}
