# Characters

A player picks one of five characters. A character is a **look**: gear and colours. A fighting style (`src/styles`) is a **move set**. They are separate choices: any character fights in any style.

All five are the same rigged body, `public/models/hero/spartan.glb`, with gear built in code and hung on its bones, the way the spartan's helmet and cape already are. No model or image was added, and all five share spartan.glb, so no new CREDITS.md row.

Code is in `src/characters/`. The game does not use it yet: the picker is not mounted and the hero is still the spartan. The mount is four small changes in the lead's files, built and run locally but not committed (see NEEDS at the end).

## The five

| | Who (the line on the card) | Colours | Head | Body | On the back | From behind you see |
|---|---|---|---|---|---|---|
| **Odysseus** (default) | King of Ithaca, ten years sailing home from Troy. | bronze, crimson | Corinthian helmet, low crimson crest | bronze cuirass, crimson chiton, greaves | long crimson cape, bronze shield | a bronze disc on a long red cape |
| **Poseidon** | Earth-shaker, lord of the grey sea, with his trident. | teal, sea blue, bright cyan | sea-foam hair and short beard, a crown with three tall prongs | fish-scale cuirass in rows of two teals, blue kilt | a trident, prongs above his right shoulder | the trident standing over his head, banded teal back, no cape |
| **Zeus** | Lord of the sky, who delights in the thunderbolt. | white, gold | white hair, long white beard, gold laurel wreath | white tunic with a gold belt, long white kilt with a gold hem | a white himation with a gold thunderbolt across it | all white with a gold zig-zag |
| **Athena** | Grey-eyed goddess of war and craft, the hero's guide. | silver grey, olive, gold | silver helmet, a tall olive crest on a stalk with a tail down the back | silver cuirass, the aegis (olive mantle, gold hem, gorgon disc on the chest), long olive kilt, silver greaves | a silver shield with an olive owl with gold eyes | a silver disc with the owl, olive below, a tall thin crest |
| **Achilles** | Best of the Greeks at Troy, swift-footed and proud. | black, polished bronze, red | bright bronze helmet, a tall thick black horsehair crest with a tail | black cuirass with bronze shoulders and belt, red kilt, bronze greaves, a sword on the left hip | a short red cloak, a black shield with a bronze rim | a black disc on a short red cloak, a tall black crest |

Zeus, Poseidon and Athena are named as the god scan names them (`src/ai/gods/gods.ts`), and Zeus and Poseidon carry that god's accent colour. Picking a character does not pick a god: the scan still decides the god and the power. The other way round it does: the god the scan names picks the character (next section).

## The god scan picks the character

The scan can name six gods (`GOD_IDS` in `src/ai/gods/gods.ts`), from the server or from the offline scan. `characterForGod(godId)` in `godCharacter.ts` gives each one a character:

| God | Character | Why |
|---|---|---|
| Zeus | Zeus | He is one of the five. |
| Poseidon | Poseidon | He is one of the five. |
| Athena | Athena | She is one of the five. |
| Hermes | Odysseus | The god of wit and travellers, who hands Odysseus the herb moly on Circe's island. |
| Apollo | Odysseus | The archer god: Odysseus strings the great bow on Apollo's feast day and prays to him for the shot. |
| Artemis | Achilles | The swift huntress who never yields, for the swift-footed fighter who never does either. |

No god (a skipped scan, keyboard play) or an id that is not a god gives Odysseus, the default. All five characters can be reached.

`characterLineForGod(godId)` is the line for the reveal: "Zeus chose you. You fight as Zeus.", "Hermes chose you. You fight as Odysseus."

**A pick by hand wins.** `odyssey-dojo.character.source` in localStorage holds `hand` once the player has chosen a character in the picker that is not the one already stored. From then on a scan does not change the character, in this session or a later one, and the reveal line says "Zeus chose you. You still fight as Achilles, your own pick." Confirming the character the scan gave is not a pick by hand, so the next scan may choose again. There is no button yet to hand the choice back to the scan.

- `characterFromScan(godId)`: call when the scan ends. Stores and returns the god's character, or returns the hand-picked one unchanged. No god changes nothing.
- `confirmCharacter(id)`: the picker's "Fight as ..." button. Stores the id; marks it as picked by hand only if it differs from the stored one.
- `pickCharacter(id)`: stores the id and always marks it as picked by hand.
- `handPicked()`: the hand-picked character, or null.

