// Which bone each piece of a character's gear hangs on, in exactly the shape of the spartan's SPARTAN_ANCHORS
// (bone name to nodes), so Hero can take `anchorsFor(id)` in its place.
// Every character keeps the gear the fight needs: the stake appearing in the right hand for the stake finisher
// (src/render/hero/gearRule.ts). Character pieces never
// go in a hand.
import { Fragment } from "react";
import type { ReactNode } from "react";
import { SPARTAN_ANCHORS } from "../render/hero/gear/anchors";
import { HandGear, World } from "../render/hero/gear/carriedGear";
import { Frame } from "../render/hero/gear/spartanGear";
import { CHARACTERS, DEFAULT_CHARACTER, characterById } from "./characters";
import type { Character, CharacterId } from "./characters";
import { GEAR, GEAR_BONES } from "./gear/registry";

export type Anchors = Readonly<Record<string, ReactNode>>;

function build(character: Character): Anchors {
  const anchors: Record<string, ReactNode> = {};
  for (const bone of GEAR_BONES) {
    const pieces = character.gear.filter((id) => GEAR[id].bones.includes(bone));
    if (pieces.length === 0 && bone !== "spine_03") continue;
    anchors[bone] = (
      <Frame bone={bone}>
        {pieces.map((id) => <Fragment key={id}>{GEAR[id].render(character.palette)}</Fragment>)}
      </Frame>
    );
  }
  anchors.hand_r = <World><HandGear /></World>;
  return anchors;
}

// Built once, so the same nodes are handed to the model on every render.
const ANCHORS: Readonly<Record<CharacterId, Anchors>> = Object.fromEntries(
  // Odysseus is today's hero: he takes the spartan's own map, so a change to it changes him too.
  CHARACTERS.map((c) => [c.id, c.id === DEFAULT_CHARACTER ? SPARTAN_ANCHORS : build(c)]),
) as Record<CharacterId, Anchors>;

/** The gear for that character, by bone. An unknown id gives the default character's. */
export function anchorsFor(id: string | null | undefined): Anchors {
  return ANCHORS[characterById(id).id];
}
