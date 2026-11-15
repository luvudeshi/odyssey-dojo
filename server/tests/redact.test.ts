// What reaches the log about a failure: the error's text, with any key this server holds and any snapshot cut out.
import { expect, test } from "vitest";
import { createRedactor } from "../lib/redact";

// Made up, and on purpose not shaped like real keys.
const GEMINI = "made-up-gemini-key-0123456789";
const ELEVEN = "made-up-elevenlabs-key-9876543210";
const why = createRedactor([GEMINI, ELEVEN]);

test("a key is cut out wherever it stands, however often, and the rest of the error stays readable", () => {
  expect(why(new Error(`401 for key ${GEMINI}`))).toBe("401 for key [key]");
  expect(why(new Error(`${ELEVEN} was refused`))).toBe("[key] was refused");
  expect(why(new Error(`https://example.test/v1?key=${GEMINI}&xi=${ELEVEN}&key=${GEMINI}`))).toBe("https://example.test/v1?key=[key]&xi=[key]&key=[key]");
  expect(why(new Error(`{"detail":{"message":"Invalid API key: '${ELEVEN}'"}}`))).toBe(`{"detail":{"message":"Invalid API key: '[key]'"}}`);
  expect(why(`a plain string with ${GEMINI}`)).toBe("a plain string with [key]");
});

test("a key that falls across the place where a long error is cut does not leave half of itself behind", () => {
  for (let lead = 270; lead <= 300; lead += 1) {
    // Words with spaces, so the lead-in is not itself taken for a snapshot.
    const text = why(new Error(`${"word ".repeat(60).slice(0, lead)}${GEMINI} and more after it`));
    expect(text.length).toBeLessThanOrEqual(300);
    for (let size = 6; size <= GEMINI.length; size += 1) expect(text, `lead ${String(lead)}`).not.toContain(GEMINI.slice(0, size));
  }
});

test("a snapshot echoed in an error is cut out, and a short word is not", () => {
  const snapshot = Buffer.from("a made-up webcam snapshot, long enough to be taken for one").toString("base64");
  expect(why(new Error(`bad request: ${snapshot} was refused`))).toBe("bad request: [data] was refused");
  expect(why(new Error("timed out after 4800 ms"))).toBe("timed out after 4800 ms");
});

test("with no keys held nothing is replaced, and something that is not an error says nothing about itself", () => {
  const none = createRedactor([null, null, ""]);
  expect(none(new Error("gemini returned nothing"))).toBe("gemini returned nothing");
  expect(none({ apiKey: GEMINI })).toBe("unknown error");
  expect(none(undefined)).toBe("unknown error");
  expect(why({ apiKey: GEMINI })).toBe("unknown error");
});
