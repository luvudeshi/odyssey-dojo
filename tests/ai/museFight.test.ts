// The Muse's fight outside the quest: which god asks, what the fight screen is given, what the ending offers, and that
// the only thing it ever tells its caller is "leave". There is no DOM here: React's useState is a small stand-in, the
// phrase screen and the fight screen are stubs, and the component's element tree is read. How it looks was checked in a browser.
import { isValidElement } from "react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fightFromLevel } from "../../src/ai/adapt";
import { fallbackLevel } from "../../src/ai/fallbacks";
import type { FightingStyle } from "../../src/core/types";
import { ENEMIES } from "../../src/enemies/registry";
import { MOVES } from "../../src/moves/registry";

type El = ReactElement<Record<string, unknown>>;

const fakes = vi.hoisted(() => {
  let slots: unknown[] = [];
  let cursor = 0;
  return {
    reset(): void { slots = []; cursor = 0; },
    rewind(): void { cursor = 0; },
    useState: (initial: unknown): [unknown, (next: unknown) => void] => {
      const at = cursor++;
      if (at >= slots.length) slots.push(initial);
      return [slots[at], (next: unknown): void => { slots[at] = next; }];
    },
    startMusic: vi.fn<(scene: string) => void>(),
    StyleScreen: (): null => null,
    WebcamGate: (): null => null,
    Button: (): null => null,
    PebbleHeading: (): null => null,
  };
});

vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), useState: fakes.useState }));
vi.mock("../../src/audio/music", () => ({ startMusic: fakes.startMusic }));
vi.mock("../../src/ai/ui/StyleScreen", () => ({ StyleScreen: fakes.StyleScreen }));
vi.mock("../../src/screens/WebcamGate", () => ({ WebcamGate: fakes.WebcamGate }));
vi.mock("../../src/ui/pebble", () => ({ Button: fakes.Button, PebbleHeading: fakes.PebbleHeading }));

const { MuseFight } = await import("../../src/ai/ui/MuseFight");

const STYLE = { id: "boxer", name: "Boxer" } as unknown as FightingStyle;
const LEVEL = fallbackLevel({ phrase: "like an angry goose", god: "athena", rival_god: "poseidon" });
const FIGHT = { enemy: fightFromLevel(LEVEL, ENEMIES, MOVES), level: LEVEL, source: "ai" as const };

function elements(node: unknown, found: El[] = []): El[] {
  if (Array.isArray(node)) {
    for (const child of node as unknown[]) elements(child, found);
  } else if (isValidElement<Record<string, unknown>>(node)) {
    found.push(node);
    elements(node.props.children, found);
  }
  return found;
}

function words(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return (node as unknown[]).map(words).join("");
  return isValidElement<Record<string, unknown>>(node) ? words(node.props.children) : "";
}

function mount(god: Parameters<typeof MuseFight>[0]["god"] = null) {
  const onLeave = vi.fn<() => void>();
  fakes.reset();
  const show = (): El => {
    fakes.rewind();
    return MuseFight({ style: STYLE, tracker: null, god, onLeave }) as El;
  };
  /** The ending the fight screen is handed, with its buttons by label. */
  const ending = (won: boolean) => {
    const all = elements((show().props.renderEnd as (won: boolean) => ReactNode)(won));
    const press = (label: string): void => {
      const button = all.find((element) => element.type === fakes.Button && words(element) === label);
      if (!button) throw new Error(`the ending has no "${label}" button`);
      (button.props.onClick as () => void)();
    };
    const title = all.find((element) => element.type === fakes.PebbleHeading);
    return {
      title: title?.props.text,
      titleClass: String(title?.props.className).trim(),
      text: all.map((element) => (element.type === "p" ? words(element) : "")).join(""),
      labels: all.filter((element) => element.type === fakes.Button).map(words),
      press,
    };
  };
  return { show, ending, onLeave };
}

beforeEach(() => { vi.spyOn(Date, "now").mockReturnValue(1000); });
afterEach(() => { vi.restoreAllMocks(); fakes.startMusic.mockReset(); });

