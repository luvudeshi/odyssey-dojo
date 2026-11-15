// The chooser: five large cards, each with its character on the real body. The card under the pointer (or, with no
// pointer on a card, the chosen one) turns slowly so the back shows too; the other four are drawn once and left still.
// Arrow keys move the choice, Enter or Space confirms it. With "reduce motion" set nothing turns.
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { KeyboardEvent } from "react";
import type { Group } from "three";
import { CharacterFigure } from "./CharacterFigure";
import { CHARACTERS, characterById } from "./characters";
import type { Character, CharacterId } from "./characters";
import "./characterPicker.css";

export interface CharacterPickerProps {
  readonly value: CharacterId;
  /** The choice moved (a click or an arrow key). Store it with saveCharacter if it should be remembered. */
  readonly onChange: (id: CharacterId) => void;
  /** The player confirmed the choice. */
  readonly onDone: (id: CharacterId) => void;
}

/** The idle is a guard stance turned toward the enemy; this turn shows his face, his chest and the gear on his back. */
const REST_TURN = 1.0;
/** One full turn in about nine seconds. */
const TURN_SPEED = 0.7;
/** A still card needs a few frames after the model arrives: the clip pose, then the gear sized to the bones. */
const SETTLE_FRAMES = 6;

const REDUCE = "(prefers-reduced-motion: reduce)";

function subscribeReduce(listener: () => void): () => void {
  const query = window.matchMedia(REDUCE);
  query.addEventListener("change", listener);
  return () => { query.removeEventListener("change", listener); };
}

function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduce, () => window.matchMedia(REDUCE).matches, () => false);
}

function Turntable({ id, turning }: { id: CharacterId; turning: boolean }) {
  const group = useRef<Group>(null);
  const invalidate = useThree((state) => state.invalidate);
  const settle = useRef(SETTLE_FRAMES);
  useEffect(() => {
    settle.current = SETTLE_FRAMES;
    invalidate();
  }, [turning, invalidate]);
  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    if (turning) {
      g.rotation.y += Math.min(delta, 0.05) * TURN_SPEED;
      return;
    }
    g.rotation.y = REST_TURN;
    if (settle.current > 0) {
      settle.current -= 1;
      invalidate();
    }
  });
  return (
    <group ref={group} rotation={[0, REST_TURN, 0]}>
      <CharacterFigure id={id} />
    </group>
  );
}

function Preview({ id, turning }: { id: CharacterId; turning: boolean }) {
  return (
    <Canvas
      className="character-preview"
      frameloop={turning ? "always" : "demand"}
      dpr={[1, 1.5]}
      camera={{ position: [0, 1.25, 4.6], fov: 27 }}
      onCreated={({ camera }) => { camera.lookAt(0, 1.0, 0); }}
      aria-hidden
    >
      <hemisphereLight args={["#fff4e0", "#5a4a3c", 1.5]} />
      <directionalLight position={[2.5, 4, 3]} intensity={2.6} />
      <directionalLight position={[-3, 2, -2.5]} intensity={1.4} />
      <Suspense fallback={null}>
        <Turntable id={id} turning={turning} />
      </Suspense>
    </Canvas>
  );
}

function Card({ character, chosen, turning, onPick, onHover }: {
  character: Character;
  chosen: boolean;
  turning: boolean;
  onPick: () => void;
  onHover: (over: boolean) => void;
}) {
  const { palette } = character;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={chosen}
      tabIndex={chosen ? 0 : -1}
      className={chosen ? "character-card chosen" : "character-card"}
      data-character={character.id}
      onClick={onPick}
      onPointerEnter={() => { onHover(true); }}
      onPointerLeave={() => { onHover(false); }}
    >
      <Preview id={character.id} turning={turning} />
      <span className="character-swatch" aria-hidden>
        {[palette.metal, palette.cloth, palette.accent].map((color, i) => <i key={i} style={{ background: color }} />)}
      </span>
      <span className="character-name">{character.name}</span>
      <span className="character-line">{character.line}</span>
    </button>
  );
}

const STEP: Readonly<Record<string, number>> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

export function CharacterPicker({ value, onChange, onDone }: CharacterPickerProps) {
  const [hovered, setHovered] = useState<CharacterId | null>(null);
  const still = useReducedMotion();
  const list = useRef<HTMLDivElement>(null);
  const chosen = characterById(value);
  const index = CHARACTERS.findIndex((c) => c.id === chosen.id);

  // On a narrow screen the cards scroll sideways: keep the chosen one in the middle. Only the row moves, never the page.
  useEffect(() => {
    const row = list.current;
    const card = row?.querySelector<HTMLElement>(`[data-character="${chosen.id}"]`);
    if (row && card && row.scrollWidth > row.clientWidth) row.scrollLeft = card.offsetLeft - row.offsetLeft - (row.clientWidth - card.clientWidth) / 2;
  }, [chosen.id]);

  const move = (to: number): void => {
    const next = CHARACTERS[(to + CHARACTERS.length) % CHARACTERS.length];
    if (!next) return;
    onChange(next.id);
    list.current?.querySelector<HTMLElement>(`[data-character="${next.id}"]`)?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = STEP[event.key];
    if (step !== undefined) move(index + step);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(CHARACTERS.length - 1);
    else if (event.key === "Enter" || event.key === " ") onDone(chosen.id);
    else return;
    event.preventDefault();
  };

  return (
    <section className="character-picker" aria-labelledby="character-picker-title">
      <h2 id="character-picker-title">Choose your character</h2>
      <p className="character-hint">The look only: any character can fight in any style.</p>
      <div ref={list} className="character-cards" role="radiogroup" aria-labelledby="character-picker-title" onKeyDown={onKeyDown}>
        {CHARACTERS.map((character) => (
          <Card
            key={character.id}
            character={character}
            chosen={character.id === chosen.id}
            turning={!still && character.id === (hovered ?? chosen.id)}
            onPick={() => { onChange(character.id); }}
            onHover={(over) => { setHovered((now) => (over ? character.id : now === character.id ? null : now)); }}
          />
        ))}
      </div>
      <button type="button" className="character-done" onClick={() => { onDone(chosen.id); }}>
        Fight as {chosen.name}
      </button>
    </section>
  );
}