Triangles of code-built gear, counted on the demo page (every mesh on the figure that is not the skinned body; each count includes the 114 triangles of style gear every character keeps: the Hoplite's slung spear and the spear and stake that appear in the right hand):

| Odysseus | Poseidon | Zeus | Athena | Achilles |
|---|---|---|---|---|
| 562 | 624 | 496 | 792 | 618 |

Odysseus is today's hero, unchanged, so the other four cost between 66 fewer and 230 more triangles than the fight draws now.

## Files

- `characters.ts`: the five as plain data (id, name, line, palette, gear list), `characterById`, `DEFAULT_CHARACTER`, and the stored choice: `loadCharacter()` and `saveCharacter(id)` keep the id in localStorage under `odyssey-dojo.character`. No storage, a storage that throws, or an id we do not know all give Odysseus.
- `gear/`: the pieces. `headGear.tsx` (crested helmet, hair, beard in two lengths, three-pronged crown, laurel wreath), `bodyGear.tsx` (cuirass, scale cuirass, tunic, aegis, cloak, himation, kilt, greave, hip sword), `backGear.tsx` (trident, thunderbolt, round shield, owl shield), `materials.tsx`, and `registry.tsx`, which names every piece, the bone it hangs on and how to draw it in a palette.
- `anchors.tsx`: `anchorsFor(id)` gives the map from bone name to nodes, in the shape of the spartan's `SPARTAN_ANCHORS`. For Odysseus it is `SPARTAN_ANCHORS` itself.
- `CharacterFigure.tsx`: one character in idle on the real body (the spartan's file, height and skin through `RiggedModel`).
- `CharacterPicker.tsx`, `characterPicker.css`: the chooser. Props `{ value, onChange, onDone }`.
- `godCharacter.ts`: the god scan's character (previous section). No three.js, no React.
- `tools/characters/`: the demo page.
- `tests/characters.test.ts`, `tests/characterForGod.test.ts`.

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

- Seen on the demo page in idle, and with the local mount in a keyboard fight against Polyphemus: Zeus and Poseidon in the guard stance, a few seconds each (`docs/screenshots/god-character-zeus-fight.png`, `god-character-poseidon-fight.png`). Athena and Achilles were not seen in a fight. None was seen with a tracked body, during strikes, ducks, the finisher or the defeat clip.
- Gear is rigid and follows one bone. In the crouched guard the midriff shows below a cuirass, a kilt hangs behind the thighs, and a cloak stands off the back, exactly as the spartan's cuirass, chiton and cape do today.
- In the Hoplite style the slung spear sits about 13 cm behind Poseidon's trident and Zeus's thunderbolt. Not looked at.
- The body is the same male mannequin for all five, Athena included, with the same skin.
- The picker's page title and button use the page's own styles. It was looked at on the current theme and on a plain dark ground, not on the pebble theme itself.

## NEEDS (for the lead)

The game shows none of this until four of the lead's files change. The change was built locally, run in the dev server and then taken out again, so it is not in this branch. It is 28 added and 5 removed lines; the exact diff is posted on issue #179.

1. `src/render/hero/Hero.tsx`: `Hero` wears the stored character. `useMemo(() => ({ ...spartan, anchors: anchorsFor(loadCharacter()) }), [])` in place of `spartan`. It is read once per fight; the choice is made on a menu screen before the fight mounts.
2. `src/App.tsx`: when the scan ends, `setCharacter(characterFromScan(found?.god))`. Then a new step on the style screen, after the scan and before the styles: `<CharacterPicker>` inside `<main className="menu">`, with the scan's character already chosen, `onChange={setCharacter}` and `onDone` calling `confirmCharacter(id)`. Keyboard players get no scan, so they land on the picker with the stored character (Odysseus the first time).
3. `src/screens/StyleSelect.tsx`: an optional `onCharacter` prop and a "Change character" button under the style cards, which opens the picker again.
4. `src/ai/ui/RevealScreen.tsx`: one line under the power, `<p className="reveal-character">{characterLineForGod(reveal.god, handPicked())}</p>`.

What was seen with it, in headless Chrome at 1440x810 (`docs/screenshots/god-character-picker.png` and the two fight pictures):

- Keyboard play: Story mode opens the picker with Odysseus chosen. Clicking Zeus and "Fight as Zeus" stores `zeus` and `hand`, the style screen shows "Change character", which goes back to the picker with Zeus still chosen, and the Polyphemus fight draws Zeus.
- Camera play with Chrome's fake camera and "Cast the lot instead (no picture)", which is the offline scan: the reveal said "Poseidon chose you. You fight as Poseidon.", the picker opened with Poseidon chosen, and the fight drew Poseidon. Two other runs gave Apollo and Hermes, and both opened the picker on Odysseus.
- No console errors in any run.

Not checked: a real camera and a real body, the server's (Gemini) answer, the reveal line after a pick by hand in the running game (tests only), rooms (host, guest), the dojo, a phone-sized window, and the pebble theme's look for the picker step.
