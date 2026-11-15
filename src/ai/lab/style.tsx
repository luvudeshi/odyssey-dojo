// A test page for the "How do you fight?" screen on its own: http://localhost:5173/src/ai/lab/style.html
// Add ?god=zeus (or any god id) to ask as that god; the default is Athena. With no server running every phrase gets a bundled fight.
// Not linked from the game and not part of the production build.
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import type { EnemySpec } from "../../core/types";
import type { GodId, LevelSpec } from "../contracts";
import { GOD_IDS } from "../gods/gods";
import { RIVALS } from "../rivals";
import { StyleScreen } from "../ui/StyleScreen";
import "../../index.css";

const asked = new URLSearchParams(window.location.search).get("god");
const GOD: GodId = GOD_IDS.find((id) => id === asked) ?? "athena";

function StyleLab() {
  const [fight, setFight] = useState<{ enemy: EnemySpec; level: LevelSpec; source: "ai" | "fallback" } | null>(null);
  if (!fight) return <StyleScreen god={GOD} rivalGod={RIVALS[GOD]} onDone={setFight} />;
  const { enemy, source } = fight;
  return (
    <main className="menu" style={{ height: "auto", minHeight: "calc(100% - 28px)" }}>
      <h1>{enemy.name}</h1>
      <p>
        {source === "ai" ? "Made by the server." : "A bundled fight: the server was out of reach."} Played by the {enemy.id} stop,
        with {enemy.hp} health, {enemy.attacks.length} attacks and {enemy.phases?.length ?? 1} phases.
      </p>
      <button onClick={() => { setFight(null); }}>Ask again</button>
      <pre style={{ textAlign: "left", maxWidth: "60rem", whiteSpace: "pre-wrap", font: "13px ui-monospace, monospace" }}>
        {JSON.stringify(enemy, null, 2)}
      </pre>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("the lab page has no #root element");
createRoot(root).render(
  <StrictMode>
    <StyleLab />
  </StrictMode>,
);
