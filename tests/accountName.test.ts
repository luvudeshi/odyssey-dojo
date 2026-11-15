// The server's rules for an account name, held against the browser's rules for a profile name: the two are written
// apart (the server cannot load a file that needs React), so this is what keeps them the same.
import { expect, test } from "vitest";
import { NAME_MAX, cleanName } from "../src/account/store";
import { NAME_MAX as SERVER_NAME_MAX, NAME_MIN, accountName } from "../server/lib/accountRules";

test("the server cuts a name where the browser cuts it", () => {
  expect(SERVER_NAME_MAX).toBe(NAME_MAX);
});

test("an account name is the profile name with the spaces at its ends gone, or nothing", () => {
  const typed = [
    "Odysseus", "  Odysseus ", "Ody\u0000ss\u001feus\u007f", "King of Ithaca", "Odysseus, son of Laertes, of Ithaca", "a".repeat(NAME_MAX), "a".repeat(NAME_MAX + 5),
    "abc", "ab", "", "   ", " a b ", "Ὀδυσσεύς", "tab\there", "line\nbreak", `${"a".repeat(19)}  b`, "Noël of Troy",
  ];
  for (const raw of typed) {
    const local = cleanName(raw).trim();
    expect(accountName(raw), JSON.stringify(raw)).toBe(local.length >= NAME_MIN ? local : null);
  }
  // What the browser holds is never longer than what the server takes.
  for (const raw of typed) expect(cleanName(raw).length).toBeLessThanOrEqual(SERVER_NAME_MAX);
});

test("what is not text is no name on either side", () => {
  for (const raw of [5, null, undefined, {}, ["Odysseus"], true]) {
    expect(cleanName(raw)).toBe("");
    expect(accountName(raw)).toBeNull();
  }
});
