// The door to the Muse's fight. App draws its main menu through this file: it is the normal main menu, with the same props,
// unless the address has ?ai=1. Then the "How do you fight?" page stands in the menu's place until the player leaves it.
// The Muse's own code (MuseRoute and everything under it) is fetched only when the flag is on.
import { Component, Suspense, lazy, useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import { startMusic } from "../../audio/music";
import { log } from "../../core/log";
import { MainMenu } from "../../screens/MainMenu";

/** True when the address asks for the Muse's fight: `ai=1` and nothing else (`ai`, `ai=0` and `ai=true` do not). */
export function museFlag(search: string): boolean {
  return new URLSearchParams(search).get("ai") === "1";
}

const MuseRoute = lazy(() => import("./MuseRoute").then((module) => ({ default: module.MuseRoute })));

// Once the player leaves the Muse for the main menu she stays away until the page is loaded again,
// so coming back to the menu from the quest does not open her page a second time.
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
  if (!open) return menu;
  return (
    // A fight that broke leaves its own music playing, so the menu's is put back.
    <Guard fallback={menu} onFail={() => { closed = true; startMusic("menu"); }}>
      <Suspense fallback={null}>
        <MuseRoute onLeave={() => { closed = true; setOpen(false); }} />
      </Suspense>
    </Guard>
  );
}
