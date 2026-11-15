// The hall must leave the fight zone and the camera's path clear, and build as a couple of merged meshes.
import { describe, expect, it } from "vitest";
import { hallSolids } from "../src/render/arena/suitors/hall";
import { CAMERA_ZONE, FIGHT_ZONE, HALL, overlapsBox, solidFootprints } from "../src/render/arena/suitors/layout";
import { propSolids } from "../src/render/arena/suitors/props";

describe("suitors hall", () => {
  it("keeps every column, table, axe and the hearth out of the fight zone and the camera zone", () => {
    for (const f of solidFootprints()) {
      expect(overlapsBox(f, FIGHT_ZONE)).toBe(false);
      expect(overlapsBox(f, CAMERA_ZONE)).toBe(false);
    }
  });

  it("fits the fight zone and camera inside the hall", () => {
    for (const box of [FIGHT_ZONE, CAMERA_ZONE]) {
      expect(box.minX).toBeGreaterThan(HALL.minX);
      expect(box.maxX).toBeLessThan(HALL.maxX);
      expect(box.minZ).toBeGreaterThan(HALL.minZ);
      expect(box.maxZ).toBeLessThan(HALL.maxZ);
    }
  });

  it("builds the shell and the props as one vertex-coloured geometry each, under a small triangle budget", () => {
    for (const solids of [hallSolids(), propSolids()]) {
      const g = solids.build();
      expect(g.getAttribute("color")).toBeDefined();
      expect((g.index?.count ?? 0) / 3).toBeLessThan(15000);
    }
  });
});
