import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { PhoneNoticeView } from "../src/ui/phone/PhoneNotice";
import { DISMISSED_KEY, noticeAllowed, noticeRoom, readDismissed, shouldShowNotice, writeDismissed } from "../src/ui/phone/noticeRules";

test("the notice is shown under 700 px wide and never at 700 px or wider", () => {
  expect([320, 390, 699, 700, 1280].map((width) => shouldShowNotice(width, false))).toEqual([true, true, true, false, false]);
});

test("after Continue anyway it is not shown at any width", () => {
  expect([320, 390, 699, 700, 1280].map((width) => shouldShowNotice(width, true))).toEqual([false, false, false, false, false]);
});

test("the room code is read from the address, cleaned, and is null when there is none", () => {
  expect(noticeRoom("?room=ABCD")).toBe("ABCD");
  expect(noticeRoom("?stop=polyphemus&room=ab-cd")).toBe("ABCD");
  expect(noticeRoom("")).toBeNull();
  expect(noticeRoom("?room=")).toBeNull();
  expect(noticeRoom("?room=1234")).toBeNull();
});

test("an address that asks for the FaceTime picture never gets the notice", () => {
  expect(noticeAllowed("?ftframe=landscape")).toBe(false);
  expect(noticeAllowed("?ftframe=portrait&room=ABCD")).toBe(false);
  expect(noticeAllowed("")).toBe(true);
  expect(noticeAllowed("?room=ABCD")).toBe(true);
});

test("Continue anyway is kept for the tab, and a store that is missing or throws reads as not pressed", () => {
  const kept = new Map<string, string>();
  const store = { getItem: (key: string) => kept.get(key) ?? null, setItem: (key: string, value: string) => { kept.set(key, value); } };
  expect(readDismissed(store)).toBe(false);
  writeDismissed(store);
  expect(kept.get(DISMISSED_KEY)).toBe("1");
  expect(readDismissed(store)).toBe(true);
  expect(readDismissed(null)).toBe(false);
  const broken = { getItem: (): string | null => { throw new Error("blocked"); }, setItem: (): void => { throw new Error("blocked"); } };
  expect(readDismissed(broken)).toBe(false);
  expect(() => { writeDismissed(broken); }).not.toThrow();
  expect(() => { writeDismissed(null); }).not.toThrow();
});

test("the notice names the game, says to open it on a laptop and has a Continue anyway button, in the storm kit's classes", () => {
  const html = renderToStaticMarkup(createElement(PhoneNoticeView, { room: null, onContinue: () => undefined }));
  expect(html).toContain("Odyssey Dojo");
  expect(html).toContain("odysseydojo.club");
  expect(html).toContain("laptop");
  expect(html).toMatch(/<button type="button" class="set-btn set-btn--primary">Continue anyway<\/button>/);
  expect(html).toContain("set-panel");
  expect(html).toContain("set-kicker");
  expect(html).toContain("set-title");
  expect(html).not.toContain("room code");
});

test("with a room code in the address the notice says the code", () => {
  const html = renderToStaticMarkup(createElement(PhoneNoticeView, { room: "ABCD", onContinue: () => undefined }));
  expect(html).toContain("Your room code is <b>ABCD</b>");
});
