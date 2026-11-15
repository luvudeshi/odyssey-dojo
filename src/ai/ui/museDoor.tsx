// The door to the Muse's fight. App draws its main menu through this file: it is the normal main menu, with the same props,
// and under it one button, "Ask the Muse". Pressing it, or loading the page with ?ai=1 in the address, puts the
// "How do you fight?" page in the menu's place until the player leaves it.
// The Muse's own code (MuseRoute and everything under it) is fetched only when she is first opened.
import { Component, Suspense, lazy, useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import { startMusic } from "../../audio/music";
import { log } from "../../core/log";
import { MainMenu } from "../../screens/MainMenu";
import "./museDoor.css";

/** True when the address asks for the Muse's fight: `ai=1` and nothing else (`ai`, `ai=0` and `ai=true` do not). */
export function museFlag(search: string): boolean {
  return new URLSearchParams(search).get("ai") === "1";
}

const MuseRoute = lazy(() => import("./MuseRoute").then((module) => ({ default: module.MuseRoute })));

// Once the player leaves the Muse for the main menu, ?ai=1 does not open her again until the page is loaded again,
// so coming back to the menu from the quest does not open her page a second time. The menu's button still opens her.
let closed = false;

/** If the Muse's page cannot be loaded or breaks while it is up, the main menu is shown in its place. */
class Guard extends Component<{ fallback: ReactNode; onFail: () => void; children?: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error): void {
    log("error", "render-failed:muse", error);
    this.props.onFail();
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function MenuOrMuse(props: ComponentProps<typeof MainMenu>) {
  const [open, setOpen] = useState(() => !closed && museFlag(window.location.search));
  const menu = <MainMenu {...props} />;
  if (!open) {
    return (
      <>
        {menu}
        {/* After the menu in the page, so Tab reaches it after the four shields and it takes no focus of its own. */}
        <button type="button" className="muse-door" onClick={() => { setOpen(true); }}>
          <span className="menu-shield__name">Ask the Muse</span>
          <span className="muse-door__line">Describe how you fight. Gemini writes the monster.</span>
        </button>
      </>
    );
  }
  return (
    // A fight that broke leaves its own music playing, so the menu's is put back.
    <Guard fallback={menu} onFail={() => { closed = true; startMusic("menu"); }}>
      <Suspense fallback={null}>
        <MuseRoute onLeave={() => { closed = true; setOpen(false); }} />
      </Suspense>
    </Guard>
  );
}
