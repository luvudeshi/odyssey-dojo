// The screens ask the voice for the right lines, clean up after themselves.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { narrateHomecoming, narrateIntro, narrateResult } from "../src/screens/hookups";
import type { StoryDeps } from "../src/screens/hookups";
import { SettingsPanel } from "../src/ui/SettingsPanel";

function recorder() {
  const calls: string[] = [];
  const deps: StoryDeps = {
    narrate: (id, moment) => { calls.push(`narrate ${id} ${moment}`); return Promise.resolve(true); },
    result: (id, won) => { calls.push(`result ${id} ${String(won)}`); return Promise.resolve(true); },
    homecoming: () => { calls.push("homecoming"); return Promise.resolve(true); },
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

test("the last stop's win asks for Homer's closing line, not the result line, and cleans up the same way", () => {
  const { calls, deps } = recorder();
  narrateHomecoming(deps)();
  expect(calls).toEqual(["homecoming", "stop"]);
});

test("the settings panel has a music volume slider next to the other two", () => {
  const html = renderToStaticMarkup(createElement(SettingsPanel, { onClose: () => undefined }));
  expect(html).toContain("Music volume");
  expect(html).toContain("Effects volume");
  expect(html).toContain("Voice volume");
});
