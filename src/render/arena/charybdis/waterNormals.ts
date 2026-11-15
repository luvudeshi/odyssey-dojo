// A tiling water normal map made from a handful of crossing sine waves, so no image file (and no licence) is needed.
// Pure: returns RGBA bytes, so a test can check the size, the tiling and that every normal points up.

export function waterNormalBytes(size: number): Uint8Array {
  const waves = [
    { kx: 1, ky: 2, amp: 1, phase: 0.3 },
    { kx: 3, ky: 1, amp: 0.7, phase: 1.9 },
    { kx: 2, ky: 5, amp: 0.45, phase: 4.1 },
    { kx: 7, ky: 3, amp: 0.3, phase: 2.2 },
    { kx: 5, ky: 8, amp: 0.2, phase: 5.5 },
    { kx: 11, ky: 6, amp: 0.12, phase: 0.8 },
  ];
  const tau = Math.PI * 2;
  const bytes = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let dx = 0;
      let dy = 0;
      for (const w of waves) {
        const slope = w.amp * Math.cos(tau * ((w.kx * x + w.ky * y) / size) + w.phase);
        dx += slope * w.kx;
        dy += slope * w.ky;
      }
      const k = 0.07;
      const len = Math.hypot(dx * k, dy * k, 1);
      const o = (y * size + x) * 4;
      bytes[o] = Math.round(((-dx * k) / len * 0.5 + 0.5) * 255);
      bytes[o + 1] = Math.round(((-dy * k) / len * 0.5 + 0.5) * 255);
      bytes[o + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
      bytes[o + 3] = 255;
    }
  }
  return bytes;
}
