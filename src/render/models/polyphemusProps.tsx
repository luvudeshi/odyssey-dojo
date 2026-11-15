// Parts shared by the Polyphemus candidates, built in code in the stylized low-poly look: the eye, the stake and the club. Sizes are metres.

export function Eye({ blinded, glow }: { blinded: boolean; glow: number }) {
  return blinded ? (
    <group>
      {/* A socket as big as the live eye, so it hides the giant's two native eyes too. */}
      <mesh scale={[1.3, 0.95, 0.85]} position={[0, 0, 0.04]}>
        <icosahedronGeometry args={[0.5, 1]} />
        <meshStandardMaterial color="#2a0d0a" flatShading roughness={1} />
      </mesh>
      <mesh position={[0, 0, 0.1]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.035, 0.05, 1.1, 6]} />
        <meshStandardMaterial color="#2b1a10" flatShading roughness={1} />
      </mesh>
      <mesh position={[0, 0, 0.7]}>
        <icosahedronGeometry args={[0.07, 0]} />
        <meshStandardMaterial color="#ffb050" emissive="#ff6a10" emissiveIntensity={3} toneMapped={false} />
      </mesh>
    </group>
  ) : (
    <group>
      <mesh scale={[1, 0.9, 0.8]}>
        <icosahedronGeometry args={[0.48, 1]} />
        <meshStandardMaterial color="#e89a3c" emissive="#e0600a" emissiveIntensity={glow * 0.6} flatShading toneMapped={false} />
      </mesh>
      {/* A tall dark slit pupil, so it reads as an eye and not a plate. */}
      <mesh position={[0, 0, 0.36]} scale={[0.55, 1.6, 0.6]}>
        <icosahedronGeometry args={[0.2, 0]} />
        <meshStandardMaterial color="#1a0a04" flatShading roughness={1} />
      </mesh>
    </group>
  );
}

/** A knobbed tree trunk, gripped at its thin end at the origin and pointing along +y. */
export function Club() {
  return (
    <group>
      <mesh position={[0, 0.9, 0]} castShadow>
        <cylinderGeometry args={[0.32, 0.1, 2.0, 7]} />
        <meshStandardMaterial color="#8f5d2e" flatShading roughness={1} />
      </mesh>
      <mesh position={[0, 1.95, 0]} castShadow>
        <icosahedronGeometry args={[0.38, 0]} />
        <meshStandardMaterial color="#6e4524" flatShading roughness={1} />
      </mesh>
    </group>
  );
}
