// The room screens' pure parts: the flow reducer's room cases, the join link and how a guest will play.
import { expect, test, vi } from "vitest";
import { START, flowReducer, openAt } from "../src/screens/flow";
import type { Flow, FlowAction } from "../src/screens/flow";
import { STYLES } from "../src/styles/registry";
import type { EnemySpec } from "../src/core/types";
import { fetchLanBase } from "../src/screens/roomNet";
import { guestMode, joinUrl, reachableBase, roomFromSearch, roomMessage, ROOM_MESSAGES } from "../src/screens/roomUrl";

const run = (actions: readonly FlowAction[], from: Flow = START): Flow => actions.reduce(flowReducer, from);
const style = STYLES[0];
if (!style) throw new Error("no styles");

test("title to host to style, with the fight shared", () => {
  const flow = run([{ type: "hostRoom" }, { type: "hosted", together: true }]);
  expect(flow.screen).toBe("style");
  expect(flow.hosting).toBe(true);
  expect(run([{ type: "pickStyle", style }], flow).screen).toBe("map");
});

test("playing alone from the host screen is single play", () => {
  const flow = run([{ type: "hostRoom" }, { type: "hosted", together: false }]);
  expect(flow.screen).toBe("style");
  expect(flow.hosting).toBe(false);
});

test("title to join to guest, and every room screen goes back to the title", () => {
  expect(run([{ type: "joinRoom" }, { type: "joined" }]).screen).toBe("guest");
  for (const path of [["hostRoom"], ["joinRoom"], ["joinRoom", "joined"]] as const) {
    const flow = run([...path.map((type): FlowAction => ({ type })), { type: "toTitle" }]);
    expect(flow.screen).toBe("title");
    expect(flow.hosting).toBe(false);
  }
});

test("room actions out of place change nothing", () => {
  for (const action of [{ type: "joined" }, { type: "hosted", together: true }, { type: "toTitle" }] as const) {
    expect(flowReducer(START, action)).toBe(START);
  }
  const fighting: Flow = { ...START, screen: "fight" };
  for (const action of [{ type: "hostRoom" }, { type: "joinRoom" }, { type: "toTitle" }] as const) {
    expect(flowReducer(fighting, action)).toBe(fighting);
  }
});

test("a link with a room code opens the join screen; without one the game opens as before", () => {
  expect(openAt([], null, "KXTR", []).screen).toBe("join");
  expect(openAt([], null, null, [])).toBe(START);
  // A reload keeps the stops the saved profile has beaten, on top of the ones `?stop` marks, and drops unknown ids.
  const road = ["a", "b", "c"].map((id) => ({ id }) as EnemySpec);
  expect(openAt(road, null, null, ["c", "zzz"]).cleared).toEqual(["c"]);
  expect(openAt(road, "b", null, ["a", "c"]).cleared).toEqual(["a", "c"]);
  expect(openAt(road, null, "KXTR", ["b"])).toMatchObject({ screen: "join", cleared: ["b"] });
});

test("the QR link is the reachable address plus the code", () => {
  expect(joinUrl("http://192.168.1.20:5741", "kxtr")).toBe("http://192.168.1.20:5741/?room=KXTR");
  expect(joinUrl("http://192.168.1.20:5741/", "k-x t r")).toBe("http://192.168.1.20:5741/?room=KXTR");
  expect(reachableBase("http://localhost:5741", "localhost", "http://192.168.1.20:5741")).toBe("http://192.168.1.20:5741");
  expect(reachableBase("http://localhost:5741", "localhost", null)).toBe("http://localhost:5741");
  expect(reachableBase("https://game.example", "game.example", "http://192.168.1.20:8787")).toBe("https://game.example");
});

test("the code is read from ?room= in any case", () => {
  expect(roomFromSearch("?room=kxtr")).toBe("KXTR");
  expect(roomFromSearch("?room=")).toBeNull();
  expect(roomFromSearch("")).toBeNull();
});

test("a guest uses the camera only on a secure page, else touch on a phone and the keyboard elsewhere", () => {
  expect(guestMode({ secure: true, hasCamera: true, touch: true })).toBe("camera");
  expect(guestMode({ secure: false, hasCamera: false, touch: true })).toBe("touch");
  expect(guestMode({ secure: false, hasCamera: false, touch: false })).toBe("keyboard");
  expect(guestMode({ secure: true, hasCamera: false, touch: false })).toBe("keyboard");
});

test("the address lookup gives up after its time limit when the server never answers", async () => {
  vi.stubGlobal("window", { location: { port: "4173" } });
  // A server that accepts the call and never answers: only the abort ends it.
  vi.stubGlobal("fetch", (_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => { reject(new Error("aborted")); });
  }));
  const started = Date.now();
  expect(await fetchLanBase(40)).toBeNull();
  expect(Date.now() - started).toBeLessThan(2000);
  vi.unstubAllGlobals();
});

test("a failed room call reads as a developer hint only on localhost", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) expect(roomMessage("unreachable", host)).toBe(ROOM_MESSAGES.unreachable);
  for (const host of ["dojo.test", "odyssey.vercel.app"]) expect(roomMessage("unreachable", host)).toMatch(/^Rooms are not open on this site yet/);
  expect(roomMessage("room_full", "odyssey.vercel.app")).toBe(ROOM_MESSAGES.room_full);
  expect(roomMessage("nonsense", "localhost")).toBe("");
});
