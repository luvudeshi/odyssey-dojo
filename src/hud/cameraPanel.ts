// What the camera panel shows when it has no live picture, and the shared camera's state handed down to it.
import { createContext } from "react";
import type { CameraStatus } from "../pose/cameraSession";

export interface CameraPanel {
  /** The shared camera's state. "live" where no session hands one down (a tracker passed in directly). */
  readonly status: CameraStatus;
  /** Starts the camera from the panel, or null where that is not offered. */
  readonly onCamera: (() => void) | null;
}

export const CameraPanelContext = createContext<CameraPanel>({ status: "live", onCamera: null });

export type PanelState = CameraStatus | "keyboard";

/** A fight without a tracker is keyboard play, unless the camera is on its way. */
export function panelState(hasTracker: boolean, status: CameraStatus): PanelState {
  if (hasTracker) return status;
  return status === "starting" ? "starting" : "keyboard";
}

const NOTES: Readonly<Record<PanelState, string>> = {
  live: "",
  starting: "Camera starting...",
  restarting: "Camera stopped. Restarting...",
  failed: "Camera stopped",
  off: "Camera stopped",
  keyboard: "Keyboard mode",
};

export const panelNote = (shown: PanelState): string => NOTES[shown];

/** The panel offers "Use camera" when nothing is starting the camera already. */
export const offersCamera = (shown: PanelState): boolean => shown === "keyboard" || shown === "failed" || shown === "off";
