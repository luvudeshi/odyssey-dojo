// Builds the spartan's real bone hierarchy (names, bind translations and rotations) from the shipped .glb, with no
// meshes and no WebGL, so tests can pose it and read the world directions back.
import { readFileSync } from "node:fs";
import { Bone, Group, Object3D } from "three";
import { need } from "./need";

interface GltfNode { name?: string; children?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }
interface Gltf { nodes: GltfNode[]; scenes: { nodes: number[] }[]; skins: { joints: number[] }[] }

export function loadSkeleton(path = "public/models/hero/spartan.glb"): Group {
  const buf = readFileSync(path);
  const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString("utf8")) as Gltf;
  const joints = new Set(json.skins.flatMap((s) => s.joints));
  const build = (index: number): Object3D => {
    const n = need(json.nodes[index]);
    const o = joints.has(index) ? new Bone() : new Object3D();
    o.name = n.name ?? "";
    if (n.translation) o.position.fromArray(n.translation);
    if (n.rotation) o.quaternion.fromArray(n.rotation);
    if (n.scale) o.scale.fromArray(n.scale);
    for (const c of n.children ?? []) o.add(build(c));
    return o;
  };
  const scene = new Group();
  for (const i of json.scenes[0]?.nodes ?? []) scene.add(build(i));
  return scene;
}
