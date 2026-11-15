// One-euro filter (Casiez et al.): steady at rest, quick when the body moves fast. At 30 Hz and these constants the
// lag is about 60 ms when still and 30 ms in a punch, inside the 100 ms budget.
const MIN_CUTOFF_HZ = 2.5;
const BETA = 0.9;
const DERIVATIVE_CUTOFF_HZ = 1;
/** A gap this long (the body left the picture) restarts the filter instead of gliding across it. */
const MAX_GAP_SECONDS = 0.5;

function alpha(cutoffHz: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dt);
}

export class OneEuro {
  private value = NaN;
  private slope = 0;
  private at = NaN;

  constructor(private readonly minCutoff = MIN_CUTOFF_HZ, private readonly beta = BETA, private readonly dCutoff = DERIVATIVE_CUTOFF_HZ) {}

  reset(): void {
    this.value = NaN;
    this.slope = 0;
  }

  /** Feed one sample taken at `t` seconds; returns the smoothed value. A non-finite sample returns the last value. */
  filter(sample: number, t: number): number {
    if (!Number.isFinite(sample)) return Number.isFinite(this.value) ? this.value : 0;
    const dt = t - this.at;
    if (!Number.isFinite(this.value) || !(dt <= MAX_GAP_SECONDS)) {
      this.value = sample;
      this.slope = 0;
      this.at = t;
      return sample;
    }
    if (dt <= 0) return this.value;
    this.slope += (((sample - this.value) / dt) - this.slope) * alpha(this.dCutoff, dt);
    this.value += (sample - this.value) * alpha(this.minCutoff + this.beta * Math.abs(this.slope), dt);
    this.at = t;
    return this.value;
  }
}
