# How each stop ends

Each stop of the quest ends the way the Odyssey ends it. Odysseus gets away from almost everything he meets: out of the cave, past the song, through the strait, clear of the whirlpool. Only once, in his own house, does he stand. That is also what self-defense is for: the aim is to get away and get home, not to beat someone.

The lines live in `src/enemies/endings.ts`, one per enemy id, read with `endingFor(enemyId)`. `tests/endings.test.ts` checks that every line below is the same as in the code. Nothing shows them in the game yet: the result screen is the lead's to hook up (issue #160).

- **kind** is `escape` when the win is getting away and `stand` when the win is holding your own ground.
- **win** and **loss** are at most 60 characters, **lesson** at most 90.

## The lines

| Enemy | Kind | Win | Loss | Lesson | Book |
| --- | --- | --- | --- | --- | --- |
| Polyphemus (`polyphemus`) | escape | You are out of the cave, and your men are out with you. | The cave holds you a while longer. Catch your breath. | Getting out is the win. You do not have to beat someone to be safe. | 9 |
| Circe (`circe`) | escape | The spell did not take you. She lets your men go. | The spell holds for now. Clear your head and try again. | A clear head is your best guard. Spot a trick early and you keep your choices. | 10 |
| The Sirens (`sirens`) | escape | You heard the song, and the ship sailed on past. | The song pulls you in this time. Steady yourself and retry. | Plan ahead and lean on friends. The help you set up early holds when it gets hard. | 12 |
| Scylla (`scylla`) | escape | You are past the strait. Six were lost; the ship is through. | The strait turns you back. Rest, then steer through again. | Some dangers cannot be beaten. Do not stop to fight: keep moving and get through. | 12 |
| Charybdis (`charybdis`) | escape | You held on to the fig tree and got clear of the whirlpool. | The whirlpool pulls you back. Hold on and try once more. | Hold on to something solid and wait for your moment. Staying calm gets you out. | 12 |
| The Suitors (`suitors`) | stand | You stood your ground. Your home is your own again. | The hall is not yours yet. Get up and try again. | Standing your ground is the last choice, for when you are home and cannot leave. | 22 |
| Any other id (`general`) | escape | You got away safe. The way home is open. | Not this time. Catch your breath and try again. | The aim is to get home safe, not to win a fight. | none |

The last row is the fallback `endingFor` returns for an id it does not know.

## What happens in the book

Told in our own words; no translation is quoted.

| Enemy | Book | What happens there |
| --- | --- | --- |
| Polyphemus | 9 | The Cyclops shuts Odysseus and his men in his cave; they blind him with a sharpened stake while he sleeps off the wine, and the ones still alive leave the cave clinging under his rams. |
| Circe | 10 | Circe turns part of the crew into pigs; Hermes gives Odysseus the herb moly, her spell fails on him, and he makes her turn his men back. |
| The Sirens | 12 | The crew row past with wax in their ears while Odysseus, tied to the mast, hears the song, and they untie him only once it is out of hearing. |
| Scylla | 12 | On Circe's advice Odysseus keeps to Scylla's side of the strait rather than risk the whole ship at Charybdis; Scylla takes six of his men and the ship gets through. |
| Charybdis | 12 | Later, alone on the wreck of his ship, Odysseus is carried back to Charybdis, hangs from a fig tree above the whirlpool until it throws his timbers back up, then drops onto them and paddles clear. |
| The Suitors | 22 | Back in his own hall, Odysseus, his son Telemachus and two loyal herdsmen fight the suitors who have been living off his house, and win. |

## Where the game departs from the story

- **Polyphemus.** In the game you fight the Cyclops until he is beaten. In the book nobody beats him in a fight: he is blinded by a trick while he sleeps, and he is alive and shouting from the shore when the ships leave. Not all the men get out either: he has already taken six of them. The win line says "your men are out with you" for the ones who were left.
- **Circe.** The game is a fight. In the book there is almost none: the herb does the work, Odysseus draws his sword once and she gives in. He also does not leave straight away: he and his crew stay with her for a year as guests. We call it an escape because the danger, the spell, is what he gets clear of.
- **The Sirens.** The game has you fight them. In the book nobody touches them: the whole plan is wax, rope and rowing. Odysseus does not resist the song either; he begs to be let loose and the rope and his crew hold him. The lesson line is about that: the help he set up beforehand is what works.
- **Scylla.** The game lets you hurt Scylla. In the book she cannot be fought at all: Circe tells Odysseus so, he arms himself anyway, and it changes nothing. The win line keeps the cost in: six men are lost.
- **Charybdis.** The game has you fight the whirlpool. Homer's Odysseus only survives it, and his ship passes it once with the crew (on Scylla's side) and once with him alone on the wreckage. The fig tree belongs to the second time.
- **The Suitors.** This is the one stand, and the line the game draws is narrower than the book's. In the book Odysseus plans the fight, has the doors shut so no suitor can leave, and spares none of the suitors, including one who asks for mercy; the book ends with the suitors' families coming for revenge and Athena making peace. The game keeps only the part that fits self-defense: he is in his own home, the people threatening his family will not leave, and he holds his ground. The lesson line says standing is the last choice, not the first.
- **Losing.** In the game a loss sends you back to try again. The book has no such thing; the loss lines are ours and are written to be kind.

## How the book references were checked

The book numbers and the plain facts above were checked on 14 November 2026 against Samuel Butler's prose translation of the Odyssey on Project Gutenberg (public domain), reading the headings of books 9, 10, 12 and 22 and the episodes under them:

- Butler, *The Odyssey*, Project Gutenberg ebook 1727. https://www.gutenberg.org/files/1727/1727-h/1727-h.htm
- Wikipedia, *Odyssey* (for the name of book 22, the killing of the suitors, and the outline of books 9 to 12). https://en.wikipedia.org/wiki/Odyssey

Butler uses the Roman names (Ulysses, Mercury, Minerva); this page uses the Greek ones. The check was made by reading that one translation through a web tool, not the Greek text, so small details may differ in other translations. Also confirmed in that reading: the year spent with Circe, her warning that Scylla cannot be fought, Odysseus asking to be let loose at the Sirens, the gates made fast before the fight in the hall, the suitor refused mercy (two of the household, the singer and the herald, are spared), and the families and the peace in book 24. One detail is from general knowledge and was not confirmed in that reading: that Odysseus draws his sword on Circe before she gives in.
