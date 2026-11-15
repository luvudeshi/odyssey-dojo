import { expect, test } from "vitest";
import { cameraErrorMessage, sentence } from "../src/pose/cameraError";

const named = (name: string): DOMException => new DOMException("x", name);

test("each way the camera can fail gets its own plain message", () => {
  expect(cameraErrorMessage(named("NotAllowedError"))).toContain("permission");
  expect(cameraErrorMessage(named("SecurityError"))).toContain("permission");
  expect(cameraErrorMessage(named("NotFoundError"))).toContain("No camera was found");
  expect(cameraErrorMessage(named("OverconstrainedError"))).toContain("No camera was found");
  expect(cameraErrorMessage(named("NotReadableError"))).toContain("in use by another app");
  expect(cameraErrorMessage(named("AbortError"))).toContain("in use by another app");
});

test("anything else, even a non-error, says the tracker did not start", () => {
  expect(cameraErrorMessage(new Error("wasm 404"))).toContain("did not start");
  expect(cameraErrorMessage("boom")).toContain("did not start");
});

test("sentence starts a reason with a capital and leaves the rest alone", () => {
  expect(sentence("step back")).toBe("Step back");
  expect(sentence("I can't see you")).toBe("I can't see you");
});
