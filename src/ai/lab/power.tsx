// A test page for the "power is ready" banner on its own: http://localhost:5173/src/ai/lab/power.html
// With no query it shows every god and no god, camera and keyboard, side by side.
// ?god=poseidon (or any god id, or "none") shows that one banner where it sits in a fight, with dashed boxes where the
// camera panel, the prompt card, the hero and the power chips are. Add &keys=1 for keyboard play and &voice=1 to hear Athena.
// Not linked from the game and not part of the production build.
import { StrictMode } from "react";
import type { CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { GOD_IDS } from "../gods/gods";
import type { GodId } from "../gods/gods";
import { PowerReady } from "../power/PowerReady";
import "../../index.css";

const query = new URLSearchParams(window.location.search);
const asked = query.get("god");
const KEYS = query.get("keys") === "1";
const VOICE = query.get("voice") === "1";
const silent = (): boolean => true;
const ALL: readonly (GodId | null)[] = [...GOD_IDS, null];

const DARK = "radial-gradient(ellipse at 50% 30%, #3a2a3f, #0d0a12)";
const NOTE = "12px ui-monospace, monospace";
const box: CSSProperties = { position: "absolute", border: "1px dashed #fff6", color: "#fff9", font: NOTE, padding: 4 };

/** One banner where the fight screen puts it. The dashed boxes are the neighbours it must stay clear of. */
function Stage({ god }: { god: GodId | null }) {
  return (
    <div className="fight" style={{ background: DARK, overflow: "hidden" }}>
      <div style={{ ...box, left: "1rem", bottom: "1rem", width: "clamp(9rem, 20vw, 20rem)", aspectRatio: "4 / 3.4" }}>camera panel</div>
      <div style={{ ...box, right: 24, top: "50%", width: 272, height: 380, transform: "translateY(-50%)" }}>prompt card</div>
      <div style={{ ...box, left: "50%", bottom: 14, width: 250, height: 32, transform: "translateX(-50%)" }}>power chip (pebble HUD)</div>
      <div style={{ ...box, left: 100, top: 92, width: 196, height: 38 }}>power chip (star chart)</div>
      <div style={{ ...box, left: "38%", top: "22%", width: "14%", height: "58%" }}>hero</div>
      {VOICE ? <PowerReady god={god} power={1} keyboard={KEYS} /> : <PowerReady god={god} power={1} keyboard={KEYS} announce={silent} />}
    </div>
  );
}

/** Every god and no god, camera and keyboard, each in a short dark cell with the banner at its foot. */
function Wall() {
  const cell = { position: "relative", height: 190, background: DARK, "--power-ready-bottom": "22px" } as CSSProperties;
  return (
    <main style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, padding: 6, background: "#000" }}>
      {ALL.flatMap((god) =>
        [false, true].map((keyboard) => (
          <div key={`${god ?? "none"}-${String(keyboard)}`} style={cell}>
            <small style={{ position: "absolute", left: 8, top: 6, color: "#fff9", font: NOTE }}>
              {god ?? "no god"}, {keyboard ? "keyboard" : "camera"}
            </small>
            <PowerReady god={god} power={1} keyboard={keyboard} announce={silent} />
          </div>
        )),
      )}
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("the lab page has no #root element");
const one = asked === null ? undefined : asked === "none" ? null : GOD_IDS.find((id) => id === asked);
createRoot(root).render(<StrictMode>{one === undefined ? <Wall /> : <Stage god={one} />}</StrictMode>);
