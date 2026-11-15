// Which bone each piece of the spartan's gear hangs on.
import type { ReactNode } from "react";
import { BackShield, HandGear, World } from "./carriedGear";
import { Cape, Chiton, Cuirass, Frame, Greave, Helmet } from "./spartanGear";

export const SPARTAN_ANCHORS: Readonly<Record<string, ReactNode>> = {
  Head: <Frame bone="Head"><Helmet /></Frame>,
  spine_03: (
    <Frame bone="spine_03">
      <Cuirass />
      <Cape />
      <BackShield />
    </Frame>
  ),
  pelvis: <Frame bone="pelvis"><Chiton /></Frame>,
  calf_l: <Frame bone="calf_l"><Greave /></Frame>,
  calf_r: <Frame bone="calf_r"><Greave /></Frame>,
  hand_r: <World><HandGear /></World>,
};
