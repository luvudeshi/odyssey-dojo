// The one WebGL context of the move guide. The prompt card is mounted again for every prompt, so a canvas made by the
// card would make a context per prompt; this module makes the renderer once, and a card only borrows its canvas
// (moving a canvas in the page keeps its context). It draws only while a card holds it, and nothing is allocated per
// frame in three.js terms. Colours come from the card's own --mg-ink and --mg-accent.
import {
  AmbientLight, CircleGeometry, Color, CylinderGeometry, DirectionalLight, Mesh, MeshBasicMaterial, MeshLambertMaterial,
  PerspectiveCamera, Quaternion, Scene, SphereGeometry, Vector3, WebGLRenderer,
} from "three";
import { poseAt } from "../guide";
import type { Guide, GuideEnd, GuideJoint } from "../guide";
import { figure3d, isLit } from "../guide3d";
import type { Figure3D, Vec3 } from "../guide3d";

type Side = "left" | "right";
const SIDES: readonly Side[] = ["left", "right"];
/** [from, to, the end that decides whether it is lit, radius]. A sphere sits at each `to`. */
const BONES: readonly (readonly [GuideJoint, GuideJoint, GuideEnd, number])[] = SIDES.flatMap((side): [GuideJoint, GuideJoint, GuideEnd, number][] => [
  [`${side}Shoulder`, `${side}Elbow`, `${side}Wrist`, 0.05], [`${side}Elbow`, `${side}Wrist`, `${side}Wrist`, 0.045],
  [`${side}Hip`, `${side}Knee`, `${side}Foot`, 0.075], [`${side}Knee`, `${side}Foot`, `${side}Foot`, 0.06],
]);
const HEAD = 0.13;
const FIST = 1.6;
/** Looking at the figure from its right front: forward then also moves across the picture, which is what shows depth. */
const AZIMUTH = 0.22;
const AIM = new Vector3(0, 1.0, 0.15);
const DISTANCE = 3.0;
const FALLBACK_SIZE = { w: 260, h: 200 } as const;

interface Part { readonly mesh: Mesh; readonly from: GuideJoint; readonly to: GuideJoint; readonly radius: number; readonly end: GuideEnd | null }

interface Hold { slot: HTMLElement; guide: Guide; mirrored: boolean; began: number; onFail: () => void; watch: ResizeObserver | null }

const UP = new Vector3(0, 1, 0);
const [a, b, dir, mid] = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
const turn = new Quaternion();

/** Puts a unit cylinder (radius 1, height 1, along y) between two points. */
function span(mesh: Mesh, from: Vec3, to: Vec3, radius: number, wide = radius): void {
  a.set(from[0], from[1], from[2]); b.set(to[0], to[1], to[2]);
  dir.subVectors(b, a);
  const length = dir.length();
  mesh.position.copy(mid.addVectors(a, b).multiplyScalar(0.5));
  mesh.scale.set(wide, Math.max(length, 1e-4), radius);
  if (length > 1e-6) mesh.quaternion.copy(turn.setFromUnitVectors(UP, dir.multiplyScalar(1 / length)));
}

class Stage {
  failed = false;
  /** How many WebGL contexts this module has made: one, however many cards come and go. */
  contexts = 0;
  private hold: Hold | null = null;
  private handle = 0;
  private built: { renderer: WebGLRenderer; canvas: HTMLCanvasElement; camera: PerspectiveCamera; scene: Scene; parts: Part[]; spheres: Part[]; torso: Mesh; head: Mesh; ink: MeshLambertMaterial; accent: MeshLambertMaterial; floor: MeshBasicMaterial } | null = null;

  /** False without WebGL (tests, a server) or after the context was lost. */
  supported(): boolean {
    return !this.failed && typeof document !== "undefined" && typeof WebGLRenderingContext !== "undefined";
  }

