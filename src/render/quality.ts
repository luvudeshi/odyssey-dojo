// Graphics quality: "high" is the full look, "low" drops the costly effects for a weak laptop. Press `q` to switch.
// Nothing is saved: every fight starts on high.
import { createContext, useContext, useEffect, useState } from "react";

export type Quality = "high" | "low";

export function nextQuality(current: Quality): Quality {
  return current === "high" ? "low" : "high";
}

export const QualityContext = createContext<Quality>("high");

export function useQualityLevel(): Quality {
  return useContext(QualityContext);
}

export function useQualityToggle(): Quality {
  const [quality, setQuality] = useState<Quality>("high");
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "q" && !event.repeat) setQuality(nextQuality);
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); };
  }, []);
  return quality;
}
