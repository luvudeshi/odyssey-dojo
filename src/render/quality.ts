// Graphics quality: "high" is the full look, "low" drops the costly effects for a weak laptop. Press `q` to switch.
// The choice is a saved setting (src/settings/store.ts).
import { createContext, useContext, useEffect } from "react";
import { setSettings, useSettings } from "../settings/store";

export type Quality = "high" | "low";

export function nextQuality(current: Quality): Quality {
  return current === "high" ? "low" : "high";
}

export const QualityContext = createContext<Quality>("high");

export function useQualityLevel(): Quality {
  return useContext(QualityContext);
}

export function useQualityToggle(): Quality {
  const { quality } = useSettings();
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "q" && !event.repeat) setSettings({ quality: nextQuality(quality) });
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); };
  }, [quality]);
  return quality;
}
