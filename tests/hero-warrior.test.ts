import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { candidate } from "../src/render/hero/defs/warrior";

interface GltfJson {
  readonly animations: readonly { readonly name: string }[];
  readonly nodes: readonly { readonly name?: string }[];
}

/** The JSON chunk of the shipped GLB: 12-byte header, then a chunk of length + type + data. */
function readGltf(): GltfJson {
  const buf = readFileSync("public/models/hero/warrior.glb");
  const length = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + length).toString("utf8")) as GltfJson;
}

describe("warrior hero model", () => {
  const gltf = readGltf();
  const clips = new Set(gltf.animations.map((a) => a.name));
  // three.js drops the dots from node names when it loads a glTF, and anchors are looked up by the loaded name.
  const nodes = new Set(gltf.nodes.map((n) => (n.name ?? "").replace(/\./g, "")));

  it("stays under 3 MB", () => {
    expect(readFileSync("public/models/hero/warrior.glb").length).toBeLessThan(3 * 1024 * 1024);
  });

  it("only names clips the file has", () => {
    const rig = candidate.rig;
    const named = [rig?.idle, ...Object.values(rig?.poses ?? {}).flat(), ...Object.values(rig?.byMove ?? {})];
    for (const name of named) expect(clips.has(name ?? "")).toBe(true);
  });

  it("mounts gear on bones that exist", () => {
    for (const bone of Object.keys(candidate.anchors ?? {})) expect(nodes.has(bone)).toBe(true);
  });
});
