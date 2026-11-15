// A flat figure of the hero seen from behind, drawn once on a canvas: the after-images are this, tinted and faded.
import { CanvasTexture, SRGBColorSpace } from "three";

export function makeSilhouette(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d canvas for the dodge after-images");
  ctx.shadowColor = "rgba(255,255,255,1)";
  ctx.shadowBlur = 8;
  ctx.fillStyle = "#fff";
  // Crest and helmet.
  ctx.beginPath(); ctx.ellipse(64, 34, 15, 17, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(56, 22); ctx.quadraticCurveTo(64, -2, 80, 10); ctx.lineTo(70, 24); ctx.closePath(); ctx.fill();
  // Shoulders and torso, then the cloak hanging off his back.
  ctx.beginPath(); ctx.roundRect(36, 54, 56, 22, 10); ctx.fill();
  ctx.beginPath(); ctx.moveTo(42, 70); ctx.lineTo(86, 70); ctx.lineTo(80, 138); ctx.lineTo(48, 138); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(40, 66); ctx.lineTo(30, 170); ctx.lineTo(58, 150); ctx.closePath(); ctx.fill();
  // Arms, bent as in his guard.
  ctx.lineCap = "round"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 11;
  ctx.beginPath(); ctx.moveTo(40, 66); ctx.lineTo(30, 100); ctx.lineTo(44, 116); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(88, 66); ctx.lineTo(98, 100); ctx.lineTo(84, 116); ctx.stroke();
  // Legs, apart in a crouch.
  ctx.lineWidth = 15;
  ctx.beginPath(); ctx.moveTo(54, 136); ctx.lineTo(44, 190); ctx.lineTo(48, 246); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(74, 136); ctx.lineTo(86, 190); ctx.lineTo(82, 246); ctx.stroke();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
