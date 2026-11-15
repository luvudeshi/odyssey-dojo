// Changing the sign-in name and the password while signed in (rename and changePassword in src/account/session.ts).
import { expect, test } from "vitest";
import { createAccountClient } from "../src/account/client";
import { createAccountSync, ERROR_TEXT, MISMATCH_TEXT, NAME_TEXT, PASSWORD_CHANGED_TEXT, PASSWORD_TEXT, RENAME_TAKEN_TEXT, renamedText, SESSION_KEY } from "../src/account/session";
import { browser, fakeServer, memory } from "./helpers/accountKit";
import type { FakeServer } from "./helpers/accountKit";

const PASSWORD = "correct horse 9";
const NEXT = "battery staple 7";
const RENAME = "POST /api/account/rename";
const CHANGE = "POST /api/account/password";

async function signedIn(server: FakeServer = fakeServer()) {
  const storage = memory();
  const b = browser(storage);
  const account = createAccountSync({ client: createAccountClient(server.fetch), storage, stores: b.stores, pushDelayMs: 0 });
  await account.signUp("Luv", PASSWORD);
  b.profile.rename("Hero One");
  server.calls.length = 0;
  return { server, storage, account, b };
}
const storedName = (data: Map<string, string>): unknown => (JSON.parse(data.get(SESSION_KEY) ?? "{}") as { name?: unknown }).name;
const sent = (server: FakeServer, route: string): number => server.calls.filter((call) => call.endsWith(route.replace("POST ", " "))).length;

test("rename changes the stored and shown sign-in name and leaves the hero name alone", async () => {
  const { server, storage, account, b } = await signedIn();
  const result = await account.rename("  Luvudeshi ");
  expect(result).toEqual({ ok: true, text: renamedText("Luvudeshi") });
  expect(account.get()).toMatchObject({ status: "signedIn", name: "Luvudeshi" });
  expect(storedName(storage.data)).toBe("Luvudeshi");
  expect(b.profile.get().name).toBe("Hero One");
  expect(server.calls).toContain(RENAME);
});

test("rename: a taken name, a bad name and a busy server show their texts and change nothing", async () => {
  const { server, storage, account } = await signedIn();
  server.accounts.set("other", { name: "Other", password: PASSWORD, save: null, updatedAt: null });
  expect(await account.rename("Other")).toEqual({ ok: false, text: RENAME_TAKEN_TEXT });
  expect(await account.rename("ab")).toEqual({ ok: false, text: NAME_TEXT });
  expect(sent(server, RENAME)).toBe(1);
  server.fail = 429;
  expect(await account.rename("Fresh")).toEqual({ ok: false, text: ERROR_TEXT.slow_down });
  server.fail = 400;
  server.failAs = "invalid";
  expect(await account.rename("Fresh")).toEqual({ ok: false, text: NAME_TEXT });
  expect(account.get()).toMatchObject({ status: "signedIn", name: "Luv" });
  expect(storedName(storage.data)).toBe("Luv");
});

test("password change works, and the new password is the one that signs in", async () => {
  const { server, account } = await signedIn();
  expect(await account.changePassword(PASSWORD, NEXT, NEXT)).toEqual({ ok: true, text: PASSWORD_CHANGED_TEXT });
  expect(server.accounts.get("luv")?.password).toBe(NEXT);
  expect(account.get()).toMatchObject({ status: "signedIn" });
});

test("a wrong current password keeps the player signed in", async () => {
  const { account, storage } = await signedIn();
  expect(await account.changePassword("not it at all", NEXT, NEXT)).toEqual({ ok: false, text: ERROR_TEXT.wrong_password });
  expect(account.get()).toMatchObject({ status: "signedIn", name: "Luv" });
  expect(storage.data.has(SESSION_KEY)).toBe(true);
});

test("a mismatch, a short password and an empty current one never send a request", async () => {
  const { server, account } = await signedIn();
  expect(await account.changePassword(PASSWORD, NEXT, "different one 1")).toEqual({ ok: false, text: MISMATCH_TEXT });
  expect(await account.changePassword(PASSWORD, "short", "short")).toEqual({ ok: false, text: PASSWORD_TEXT });
  expect(await account.changePassword("", NEXT, NEXT)).toEqual({ ok: false, text: ERROR_TEXT.wrong_password });
  expect(server.calls).toEqual([]);
});

test("a 401 on either call signs the player out, quietly, and keeps the progress", async () => {
  for (const act of [(a: Awaited<ReturnType<typeof signedIn>>["account"]) => a.rename("Fresh"), (a: Awaited<ReturnType<typeof signedIn>>["account"]) => a.changePassword(PASSWORD, NEXT, NEXT)]) {
    const { server, account, storage, b } = await signedIn();
    server.sessions.clear();
    expect(await act(account)).toEqual({ ok: false, text: ERROR_TEXT.signed_out });
    expect(account.get()).toEqual({ status: "signedOut", error: "" });
    expect(storage.data.has(SESSION_KEY)).toBe(false);
    expect(b.profile.get().name).toBe("Hero One");
  }
});

test("signed out, neither call sends anything", async () => {
  const server = fakeServer();
  const b = browser();
  const account = createAccountSync({ client: createAccountClient(server.fetch), storage: memory(), stores: b.stores });
  expect(await account.rename("Fresh")).toEqual({ ok: false, text: ERROR_TEXT.signed_out });
  expect(await account.changePassword(PASSWORD, NEXT, NEXT)).toEqual({ ok: false, text: ERROR_TEXT.signed_out });
  expect(server.calls).toEqual([]);
});
