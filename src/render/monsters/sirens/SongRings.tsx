// The song, made visible: rings of light leave the throat and spread toward the hero, with small notes drifting up.
// Nothing shows until a song winds up; the louder it is, the denser the rings.
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { RefObject } from "react";
import { AdditiveBlending, Color, MeshBasicMaterial, OctahedronGeometry, TorusGeometry } from "three";
import type { Mesh } from "three";
import { setProps } from "./geo";
import { SIREN } from "./parts";
import { PHASE_LOOKS } from "./looks";
import type { SirenPose } from "./pose";

const RINGS = 4;
const NOTES = 6;
const RING_SPEED = 1.25;

export function SongRings({ pose, phaseIndex }: { pose: RefObject<SirenPose>; phaseIndex: number }) {
  const ringGeometry = useMemo(() => new TorusGeometry(0.5, 0.018, 4, 32), []);
  const noteGeometry = useMemo(() => new OctahedronGeometry(0.1, 0), []);
  const make = (): MeshBasicMaterial =>
    new MeshBasicMaterial({ color: new Color(1.4, 1.1, 0.5), transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
  // One material per ring so each can fade on its own as it spreads.
  const materials = useMemo(() => ({ rings: Array.from({ length: RINGS }, make), notes: make() }), []);
  useEffect(() => () => {
    ringGeometry.dispose(); noteGeometry.dispose(); materials.notes.dispose();
    for (const m of materials.rings) m.dispose();
  }, [ringGeometry, noteGeometry, materials]);
  const rings = useRef<(Mesh | null)[]>([]);
  const notes = useRef<(Mesh | null)[]>([]);
  const phase = useRef(phaseIndex);
  useEffect(() => { phase.current = phaseIndex; }, [phaseIndex]);

  useFrame((state) => {
    const song = pose.current.song;
    const t = state.clock.elapsedTime;
    const color = (PHASE_LOOKS[Math.min(phase.current, PHASE_LOOKS.length - 1)] ?? PHASE_LOOKS[0]).song;
    materials.notes.color.copy(color);
    setProps(materials.notes, { opacity: Math.min(1, song * 1.5) });
    const [x, y, z] = SIREN.throat;
    rings.current.forEach((ring, i) => {
      if (!ring) return;
      ring.visible = song > 0.01;
      const p = (t * RING_SPEED + i / RINGS) % 1;
      const s = 0.4 + p * 1.9;
      ring.position.set(x + pose.current.x, y + pose.current.y, z + 0.3 + p * 3.4);
      ring.scale.set(s, s, 1);
      const own = materials.rings[i];
      if (own) {
        own.color.copy(color);
        setProps(own, { opacity: 0.7 * Math.min(1, song * 1.5) * Math.sin(Math.PI * Math.min(1, p * 0.9 + 0.1)) });
      }
    });
    notes.current.forEach((note, i) => {
      if (!note) return;
      note.visible = song > 0.01;
      const p = (t * 0.5 + i / NOTES) % 1;
      const side = i % 2 === 0 ? 1 : -1;
      note.position.set(x + side * (0.5 + p * 1.8) + Math.sin(t * 3 + i) * 0.15, y + 0.2 + p * 1.8, z + 0.3 + p * 1.6);
      note.scale.setScalar(Math.sin(Math.PI * p) * (0.7 + 0.5 * (i % 3) / 2));
      note.rotation.set(t * 2 + i, t * 1.5, 0);
    });
  });

  return (
    <>
      {Array.from({ length: RINGS }, (_, i) => (
        <mesh key={`r${String(i)}`} ref={(m) => { rings.current[i] = m; }} geometry={ringGeometry} material={materials.rings[i] ?? materials.notes} visible={false} />
      ))}
      {Array.from({ length: NOTES }, (_, i) => (
        <mesh key={`n${String(i)}`} ref={(m) => { notes.current[i] = m; }} geometry={noteGeometry} material={materials.notes} visible={false} />
      ))}
    </>
  );
}
