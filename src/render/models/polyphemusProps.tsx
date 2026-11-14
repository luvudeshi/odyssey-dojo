// Parts shared by the Polyphemus candidates, built in code in the stylized low-poly look: the eye, the stake and the club. Sizes are metres.

export function Eye({ blinded, glow }: { blinded: boolean; glow: number }) {
  return blinded ? (
    <group>
      <mesh scale={[1, 0.35, 0.6]}>
        <sphereGeometry args={[0.3, 8, 6]} />
        <meshStandardMaterial color="#3a1410" flatShading roughness={1} />
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
        <meshStandardMaterial color="#ffd98a" emissive="#ff8c00" emissiveIntensity={glow} flatShading toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, 0.34]}>
        <icosahedronGeometry args={[0.16, 0]} />
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
