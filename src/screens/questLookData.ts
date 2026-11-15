// Draft looks for the quest map (QuestLook.tsx): where Troy, each stop and Ithaca's harbour sit on the 1600 x 900 scene,
// per look. Each look draws its own picture, so each has its own table. Delete with the losing looks.
export type Look = "a" | "b" | "c";
type Point = readonly [number, number];

export const LOOK_ROUTE: Record<Look, { troy: Point; slots: readonly Point[]; harbour: Point }> = {
  // The living sea: each point sits on its island in pano.jpg (1536 x 864 scaled to the scene).
  a: { troy: [112, 492], slots: [[300, 412], [599, 518], [452, 352], [1016, 356], [1089, 667], [1384, 452]], harbour: [1540, 520] },
  // Painted medallions: a zig-zag string of round pictures.
  b: { troy: [125, 600], slots: [[310, 430], [550, 620], [790, 430], [1030, 620], [1265, 430], [1450, 620]], harbour: [1535, 440] },
  // The hero's chart: pins on chart.jpg inside its meander border.
  c: { troy: [190, 300], slots: [[272, 450], [560, 640], [800, 470], [925, 225], [1085, 665], [1260, 665]], harbour: [1420, 610] },
};
