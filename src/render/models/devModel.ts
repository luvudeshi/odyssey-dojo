// Development test model (CC0 RobotExpressive), only used with ?model=dev to prove the GLB pipeline. Not game art.
import { model as polyphemus } from "../monsters/models/Polyphemus";
import { monsterFromGlb } from "./monsterFromGlb";

export const DEV_MODEL = monsterFromGlb(
  {
    url: "/models/dev/RobotExpressive.glb",
    fit: { targetHeight: 3 },
    clips: { idle: "Idle", windup: { default: "Punch" }, hit: "No", death: "Death" },
  },
  polyphemus.Component,
);
