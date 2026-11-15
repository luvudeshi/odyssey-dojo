// Three tiny alpha textures drawn once on a canvas, so the defend effects have soft edges instead of flat shapes:
// a round dot, a ring that fades on both sides, and a curved swoosh that brightens toward its head (right end).
import { CanvasTexture, SRGBColorSpace } from "three";

export interface SoftTextures { readonly disc: CanvasTexture; readonly ring: CanvasTexture; readonly swoosh: CanvasTexture }

function paint(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d canvas for the defend effects");
  draw(ctx);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export function makeSoftTextures(): SoftTextures {
  const disc = paint(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.5)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
  const ring = paint(128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,0.12)");
    g.addColorStop(0.55, "rgba(255,255,255,0)");
    g.addColorStop(0.82, "rgba(255,255,255,1)");
    g.addColorStop(0.94, "rgba(255,255,255,0.3)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
  const swoosh = paint(256, 96, (ctx) => {
    const g = ctx.createLinearGradient(24, 0, 232, 0);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.6, "rgba(255,255,255,0.6)");
    g.addColorStop(1, "rgba(255,255,255,1)");
    ctx.strokeStyle = g;
    ctx.lineWidth = 9;
    ctx.lineCap = "round";
    ctx.shadowColor = "rgba(255,255,255,1)";
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.moveTo(24, 78);
    ctx.quadraticCurveTo(128, 6, 232, 66);
    ctx.stroke();
  });
  return { disc, ring, swoosh };
}
