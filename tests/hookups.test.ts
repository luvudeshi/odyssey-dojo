// The screens ask the voice for the right lines, clean up after themselves, and the god scan can always be left.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { GOD_SCAN_LIMIT_MS, narrateIntro, narrateResult, skipsScan } from "../src/screens/hookups";
import type { StoryDeps } from "../src/screens/hookups";
import { SettingsPanel } from "../src/ui/SettingsPanel";

function recorder() {
  const calls: string[] = [];
  const deps: StoryDeps = {
    narrate: (id, moment) => { calls.push(`narrate ${id} ${moment}`); return Promise.resolve(true); },
    result: (id, won) => { calls.push(`result ${id} ${String(won)}`); return Promise.resolve(true); },
    stop: () => { calls.push("stop"); },
  };
  return { calls, deps };
}

test("the intro asks for Homer's before line of that stop, and its cleanup stops him", () => {
  const { calls, deps } = recorder();
  const cleanup = narrateIntro("circe", deps);
  expect(calls).toEqual(["narrate circe before"]);
  cleanup();
  expect(calls).toEqual(["narrate circe before", "stop"]);
});

test("the result asks for the win or the loss line and cleans up the same way", () => {
  const { calls, deps } = recorder();
  narrateResult("scylla", true, deps)();
  narrateResult("scylla", false, deps)();
  expect(calls).toEqual(["result scylla true", "stop", "result scylla false", "stop"]);
});

test("Esc and S skip the god scan, other keys do not, and the limit is well inside a three minute play", () => {
  expect(["Escape", "s", "S"].every(skipsScan)).toBe(true);
  expect([" ", "Enter", "j", "ArrowLeft"].some(skipsScan)).toBe(false);
  expect(GOD_SCAN_LIMIT_MS).toBeLessThanOrEqual(30000);
});

test("the settings panel has a music volume slider next to the other two", () => {
  const html = renderToStaticMarkup(createElement(SettingsPanel, { onClose: () => undefined }));
  expect(html).toContain("Music volume");
  expect(html).toContain("Effects volume");
  expect(html).toContain("Voice volume");
});
