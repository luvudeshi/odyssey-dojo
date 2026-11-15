# Characters

A player picks one of five characters. A character is a **look**: gear and colours. A fighting style (`src/styles`) is a **move set**. They are separate choices: any character fights in any style.

All five are the same rigged body, `public/models/hero/spartan.glb`, with gear built in code and hung on its bones, the way the spartan's helmet and cape already are. No model or image was added, and all five share spartan.glb, so no new CREDITS.md row.

Code is in `src/characters/`. Nothing in the game uses it, and the picker is not mounted: that waits on toyeshhm's answer (see NEEDS at the end).

## The five

| | Who (the line on the card) | Colours | Head | Body | On the back | From behind you see |
|---|---|---|---|---|---|---|
| **Odysseus** (default) | King of Ithaca, ten years sailing home from Troy. | bronze, crimson | Corinthian helmet, low crimson crest | bronze cuirass, crimson chiton, greaves | long crimson cape, bronze shield | a bronze disc on a long red cape |
| **Poseidon** | Earth-shaker, lord of the grey sea, with his trident. | teal, sea blue, bright cyan | sea-foam hair and short beard, a crown with three tall prongs | fish-scale cuirass in rows of two teals, blue kilt | a trident, prongs above his right shoulder | the trident standing over his head, banded teal back, no cape |
| **Zeus** | Lord of the sky, who delights in the thunderbolt. | white, gold | white hair, long white beard, gold laurel wreath | white tunic with a gold belt, long white kilt with a gold hem | a white himation with a gold thunderbolt across it | all white with a gold zig-zag |
| **Athena** | Grey-eyed goddess of war and craft, the hero's guide. | silver grey, olive, gold | silver helmet, a tall olive crest on a stalk with a tail down the back | silver cuirass, the aegis (olive mantle, gold hem, gorgon disc on the chest), long olive kilt, silver greaves | a silver shield with an olive owl with gold eyes | a silver disc with the owl, olive below, a tall thin crest |
| **Achilles** | Best of the Greeks at Troy, swift-footed and proud. | black, polished bronze, red | bright bronze helmet, a tall thick black horsehair crest with a tail | black cuirass with bronze shoulders and belt, red kilt, bronze greaves, a sword on the left hip | a short red cloak, a black shield with a bronze rim | a black disc on a short red cloak, a tall black crest |

Zeus, Poseidon and Athena are named as the god scan names them (`src/ai/gods/gods.ts`), and Zeus and Poseidon carry that god's accent colour. Picking a character does not pick a god: the scan still decides the god and the power.

