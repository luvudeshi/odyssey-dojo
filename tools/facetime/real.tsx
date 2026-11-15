// The FaceTime card on its own page, with everything real behind it: the game server's routes, the LiveKit room,
// the picture and the sound that are published, the pose model reading the friend's camera, and a real fight.
// Open /tools/facetime/real.html on the dev server with the game server running (npm run dev:all).
// It is here so the call can be tried before the card is mounted on the Multiplayer screen: a real call when the
// call service is set up, or "Test without a phone" with the stand-in page (standin.html) when only the room is.
// The host has no camera on this page and defends with the keyboard.
// In the address: ?enemy= and ?style= pick the fight, ?ftframe=landscape sends the wide picture.
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { ENEMIES } from "../../src/enemies/registry";
import { FaceTimeCard } from "../../src/facetime/ui/FaceTimeCard";
import type { HostLink } from "../../src/net/host";
import { FightScreen } from "../../src/screens/FightScreen";
import { STYLES } from "../../src/styles/registry";
import "../../src/index.css";
import "./page.css";

const query = new URLSearchParams(window.location.search);
const enemy = ENEMIES.find((each) => each.id === (query.get("enemy") ?? "polyphemus")) ?? ENEMIES[0];
const style = STYLES.find((each) => each.id === (query.get("style") ?? "boxer")) ?? STYLES[0];

function Page() {
  const [link, setLink] = useState<HostLink | null>(null);
  if (!enemy || !style) return <p>No enemy or style found.</p>;
  return (
    <div className="ft-demo__game">
      {link ? (
        <FightScreen
          enemy={enemy} style={style} tracker={null} seed={7} link={link}
          renderEnd={(won) => (
            <p className="notice">
              {won ? "The fight is won." : "The fight is lost."} The call is still on.{" "}
              <button type="button" onClick={() => { setLink(null); }}>Back to the card</button>
            </p>
          )}
        />
      ) : (
        <main className="menu menu--rooms ft-demo__menu">
          <div className="rooms">
            <FaceTimeCard onStart={setLink} />
          </div>
        </main>
      )}
    </div>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("real.html has no #root element");
createRoot(root).render(<StrictMode><Page /></StrictMode>);
