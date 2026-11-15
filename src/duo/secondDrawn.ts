// Two players on one camera: when player two's figure was last moved in the scene, on the performance.now() clock.
// Written by SecondFigure every frame it is on screen with its model loaded. Read only by scripts/duo-smoke.mjs,
// which has no other way to tell that the second hero is really there. No rule of the game reads it.
export const secondDrawn = { at: -Infinity };
