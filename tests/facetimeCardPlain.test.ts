// The FaceTime card on the Multiplayer screen is always drawn (`plain`); on the developer pages it still hides itself
// when the server has no FaceTime settings. Static markup shows the first paint, before the server has answered.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { FaceTimeCard } from "../src/facetime/ui/FaceTimeCard";

const status = (): Promise<{ readonly ready: boolean; readonly missing: readonly string[] }> => Promise.resolve({ ready: false, missing: ["CHERT_API_KEY"] });
const html = (plain: boolean): string => renderToStaticMarkup(createElement(FaceTimeCard, { onStart: () => undefined, status, plain }));

describe("FaceTimeCard plain mode", () => {
  test("plain: the normal card with the phone number field and a disabled Call button, no developer text", () => {
    const out = html(true);
    expect(out).toContain("Call a friend on FaceTime");
    expect(out).toContain("Your friend&#x27;s phone number");
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*><span[^>]*>Call<\/span><\/button>/);
    expect(out).not.toContain("Missing on the server");
    expect(out.toLowerCase()).not.toContain("not set up");
  });

  test("default: with no settings and nothing on offer the card draws nothing", () => {
    expect(html(false)).toBe("");
  });
});
