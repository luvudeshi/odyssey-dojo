// The door App's main menu comes through (src/ai/ui/museDoor.tsx): the normal menu with its props untouched and one
// "Ask the Muse" button under it, the Muse's page in its place once that is pressed or when the address has ?ai=1,
// and the menu again once she is left or breaks.
// There is no DOM here: React's useState is a small stand-in, the menu is a stub, and the component's element tree is read.
import { readFileSync } from "node:fs";
import { isValidElement } from "react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, expect, test, vi } from "vitest";

type El = ReactElement<Record<string, unknown>>;

const fakes = vi.hoisted(() => {
  let slots: unknown[] = [];
  let cursor = 0;
  return {
    reset(): void { slots = []; cursor = 0; },
    rewind(): void { cursor = 0; },
    useState: (initial: unknown): [unknown, (next: unknown) => void] => {
      const at = cursor++;
      if (at >= slots.length) slots.push(typeof initial === "function" ? (initial as () => unknown)() : initial);
      return [slots[at], (next: unknown): void => { slots[at] = next; }];
    },
    MainMenu: (): null => null,
    startMusic: vi.fn<(scene: string) => void>(),
    log: vi.fn<(level: string, event: string, detail?: unknown) => void>(),
  };
});

vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), useState: fakes.useState }));
vi.mock("../../src/screens/MainMenu", () => ({ MainMenu: fakes.MainMenu }));
vi.mock("../../src/audio/music", () => ({ startMusic: fakes.startMusic }));
vi.mock("../../src/core/log", () => ({ log: fakes.log }));

// Typed as the real menu's props, so this fails to compile if the menu's props change and the door's test does not.
const PROPS: Parameters<typeof import("../../src/screens/MainMenu").MainMenu>[0] = {
  name: "Luv",
  notice: "Starting the camera...",
  problem: "",
  onStory: vi.fn<() => void>(),
  onKeyboard: vi.fn<() => void>(),
  onMultiplayer: vi.fn<() => void>(),
  onTraining: vi.fn<() => void>(),
  onAccount: vi.fn<() => void>(),
};

function elements(node: unknown, found: El[] = []): El[] {
  if (Array.isArray(node)) {
    for (const child of node as unknown[]) elements(child, found);
  } else if (isValidElement<Record<string, unknown>>(node)) {
    found.push(node);
    elements(node.props.children, found);
  }
  return found;
}

/** Mounts the door at an address. `fresh` loads the module anew, as a page load does; without it the same page is kept. */
async function mount(search: string, fresh = true) {
  vi.stubGlobal("window", { location: { search } });
  fakes.reset();
  if (fresh) vi.resetModules();
  const { MenuOrMuse } = await import("../../src/ai/ui/museDoor");
  const show = (): El => {
    fakes.rewind();
    return MenuOrMuse(PROPS) as El;
  };
  /** The Muse's page in the tree: the one element given onLeave. */
  const muse = (): El | undefined => elements(show()).find((element) => typeof element.props.onLeave === "function");
  /** Presses the menu's "Ask the Muse" button. */
  const ask = (): void => { (askButton(show())?.props.onClick as () => void)(); };
  return { show, muse, ask };
}

/** The menu's "Ask the Muse" button, if the tree has one. */
function askButton(shown: unknown): El | undefined {
  return elements(shown).find((element) => element.type === "button");
}

function text(node: unknown): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return (node as unknown[]).map(text).join(" ");
  return isValidElement<Record<string, unknown>>(node) ? text(node.props.children) : "";
}

/** The main menu alone, as it is shown when the Muse broke. */
function expectMenu(shown: El): void {
  expect(shown.type).toBe(fakes.MainMenu);
  // The same props, and the very same handlers: nothing is wrapped.
  expect(shown.props).toEqual(PROPS);
  for (const [name, given] of Object.entries(PROPS)) expect(shown.props[name], name).toBe(given);
}

/** The main menu with the "Ask the Muse" button after it, and nothing else. */
function expectMenuWithButton(shown: El): void {
  const drawn = elements(shown.props.children);
  expect(drawn.filter((element) => element.type === fakes.MainMenu)).toHaveLength(1);
  expectMenu(drawn[0] as El);
  const button = askButton(shown);
  // A real button, after the menu so Tab reaches it last, and with no autofocus: the menu's own focus is left alone.
  expect(drawn.indexOf(button as El)).toBe(1);
  expect(drawn.filter((element) => element.type === "button")).toHaveLength(1);
  expect(button?.props.type).toBe("button");
  expect(button?.props.autoFocus).toBeUndefined();
  expect(text(button)).toMatch(/^Ask the Muse .*Gemini/);
}

afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks(); });

test("only ai=1 is the flag", async () => {
  vi.stubGlobal("window", { location: { search: "" } });
  const { museFlag } = await import("../../src/ai/ui/museDoor");
  for (const on of ["?ai=1", "?stop=circe&ai=1", "?ai=1&debug", "ai=1"]) expect(museFlag(on), on).toBe(true);
  for (const off of ["", "?", "?ai", "?ai=", "?ai=0", "?ai=true", "?ai=11", "?AI=1", "?stop=circe", "?air=1", "?ai=0&ai=1"]) expect(museFlag(off), off).toBe(false);
});

