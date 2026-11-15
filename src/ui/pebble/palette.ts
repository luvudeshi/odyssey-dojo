// The pebble palette. Every stone colour in the kit comes from here; CSS reads the same hues through src/theme.css.
export type Palette = readonly [string, ...string[]];

export const PAL = {
  ground: ["#15100e", "#1b1512", "#211a16", "#18130f", "#1e1814"],
  cream: ["#f1e6cf", "#e8dabb", "#dccaa4", "#f5edda", "#e2d2b3"],
  ochre: ["#d9a34a", "#c98f37", "#e2b25d", "#b97f2f"],
  terra: ["#b8553a", "#a64630", "#c9684a", "#93402c"],
  slate: ["#6f8791", "#5f7882", "#84a0aa", "#52696f"],
  dusk: ["#223039", "#1b2830", "#2a3b45", "#1e2c34"],
  blood: ["#2e1713", "#35190f", "#28120f", "#3a1d14"],
  olive: ["#8d9a5b", "#79864b", "#a0ab6c"],
  sea: ["#3a5560", "#2f4852", "#46636d", "#34505a"],
  dim: ["#2a211c", "#30251f", "#251d19", "#2e2420"],
} as const satisfies Record<string, Palette>;

export const LEAD = "#9c9b93";
export const GROUT = "rgba(6,4,3,0.55)";
export const TROUGH = "rgba(8,5,4,0.62)";

export type Tone = keyof typeof PAL;