test("it opens on the phrase screen, asking as the scanned god, or as Athena against her rival when there was no scan", () => {
  const none = mount().show();
  expect(none.type).toBe(fakes.StyleScreen);
  expect(none.props.god).toBe("athena");
  expect(none.props.rivalGod).toBe("poseidon");
  expect(none.props).not.toHaveProperty("epithet");

  const scanned = mount({ god: "hermes", rivalGod: "apollo", epithet: "quick of foot" }).show();
  expect(scanned.props.god).toBe("hermes");
  expect(scanned.props.rivalGod).toBe("apollo");
  expect(scanned.props.epithet).toBe("quick of foot");
});

test("Back on the phrase screen leaves, with the menu music left as it was", () => {
  const muse = mount();
  (muse.show().props.onBack as () => void)();
  expect(muse.onLeave).toHaveBeenCalledOnce();
  expect(fakes.startMusic).not.toHaveBeenCalled();
});

test("Fight hands the made fight to the normal fight screen, with the player's style, tracker and god", () => {
  const muse = mount({ god: "zeus", rivalGod: "poseidon", epithet: "loud" });
  (muse.show().props.onDone as (fight: typeof FIGHT) => void)(FIGHT);
  const fight = muse.show();
  expect(fight.type).toBe(fakes.WebcamGate);
  expect(fight.props.enemy).toBe(FIGHT.enemy);
  expect(fight.props.style).toBe(STYLE);
  expect(fight.props.tracker).toBeNull();
  expect(fight.props.god).toBe("zeus");
  expect(fight.props.seed).toBe(1000);
  expect(fight.key).toBe("1000");
  expect(muse.onLeave).not.toHaveBeenCalled();
});

test("the ending names the made monster, shows the Muse's own closing line for a win and for a loss, and its buttons", () => {
  const muse = mount();
  (muse.show().props.onDone as (fight: typeof FIGHT) => void)(FIGHT);
  // Its own title, under the class the result panel's stylesheet swaps in for the fight screen's headline.
  expect(muse.ending(true).title).toBe(`Victory over ${LEVEL.monster.name}`);
  expect(muse.ending(true).titleClass).toBe("end-title");
  expect(muse.ending(false).title).toBe("You are struck down");
  expect(muse.ending(false).titleClass).toBe("end-title end-lost");
  expect(muse.ending(true).text).toBe(LEVEL.narration_outro_win);
  expect(muse.ending(false).text).toBe(LEVEL.narration_outro_lose);
  expect(muse.ending(true).labels).toEqual(["Fight again", "Ask the Muse again", "Back to the map"]);
});

test("Fight again and the pause menu's restart play the same fight afresh; Ask the Muse again goes back to the question", () => {
  const muse = mount();
  (muse.show().props.onDone as (fight: typeof FIGHT) => void)(FIGHT);

  vi.spyOn(Date, "now").mockReturnValue(2000);
  muse.ending(false).press("Fight again");
  expect(muse.show().key).toBe("2000");
  expect(muse.show().props.enemy).toBe(FIGHT.enemy);

  vi.spyOn(Date, "now").mockReturnValue(3000);
  (muse.show().props.onRestart as () => void)();
  expect(muse.show().key).toBe("3000");
  expect(muse.show().props.seed).toBe(3000);
  expect(fakes.startMusic).not.toHaveBeenCalled();

  muse.ending(true).press("Ask the Muse again");
  expect(muse.show().type).toBe(fakes.StyleScreen);
  expect(fakes.startMusic).toHaveBeenCalledExactlyOnceWith("menu");
  expect(muse.onLeave).not.toHaveBeenCalled();
});

test("winning, losing and quitting all leave the same way: onLeave with nothing in it, so the quest hears of no win", () => {
  for (const out of ["won", "lost", "quit"] as const) {
    const muse = mount();
    (muse.show().props.onDone as (fight: typeof FIGHT) => void)(FIGHT);
    if (out === "quit") (muse.show().props.onQuit as () => void)();
    else muse.ending(out === "won").press("Back to the map");
    expect(muse.onLeave, out).toHaveBeenCalledExactlyOnceWith();
    expect(fakes.startMusic, out).toHaveBeenCalledExactlyOnceWith("menu");
    fakes.startMusic.mockReset();
  }
  // The fight screen is given nothing else to call: no "shown" or "ended" callback that a caller could wire to the quest.
  const muse = mount();
  (muse.show().props.onDone as (fight: typeof FIGHT) => void)(FIGHT);
  expect(Object.keys(muse.show().props).sort()).toEqual(["enemy", "god", "onQuit", "onRestart", "renderEnd", "seed", "style", "tracker"]);
});
