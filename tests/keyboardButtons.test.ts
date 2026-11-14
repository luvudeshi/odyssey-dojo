// Space must still activate a focused button (the result overlay) while the fight keyboard is attached.
import { afterEach, expect, test, vi } from "vitest";
import { createKeyboard } from "../src/input/keyboard";
import { MOVES } from "../src/moves/registry";

class FakeButton {}

afterEach(() => { vi.unstubAllGlobals(); });

function press(target: unknown): boolean {
  let handler: (event: unknown) => void = () => undefined;
  vi.stubGlobal("HTMLButtonElement", FakeButton);
  vi.stubGlobal("window", {
    addEventListener: (type: string, fn: (event: unknown) => void) => { if (type === "keydown") handler = fn; },
    removeEventListener: () => undefined,
  });
  const keyboard = createKeyboard(MOVES);
  let prevented = false;
  handler({ key: " ", repeat: false, target, preventDefault: () => { prevented = true; } });
  keyboard.dispose();
  return prevented;
}

test("Space is swallowed for the game but not on a focused button", () => {
  expect(press({})).toBe(true);
  expect(press(new FakeButton())).toBe(false);
});
