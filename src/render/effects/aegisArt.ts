// Athena's aegis, drawn in white on a clear canvas for the guard shield to tint blue: a Gorgon's face at the centre,
// rows of scales, and a fringe of snakes round the rim. Drawn once into a texture, so it costs nothing per frame.
/** The rim's share of the canvas half-width; the rest is room for the snakes. */
export const AEGIS_RIM = 0.7;

type Ctx = CanvasRenderingContext2D;

function scales(ctx: Ctx, R: number): void {
  const row = R * 0.085;
  ctx.lineWidth = R * 0.012;
  for (let r = R * 0.5, k = 0; r < R * 0.9; r += row, k++) {
    const n = Math.round((2 * Math.PI * r) / (row * 1.7));
    for (let i = 0; i < n; i++) {
      ctx.save();
      ctx.rotate(((i + (k % 2) / 2) / n) * 2 * Math.PI);
      ctx.beginPath();
      ctx.arc(r, 0, row * 0.85, -Math.PI / 2, Math.PI / 2);
      ctx.globalAlpha = 0.5;
      ctx.stroke();
      ctx.restore();
    }
  }
}

function rim(ctx: Ctx, R: number): void {
  ctx.lineWidth = R * 0.05;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, 2 * Math.PI); ctx.stroke();
  ctx.lineWidth = R * 0.018;
  ctx.beginPath(); ctx.arc(0, 0, R * 0.925, 0, 2 * Math.PI); ctx.stroke();
}

/** One snake leaving `from` along +x for `len`, curling to `side` (1 or -1), with a head at the end. */
function snake(ctx: Ctx, from: number, len: number, side: number, thick: number): void {
  ctx.lineWidth = thick;
  ctx.beginPath();
  ctx.moveTo(from, 0);
  ctx.bezierCurveTo(from + len * 0.35, side * len * 0.6, from + len * 0.6, -side * len * 0.6, from + len * 0.9, side * len * 0.1);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(from + len * 0.98, side * len * 0.13, len * 0.14, len * 0.09, side * 0.5, 0, 2 * Math.PI);
  ctx.fill();
  ctx.lineWidth = thick * 0.3;
  ctx.beginPath();
  ctx.moveTo(from + len * 1.1, side * len * 0.18);
  ctx.lineTo(from + len * 1.22, side * len * 0.16);
  ctx.moveTo(from + len * 1.1, side * len * 0.18);
  ctx.lineTo(from + len * 1.2, side * len * 0.27);
  ctx.stroke();
}

function fringe(ctx: Ctx, R: number): void {
  const n = 14;
  for (let i = 0; i < n; i++) {
    ctx.save();
    ctx.rotate((i / n) * 2 * Math.PI);
    snake(ctx, R, R * 0.27, i % 2 === 0 ? 1 : -1, R * 0.035);
    ctx.restore();
  }
}

function gorgon(ctx: Ctx, g: number): void {
  // Snakes for hair, over the top of the head.
  for (let i = 0; i < 9; i++) {
    ctx.save();
    ctx.rotate(-Math.PI * 1.06 + (i / 8) * Math.PI * 1.12);
    snake(ctx, g * 0.98, g * 0.4, i % 2 === 0 ? 1 : -1, g * 0.07);
    ctx.restore();
  }
  ctx.lineWidth = g * 0.07;
  ctx.beginPath(); ctx.ellipse(0, 0, g * 1.02, g * 0.97, 0, 0, 2 * Math.PI); ctx.stroke();
  for (const side of [-1, 1]) {
    ctx.lineWidth = g * 0.09;
    ctx.beginPath(); ctx.moveTo(side * g * 0.66, -g * 0.44); ctx.quadraticCurveTo(side * g * 0.38, -g * 0.62, side * g * 0.1, -g * 0.3); ctx.stroke();
    ctx.lineWidth = g * 0.05;
    ctx.beginPath(); ctx.ellipse(side * g * 0.37, -g * 0.19, g * 0.21, g * 0.12, side * 0.18, 0, 2 * Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(side * g * 0.37, -g * 0.19, g * 0.075, 0, 2 * Math.PI); ctx.fill();
    // Fangs.
    ctx.beginPath(); ctx.moveTo(side * g * 0.42, g * 0.33); ctx.lineTo(side * g * 0.34, g * 0.6); ctx.lineTo(side * g * 0.26, g * 0.36); ctx.fill();
  }
  ctx.lineWidth = g * 0.055;
  ctx.beginPath(); ctx.moveTo(0, -g * 0.16); ctx.lineTo(0, g * 0.08); ctx.arc(0, g * 0.06, g * 0.14, 0.12 * Math.PI, 0.88 * Math.PI); ctx.stroke();
  // A wide grin with teeth, and the tongue out.
  ctx.beginPath(); ctx.moveTo(-g * 0.62, g * 0.3); ctx.quadraticCurveTo(0, g * 0.44, g * 0.62, g * 0.3); ctx.quadraticCurveTo(0, g * 0.86, -g * 0.62, g * 0.3); ctx.stroke();
  ctx.lineWidth = g * 0.035;
  for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * g * 0.1, g * 0.385); ctx.lineTo(i * g * 0.1, g * 0.5); ctx.stroke(); }
  ctx.globalAlpha = 0.85;
  ctx.beginPath(); ctx.moveTo(-g * 0.13, g * 0.56); ctx.lineTo(-g * 0.13, g * 0.84); ctx.arc(0, g * 0.84, g * 0.13, Math.PI, 0, true); ctx.lineTo(g * 0.13, g * 0.56); ctx.fill();
  ctx.globalAlpha = 1;
}

/** Draws the aegis centred on a square canvas `size` wide. */
export function drawAegis(ctx: Ctx, size: number): void {
  const R = (size / 2) * AEGIS_RIM;
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#fff";
  ctx.fillStyle = "#fff";
  ctx.shadowColor = "#fff";
  ctx.shadowBlur = size * 0.012;
  scales(ctx, R);
  rim(ctx, R);
  fringe(ctx, R);
  gorgon(ctx, R * 0.4);
  ctx.restore();
}