test("without the flag the door is the main menu, with every prop as App gave it, and the Ask the Muse button", async () => {
  for (const search of ["", "?stop=circe", "?ai=0", "?ai", "?debug"]) {
    const door = await mount(search);
    expectMenuWithButton(door.show());
    expect(door.muse(), search).toBeUndefined();
  }
  expect(fakes.startMusic).not.toHaveBeenCalled();
});

test("pressing Ask the Muse opens her page, and she can be left and asked again as often as the player likes", async () => {
  const door = await mount("");
  for (let visit = 0; visit < 3; visit++) {
    door.ask();
    const muse = door.muse();
    expect(muse, `visit ${visit}`).toBeDefined();
    expect((muse?.type as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for("react.lazy"));
    expect(Object.keys(muse?.props ?? {})).toEqual(["onLeave"]);
    // Her page stands in the menu's place: no menu and no button under it.
    expect(elements(door.show()).some((element) => element.type === fakes.MainMenu || element.type === "button")).toBe(false);

    (muse?.props.onLeave as () => void)();
    expectMenuWithButton(door.show());
    expect(door.muse()).toBeUndefined();
  }

  // The menu drawn again later on the same page still has the button, and it still opens her.
  const later = await mount("", false);
  expectMenuWithButton(later.show());
  later.ask();
  expect(later.muse()).toBeDefined();
});

test("with ?ai=1 the Muse's page stands in the menu's place, loaded lazily, and is given only a way to leave", async () => {
  const door = await mount("?ai=1");
  const shown = door.show();
  expect(shown.type).not.toBe(fakes.MainMenu);
  const muse = door.muse();
  expect(muse).toBeDefined();
  // A lazy component: its code is fetched when it is first drawn, not when the door is imported.
  expect((muse?.type as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for("react.lazy"));
  // No dispatch, no profile, none of the menu's handlers: nothing through which a fight could reach the quest.
  expect(Object.keys(muse?.props ?? {})).toEqual(["onLeave"]);
  expect(elements(shown).some((element) => element.type === fakes.MainMenu)).toBe(false);
});

test("leaving the Muse shows the main menu with its button, and the flag does not open her again for the rest of the page's life", async () => {
  const door = await mount("?ai=1");
  (door.muse()?.props.onLeave as () => void)();
  expectMenuWithButton(door.show());

  // The menu is drawn again after a trip through the quest: a new mount on the same page, the address unchanged.
  const later = await mount("?ai=1", false);
  expectMenuWithButton(later.show());
  expect(later.muse()).toBeUndefined();
  // The button opens her all the same.
  later.ask();
  expect(later.muse()).toBeDefined();

  // A reload brings her back.
  const reloaded = await mount("?ai=1");
  expect(reloaded.muse()).toBeDefined();
});

test("if the Muse's page breaks or cannot be loaded, the main menu is shown with its music, and the flag does not try her again", async () => {
  const door = await mount("?ai=1");
  const guard = door.show();
  const Guard = guard.type as unknown as {
    new (props: unknown): { state: { failed: boolean }; render(): ReactNode; componentDidCatch(error: Error): void };
    getDerivedStateFromError(): { failed: boolean };
  };
  const live = new Guard(guard.props);
  expect(elements(live.render()).some((element) => typeof element.props.onLeave === "function")).toBe(true);

  live.state = Guard.getDerivedStateFromError();
  live.componentDidCatch(new Error("the chunk did not load"));
  expectMenu(live.render() as El);
  expect(fakes.startMusic).toHaveBeenCalledExactlyOnceWith("menu");
  expect(fakes.log).toHaveBeenCalledWith("error", "render-failed:muse", expect.any(Error));

  const later = await mount("?ai=1", false);
  expectMenuWithButton(later.show());
});

test("App.tsx is changed in one line, and the door does not pull the Muse's code in with it", () => {
  const read = (path: string): string[] => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8").split("\n");
  const app = read("src/App.tsx");
  expect(app.filter((line) => line.includes("museDoor"))).toHaveLength(1);
  expect(app.filter((line) => /MenuOrMuse|museFlag|MuseRoute|MuseFight/.test(line))).toHaveLength(1);
  expect(app.filter((line) => line.includes("screens/MainMenu\""))).toHaveLength(0);

  const imports = (path: string): string[] => read(path).filter((line) => line.startsWith("import "));
  // The door's static imports: React, the menu, the music, the log and its own sheet. The Muse's page is reached by import() only.
  expect(imports("src/ai/ui/museDoor.tsx").filter((line) => /MuseRoute|MuseFight|StyleScreen|\.\.\/(adapt|client|fallbacks)/.test(line))).toEqual([]);
  expect(read("src/ai/ui/museDoor.tsx").filter((line) => line.includes("import(\"./MuseRoute\")"))).toHaveLength(1);
  // Nothing on the Muse's side imports the profile or the quest's flow, so a made fight has no way to record a win or clear a stop.
  for (const path of ["src/ai/ui/museDoor.tsx", "src/ai/ui/MuseRoute.tsx", "src/ai/ui/MuseFight.tsx", "src/ai/ui/StyleScreen.tsx"]) {
    expect(imports(path).filter((line) => /account\/|screens\/flow|screens\/EndScreen/.test(line)), path).toEqual([]);
  }
});
