// A page to see the five characters outside the game: http://localhost:5173/tools/characters/index.html
// The picker on top, and below it the chosen character on the real rigged body in idle, from the front, from
// behind, or as the fight camera sees him. Not linked from the game and not part of the production build.
// ?c=zeus picks a character, ?view=behind or ?view=fight sets the first view, ?dark puts the page on a dark ground.
import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { StrictMode, Suspense, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Group, Mesh, Object3D } from "three";
import { CharacterFigure } from "../../src/characters/CharacterFigure";
import { CharacterPicker } from "../../src/characters/CharacterPicker";
import { characterById, loadCharacter, saveCharacter } from "../../src/characters/characters";
import type { CharacterId } from "../../src/characters/characters";
import "../../src/index.css";
import "./demo.css";

type View = "front" | "behind" | "fight";

// The idle is a guard stance turned toward the enemy, so "front" is not zero: these turn his chest, then his back,
// to the camera. "fight" is how the fight camera sees him: from behind and to his left.
const TURN: Readonly<Record<View, number>> = { front: 1.2, behind: 1.2 + Math.PI, fight: Math.PI };
const VIEWS: readonly View[] = ["front", "behind", "fight"];
const isView = (value: string | null): value is View => VIEWS.some((v) => v === value);

const params = new URLSearchParams(window.location.search);
const START: CharacterId = params.has("c") ? characterById(params.get("c")).id : loadCharacter();
const viewParam = params.get("view");
const START_VIEW: View = isView(viewParam) ? viewParam : "front";
if (params.has("dark")) document.body.classList.add("demo-dark");

/** Frames to wait after the model arrives before counting, so every piece is mounted. */
const COUNT_AFTER = 5;

function triangles(root: Object3D): number {
  let total = 0;
  root.traverse((node) => {
    const mesh = node as Partial<Mesh> & { isSkinnedMesh?: boolean };
    // The body is the one skinned mesh; everything else under the figure is code-built gear.
    if (!mesh.isMesh || !mesh.geometry || mesh.isSkinnedMesh) return;
    const { index, attributes } = mesh.geometry;
    total += (index ? index.count : (attributes.position?.count ?? 0)) / 3;
  });
  return Math.round(total);
}

function Figure({ id, view, onCount }: { id: CharacterId; view: View; onCount: (count: number) => void }) {
  const group = useRef<Group>(null);
  const frames = useRef(0);
  const counted = useRef<CharacterId | null>(null);
  useFrame(() => {
    if (counted.current === id || !group.current) return;
    frames.current += 1;
    if (frames.current < COUNT_AFTER) return;
    counted.current = id;
    frames.current = 0;
    onCount(triangles(group.current));
  });
  return (
    <group ref={group} rotation={[0, TURN[view], 0]}>
      <CharacterFigure id={id} />
    </group>
  );
}

function Demo() {
  const [id, setId] = useState<CharacterId>(START);
  const [view, setView] = useState<View>(START_VIEW);
  const [count, setCount] = useState<number | null>(null);
  const [done, setDone] = useState<string>("");
  const character = characterById(id);
  return (
    <main className="demo">
      <CharacterPicker
        value={id}
        onChange={(next) => { setId(saveCharacter(next)); setCount(null); setDone(""); }}
        onDone={(picked) => { setDone(`Chosen: ${characterById(picked).name}. The game would go on to the style picker here.`); }}
      />
      <p className="demo-done" role="status">{done}</p>
      <section className="demo-stage" aria-label={`${character.name} on the rigged body`}>
        <Canvas className="demo-canvas" shadows dpr={[1, 2]} camera={{ position: [0, 1.25, 4.4], fov: 30 }}>
          <color attach="background" args={["#2b221c"]} />
          <hemisphereLight args={["#fff4e0", "#5a4a3c", 1.5]} />
          <directionalLight position={[2.5, 4, 3]} intensity={2.6} castShadow />
          <directionalLight position={[-3, 2, -2.5]} intensity={1.4} />
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <circleGeometry args={[1.6, 32]} />
            <meshStandardMaterial color="#4a3a2e" roughness={1} />
          </mesh>
          <Suspense fallback={null}>
            <Figure id={id} view={view} onCount={setCount} />
          </Suspense>
          <OrbitControls target={[0, 1.0, 0]} enablePan={false} minDistance={2} maxDistance={8} />
        </Canvas>
        <div className="demo-side">
          <h2>{character.name}</h2>
          <p>{character.line}</p>
          <p className="demo-view">
            {VIEWS.map((v) => (
              <button key={v} type="button" className={view === v ? "" : "quiet"} aria-pressed={view === v} onClick={() => { setView(v); }}>{v}</button>
            ))}
          </p>
          <p>Drag to turn, scroll to zoom.</p>
          <p data-triangles={count ?? ""}>Gear triangles: {count ?? "counting"}</p>
          <p>Gear: {character.gear.join(", ").replaceAll("_", " ")}</p>
        </div>
      </section>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("the characters page has no #root element");
createRoot(root).render(
  <StrictMode>
    <Demo />
  </StrictMode>,
);
