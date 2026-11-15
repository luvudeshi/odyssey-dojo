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
      <div style={{ ...box, left: 20, bottom: 20, width: "clamp(10rem, 16.7vw, 15rem)", aspectRatio: "4 / 3" }}>camera panel</div>
      <div style={{ ...box, right: 24, top: "50%", width: 300, height: 440, transform: "translateY(-50%)" }}>prompt card</div>
      <div style={{ ...box, left: 96, top: 94, width: 250, height: 42 }}>power chip</div>
      <div style={{ ...box, left: "38%", top: "55%", width: "10%", height: "33%" }}>hero</div>
      {VOICE ? <PowerReady god={god} power={1} keyboard={KEYS} /> : <PowerReady god={god} power={1} keyboard={KEYS} announce={silent} />}
    </div>
  );
}

/** Every god and no god, camera and keyboard, each in a short dark cell with the banner at its foot. */
function Wall() {
  const cell = { position: "relative", height: 200, background: DARK, "--power-ready-bottom": "22px", "--power-ready-left": "8px", "--power-ready-right": "8px" } as CSSProperties;
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
