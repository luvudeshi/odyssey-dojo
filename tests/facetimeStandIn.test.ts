// The link between the game's card and the stand-in page: the seat goes into the part of the address after "#",
// comes back out whole, and every broken or old link is refused with a plain line.
import { describe, expect, test } from "vitest";
import { STAND_IN_PAGE, readStandInHash, seatProblem, standInLink, tokenFacts } from "../src/facetime/standIn";
import type { FriendSeat } from "../src/facetime/standIn";

// A made-up token of the right shape: header.claims.signature, base64url. Signed with nothing real.
const b64 = (value: unknown): string => btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const tokenFor = (claims: unknown): string => `${b64({ alg: "HS256", typ: "JWT" })}.${b64(claims)}.c2lnbmF0dXJlLW5vdC1yZWFs`;
const ROOM = "odyssey-dojo-0123456789ab";
const EXPIRES = 1_800_000_600;
const token = tokenFor({ iss: "lk-test-key", sub: "facetime-bridge", exp: EXPIRES, name: "Stand-in friend ÿ?>", video: { room: ROOM, roomJoin: true } });
const seat: FriendSeat = { url: "wss://rooms.example.test", room: ROOM, token };

describe("the link to the stand-in page", () => {
  test("carries the seat after the #, never in the query string", () => {
    const link = standInLink("http://localhost:5173", seat);
    const address = new URL(link);
    expect(address.origin).toBe("http://localhost:5173");
    expect(address.pathname).toBe(STAND_IN_PAGE);
    expect(address.search).toBe("");
    expect(link.split("#")[0]).toBe(`http://localhost:5173${STAND_IN_PAGE}`);
    expect(link.split("#")[0]).not.toContain(token);
    expect(address.hash).toContain(token);
    expect(standInLink("http://localhost:5173/", seat)).toBe(link);
  });

  test("the page reads back exactly the seat that was put in", () => {
    const link = standInLink("http://localhost:5173", seat);
    expect(readStandInHash(new URL(link).hash)).toEqual({ ok: true, seat });
    expect(readStandInHash(new URL(link).hash.slice(1))).toEqual({ ok: true, seat });
    const odd: FriendSeat = { ...seat, url: "wss://rooms.example.test/rtc?region=a&b=c d" };
    expect(readStandInHash(new URL(standInLink("http://localhost:5173", odd)).hash)).toEqual({ ok: true, seat: odd });
  });

  test.each([
    ["", /no call to join.*Test without a phone/],
    ["#", /no call to join/],
    [`#room=${ROOM}&token=${token}`, /no room address/],
    [`#url=https://rooms.example.test&room=${ROOM}&token=${token}`, /no room address/],
    [`#url=wss://rooms.example.test&room=someone-elses-room&token=${token}`, /does not name one of the game's call rooms/],
    [`#url=wss://rooms.example.test&room=${ROOM}`, /no token/],
    [`#url=wss://rooms.example.test&room=${ROOM}&token=not a token`, /no token/],
  ] as const)("a link of %j is refused in plain words", (hash, why) => {
    const read = readStandInHash(hash);
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.why).toMatch(why);
  });
});

describe("what the token says", () => {
  test("who the holder is, which room, and when it runs out", () => {
    expect(tokenFacts(token)).toEqual({ identity: "facetime-bridge", room: ROOM, expires: EXPIRES });
  });

  test("anything that is not such a token reads as nothing", () => {
    expect(tokenFacts("")).toBeNull();
    expect(tokenFacts("one.two")).toBeNull();
    expect(tokenFacts("a.!!!.c")).toBeNull();
    expect(tokenFacts("a.bm90LWpzb24.c")).toBeNull();
    expect(tokenFacts(tokenFor("a string"))).toBeNull();
    expect(tokenFacts(tokenFor({ sub: "facetime-bridge", exp: EXPIRES }))).toBeNull();
    expect(tokenFacts(tokenFor({ sub: "facetime-bridge", exp: "soon", video: { room: ROOM } }))).toBeNull();
    expect(tokenFacts(tokenFor({ exp: EXPIRES, video: { room: ROOM } }))).toBeNull();
  });

  test("a seat is usable until its token runs out, and only for its own room", () => {
    expect(seatProblem(seat, (EXPIRES - 1) * 1000)).toBeNull();
    expect(seatProblem(seat, EXPIRES * 1000)).toMatch(/too old/);
    expect(seatProblem({ ...seat, room: "odyssey-dojo-ffffffffffff" }, 0)).toMatch(/another room/);
    expect(seatProblem({ ...seat, token: "a.b.c" }, 0)).toMatch(/cannot be read/);
  });
});