  private build(): NonNullable<Stage["built"]> {
    if (this.built) return this.built;
    const canvas = document.createElement("canvas");
    canvas.className = "mg-gl";
    const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
    this.contexts += 1;
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x000000, 0);
    canvas.addEventListener("webglcontextlost", () => {
      this.failed = true;
      this.stopLoop();
      this.hold?.onFail();
    });
    const scene = new Scene();
    scene.add(new AmbientLight(0xffffff, 1.5));
    const sun = new DirectionalLight(0xffffff, 2.4);
    sun.position.set(1.5, 3, 3);
    scene.add(sun);
    const ink = new MeshLambertMaterial({ color: "#f2e4c8" });
    const accent = new MeshLambertMaterial({ color: "#ffd9a0" });
    const floor = new MeshBasicMaterial({ color: "#f2e4c8", transparent: true, opacity: 0.22 });
    const disc = new Mesh(new CircleGeometry(0.75, 24), floor);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.002;
    scene.add(disc);
    const cylinder = new CylinderGeometry(1, 1, 1, 8, 1);
    const ball = new SphereGeometry(1, 8, 6);
    const parts: Part[] = [];
    const spheres: Part[] = [];
    for (const [from, to, end, radius] of BONES) {
      parts.push({ mesh: new Mesh(cylinder, ink), from, to, radius, end });
      spheres.push({ mesh: new Mesh(ball, ink), from, to, radius: radius * (to.endsWith("Wrist") ? FIST : 1.15), end });
    }
    const torso = new Mesh(new CylinderGeometry(1, 0.78, 1, 12, 1), ink);
    const head = new Mesh(new SphereGeometry(HEAD, 12, 10), ink);
    scene.add(torso, head, ...parts.map((part) => part.mesh), ...spheres.map((part) => part.mesh));
    this.built = { renderer, canvas, camera: new PerspectiveCamera(38, 1.3, 0.1, 30), scene, parts, spheres, torso, head, ink, accent, floor };
    return this.built;
  }

  /** Puts the canvas in `slot` and starts drawing `guide` there. `onFail` runs if WebGL cannot be had or is lost. */
  attach(slot: HTMLElement, guide: Guide, mirrored: boolean, onFail: () => void): void {
    let built: NonNullable<Stage["built"]>;
    try {
      built = this.build();
    } catch {
      this.failed = true;
      onFail();
      return;
    }
    const { renderer, canvas, camera, parts, spheres, ink, accent, floor } = built;
    slot.appendChild(canvas);
    this.fit(slot);
    camera.position.set(AIM.x + DISTANCE * Math.sin(AZIMUTH), AIM.y + 0.8, AIM.z + DISTANCE * Math.cos(AZIMUTH));
    camera.lookAt(AIM);
    camera.updateProjectionMatrix();
    const style = getComputedStyle(slot);
    ink.color.set(style.getPropertyValue("--mg-ink").trim() || "#f2e4c8");
    accent.color.set(style.getPropertyValue("--mg-accent").trim() || "#ffd9a0");
    floor.color.copy(ink.color);
    const whole = guide.moving.includes("head");
    for (const part of [...parts, ...spheres]) part.mesh.material = part.end !== null && isLit(guide.moving, part.end) ? accent : ink;
    built.torso.material = built.head.material = whole ? accent : ink;
    // The dojo's box changes size with the window; the card's does not, but watching it costs nothing.
    const watch = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => { if (this.hold?.slot === slot) this.fit(slot); });
    watch?.observe(slot);
    this.hold = { slot, guide, mirrored, began: performance.now(), onFail, watch };
    if (this.handle === 0) this.handle = requestAnimationFrame(this.frame);
  }

  /** Takes the canvas back out of `slot` (if it is still there) and stops drawing. */
  detach(slot: HTMLElement): void {
    if (this.hold?.slot !== slot) return;
    this.hold.watch?.disconnect();
    this.hold = null;
    this.stopLoop();
    this.built?.canvas.remove();
  }

  /** Sizes the drawing to `slot`. */
  private fit(slot: HTMLElement): void {
    if (!this.built) return;
    const { renderer, camera } = this.built;
    const [w, h] = [slot.clientWidth || FALLBACK_SIZE.w, slot.clientHeight || FALLBACK_SIZE.h];
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  private stopLoop(): void {
    cancelAnimationFrame(this.handle);
    this.handle = 0;
  }

  private readonly frame = (now: number): void => {
    const { hold, built } = this;
    if (!hold || !built) { this.handle = 0; return; }
    const { pose, toward } = poseAt(hold.guide, now - hold.began);
    const figure: Figure3D = figure3d(pose, toward, hold.mirrored);
    for (const part of built.parts) span(part.mesh, figure[part.from], figure[part.to], part.radius);
    for (const part of built.spheres) {
      const [x, y, z] = figure[part.to];
      part.mesh.position.set(x, y, z);
      part.mesh.scale.setScalar(part.radius);
    }
    const [ls, rs, lh, rh] = [figure.leftShoulder, figure.rightShoulder, figure.leftHip, figure.rightHip];
    const wide = Math.hypot(rs[0] - ls[0], rs[1] - ls[1]) / 2;
    a.set((ls[0] + rs[0]) / 2, (ls[1] + rs[1]) / 2, (ls[2] + rs[2]) / 2);
    b.set((lh[0] + rh[0]) / 2, (lh[1] + rh[1]) / 2, (lh[2] + rh[2]) / 2);
    span(built.torso, [a.x, a.y, a.z], [b.x, b.y, b.z], wide * 0.62, wide * 1.15);
    built.head.position.set(figure.head[0], figure.head[1], figure.head[2]);
    built.renderer.render(built.scene, built.camera);
    this.handle = requestAnimationFrame(this.frame);
  };
}

export const stage = new Stage();