Triangles of code-built gear, counted on the demo page (every mesh on the figure that is not the skinned body; each count includes the 114 triangles of style gear every character keeps: the Hoplite's slung spear and the spear and stake that appear in the right hand):

| Odysseus | Poseidon | Zeus | Athena | Achilles |
|---|---|---|---|---|
| 562 | 624 | 496 | 792 | 618 |

Odysseus is today's hero, unchanged, so the other four cost between 66 fewer and 230 more triangles than the fight draws now.

## Files

- `characters.ts`: the five as plain data (id, name, line, palette, gear list), `characterById`, `DEFAULT_CHARACTER`, and the stored choice: `loadCharacter()` and `saveCharacter(id)` keep the id in localStorage under `odyssey-fighter.character`. No storage, a storage that throws, or an id we do not know all give Odysseus.
- `gear/`: the pieces. `headGear.tsx` (crested helmet, hair, beard in two lengths, three-pronged crown, laurel wreath), `bodyGear.tsx` (cuirass, scale cuirass, tunic, aegis, cloak, himation, kilt, greave, hip sword), `backGear.tsx` (trident, thunderbolt, round shield, owl shield), `materials.tsx`, and `registry.tsx`, which names every piece, the bone it hangs on and how to draw it in a palette.
- `anchors.tsx`: `anchorsFor(id)` gives the map from bone name to nodes, in the shape of the spartan's `SPARTAN_ANCHORS`. For Odysseus it is `SPARTAN_ANCHORS` itself.
- `CharacterFigure.tsx`: one character in idle on the real body (the spartan's file, height and skin through `RiggedModel`).
- `CharacterPicker.tsx`, `characterPicker.css`: the chooser. Props `{ value, onChange, onDone }`.
- `tools/characters/`: the demo page.
- `tests/characters.test.ts`.

## Rules the gear follows

- **Nothing in the hands.** The fists punch and block, and the right hand is where the style's spear or stake appears for the move that uses it (`src/render/hero/gearRule.ts`). The trident, the thunderbolt and the shields ride on the back; the sword is on the hip. Every character keeps the spartan's `hand_r` node and the slung spear, so style gear works the same for all five.
- **Long things lean over the right shoulder**, because the Hoplite's slung spear leans over the left.
- Pieces hang on the five bones `Frame` knows a rest frame for (`Head`, `spine_03`, `pelvis`, `calf_l`, `calf_r`), are sized in metres, flat-shaded, and made of a few primitives each.
- Torso pieces sit 4 cm forward of the spine bone and are deeper than the spartan's cuirass, so they cover the chest and not only the back.

## See it

`npm run dev`, then open `/tools/characters/index.html`. The picker is on top; below it the chosen character stands in idle on the rigged body, with buttons for front, behind and fight (the angle the fight camera sees him from), drag to turn, and the gear triangle count. `?c=zeus` picks a character, `?view=behind` or `?view=fight` sets the first view, `?dark` puts the page on a dark ground. The page is served by the dev server only, like the pose recorder: it is not in the production build, and needs no vite config change.

The picker draws five small canvases. Only the card under the pointer (or the chosen one) animates and turns; the other four are drawn once and then left alone. On the development laptop's integrated graphics the whole demo page (five cards and the large stage) held 60 frames a second. With "reduce motion" set, nothing turns. Arrow keys move the choice, Home and End jump, Enter or Space confirms. On a narrow screen the cards scroll sideways.

## Add a character

1. In `characters.ts`: add the id to `CharacterId` and an entry to `CHARACTERS` with a name, a line of at most 70 characters, a palette and a gear list.
2. If it needs a new piece: add its name to `GearId`, build it in `gear/` as a small component that takes colours as props, and add it to `GEAR` in `gear/registry.tsx` with its bone.
3. Run `npx vitest run tests/characters.test.ts`, then open the demo page and look at it from behind: it must be told apart from the others at a glance, and stay under about 1,500 triangles.

## Known limits

- Seen only on the demo page, in idle. Not seen in a fight, not with a tracked body, not during strikes, ducks or the defeat clip.
- Gear is rigid and follows one bone. In the crouched guard the midriff shows below a cuirass, a kilt hangs behind the thighs, and a cloak stands off the back, exactly as the spartan's cuirass, chiton and cape do today.
- In the Hoplite style the slung spear sits about 13 cm behind Poseidon's trident and Zeus's thunderbolt. Not looked at.
- The body is the same male mannequin for all five, Athena included, with the same skin.
- The picker's page title and button use the page's own styles. It was looked at on the current theme and on a plain dark ground, not on the pebble theme itself.

## NEEDS (for the lead)

**Mounting waits on toyeshhm's answer.** Whether the game gets five characters at all is a look and scope choice the lead is putting to toyeshhm (#33). Until he says yes, nothing below should be done: the picker stays an unmounted piece and the hero stays the spartan.

If the answer is yes, it is two changes, both in the lead's files. Neither has been run.

**1. The hero wears the chosen character.** `src/render/hero/Hero.tsx`, lines 163 to 165. Replace

```tsx
export function Hero({ poseRef }: { poseRef: RefObject<PoseFrame | null> }) {
  return <GhostedHero candidate={spartan} poseRef={poseRef} />;
}
```

with

```tsx
export function Hero({ poseRef }: { poseRef: RefObject<PoseFrame | null> }) {
  // Read once per fight: the choice is made on a menu screen, before the fight mounts.
  const candidate = useMemo(() => ({ ...spartan, anchors: anchorsFor(loadCharacter()) }), []);
  return <GhostedHero candidate={candidate} poseRef={poseRef} />;
}
```

and add two imports beside line 15 (`useMemo` is already imported on line 5):

```tsx
import { anchorsFor } from "../../characters/anchors";
import { loadCharacter } from "../../characters/characters";
```

`src/render/hero/defs/spartan.tsx` line 29 (`anchors: SPARTAN_ANCHORS,`) stays as it is: it is the fallback, and it is what Odysseus wears.

**2. The picker comes before the style picker.** `src/App.tsx`. Add state beside line 49 (`const [scanned, setScanned] = useState(false);`):

```tsx
const [character, setCharacter] = useState<CharacterId>(loadCharacter);
const [characterPicked, setCharacterPicked] = useState(false);
```

and a new branch between the god scan (line 134) and `if (flow.screen === "style") {` (line 136):

```tsx
if (flow.screen === "style" && !characterPicked) {
  return (
    <main className="menu">
      <CharacterPicker
        value={character}
        onChange={(id) => { setCharacter(saveCharacter(id)); }}
        onDone={(id) => { setCharacter(saveCharacter(id)); setCharacterPicked(true); }}
      />
    </main>
  );
}
```

with the imports

```tsx
import { CharacterPicker } from "./characters/CharacterPicker";
import { loadCharacter, saveCharacter } from "./characters/characters";
import type { CharacterId } from "./characters/characters";
```

The picker fills its parent up to 78rem wide and brings its own heading ("Choose your character"), so the `.menu` wrapper needs no `<h1>`.
