import { describe, expect, it } from "vitest";
import { candidateLoader } from "../src/render/models/candidates";

describe("candidateLoader", () => {
  it("finds the named candidates", () => {
    for (const id of ["dev", "giant", "classic"]) expect(candidateLoader(id)).toBeTypeOf("function");
  });
  it("ignores missing, unknown and inherited keys", () => {
    for (const id of [null, "", "nope", "constructor", "toString", "__proto__", "hasOwnProperty"]) expect(candidateLoader(id)).toBeUndefined();
  });
});
