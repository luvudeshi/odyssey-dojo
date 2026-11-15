<!-- Devpost form fields: paste these into the separate fields on the submission form, not into the story. -->

**Project name:** Odyssey Dojo

**Tagline:** Learn the basics of self-defense with your own body, one monster at a time. A webcam coaches you through the Odyssey, alone or with a friend.

**Built with:** typescript, react, vite, three.js, react-three-fiber, mediapipe, elevenlabs, google-gemini, express, node.js, zod, vitest

**Links:** Demo `[confirm: live demo URL]` · Video `[confirm: demo video URL]` · Repo `[confirm: repo URL, github.com/toyeshhm/odyssey-dojo is private today]`

**Team:** toyeshhm, luvudeshi, tagrawal029, gatik-g

<!-- Images: Devpost cannot reach a private repo. In the story editor, use the image button to upload each file from the images/ folder next to this file, and put it where the matching line is below. The section titles are images too, as on the Dance Fantasy page; devpost-no-images.md keeps them as text. -->
<!-- The statistic: we could not find a source for "less than 1% of adults can defend themselves". The 2 in 100 figure below is real: 6.61 million Americans practiced a martial art in 2023 (Sports & Fitness Industry Association, 2024 report, as cited by Gymdesk). -->

---

![Odyssey Dojo main menu](docs/devpost/images/menu.jpg)

A giant reaches for you. A card on the screen says BLOCK, and under it: "Hands high protects your head while you look for a way out." You bring both fists up to your cheeks. The webcam sees it, and the hand misses.

That is one of 26 moves **Odyssey Dojo** teaches. It is a browser game that trains self-defense basics with your own body as the controller. You can train alone or with a friend, and the road you train on is the Odyssey.

![Inspiration](docs/devpost/images/h-inspiration.png)

About 2 in 100 Americans practice a martial art: 6.61 million people in 2023, by the Sports & Fitness Industry Association's count.

![About 2 in 100 Americans practice a martial art (SFIA, 2023). 26 moves, each with a real-world lesson. 1 webcam is all you need to train.](docs/devpost/images/stats.png)

A class takes money, a schedule and the nerve to walk in. A laptop already has a camera.

A dance game teaches by showing you a figure and scoring your copy of it. We wanted the same thing for a guard, a duck and a jab: stand up, copy the figure, and hear at once what to fix.

The Odyssey gave us the story for it. Odysseus does not get home by being the strongest. He gets past the Cyclops, the Sirens and Scylla by knowing what each one will do and having one answer ready. Athena stands beside him and tells him what to do. That is self-defense, and that is a coach.

![What it does](docs/devpost/images/h-what-it-does.png)

### Every attack is a real situation

![A defend prompt: Polyphemus swings his club, and the card says dodge right, a wide swing from the side](docs/devpost/images/defend-card.jpg)

Each monster attack stands for something a person might really face, and the card says so in plain words.

- Polyphemus swings his club: "A wide swing from the side." You step off the line.
- He reaches for you: "Someone grabs for you." Hands up.
- He throws a boulder: "Something thrown at your head." You duck, bending your knees and not your waist.

A 3D mannequin on the card acts out the answer before you try it. Athena calls it out loud.

### Every move teaches one thing

![A strike prompt: CROSS, power hand: right fist out](docs/devpost/images/strike-card.jpg)

All 26 moves carry one line on what the move is for outside the game. A few of them:

- **Jab:** a fast hand straight out in front holds someone at arm's length so they cannot crowd you.
- **Dodge:** moving sideways, not straight back, takes you out of an attack's path so you can get away.
- **Double palm:** a firm push with both open hands opens a gap, and a gap is your chance to leave.
- **Duck:** bend your knees, not your waist, to drop under a swing and still see what is coming.

We wrote each line ourselves and checked it against a source: the England Boxing coaching handbook, a self-defense sheet from the Asian American Federation and the Center for Anti-Violence Education, safety guides from three police departments, and karate and Wing Chun schools. Ten sources in all, listed in the repo.

The lines are about protecting yourself and getting away. None of them is about hurting anyone.

### The Training Dojo

![How the Training Dojo grades a jab: four measured parts, three grades, one tip](docs/devpost/images/dojo-grading.png)

<!-- [confirm: take a screenshot of the Training Dojo with a grade and a tip on screen, and add it here] -->

The Dojo is practice with no monster. An outline figure does one move on a loop and you copy it.

- **Three tries per move.** A fighting style is 6 to 8 moves and takes about two minutes.
- **A grade on every try.** Excellent is 150 points, Good is 100, Needs improvement is 25.
- **One tip, never a list.** The game measures the parts of the move and names the weakest one. For a duck: "Bend your knees, not your waist, and keep your eyes up on what is coming."
- **It is kind on purpose.** Any move that counts is at least Good. A near miss counts.
- **It tells you what to work on.** The end screen names your best move and up to three to practise.
- **Then the fights change.** A beginner gets 25% more warning before every attack. A good player gets 15% less. The defenses you missed come up more often.

### Alone or with a friend

![The quest map: six stops from Troy to Ithaca](docs/devpost/images/quest-map.jpg)

<!-- [confirm: take a screenshot of the Multiplayer screen with the room code and QR code, and add it here] -->

- **Alone:** Story mode is six stops in Homer's order: Polyphemus, Circe, the Sirens, Scylla, Charybdis and the Suitors. All six are open from the start, and each has its own monster, arena and attacks to read.
- **With a friend:** the Multiplayer screen on the main menu hosts a room, and a friend joins with a four-letter code or a QR code, from a laptop or a phone. A guest who reloads gets the same seat back. You fight one monster together. Throw the same strike at the same moment and it does double damage.
- **Five fighting styles:** Boxer, Hoplite, Karate, Kung Fu and Pankration, each with its own strikes.
- **No camera needed:** every move has a key, so anyone can play.

![A strike lands: the hero leaps to Polyphemus's eye and the game rates the hit GOOD](docs/devpost/images/leap-strike.jpg)

When a strike counts, your hero leaps to the weak spot, so a good jab looks like one. After a fight, the end screen lists the moves you practised and what each one is for.

![The Account page: hero name, achievements and settings](docs/devpost/images/account.jpg)

### What it is not

Odyssey Dojo is practice for two things: reacting in time and keeping your distance. It does not replace a class with an instructor and a partner. In a real situation the first choice is to leave.

![How we built it](docs/devpost/images/h-how-we-built-it.png)

![The pipeline: See, Read, Coach, Fight](docs/devpost/images/pipeline.png)

1. **See:** MediaPipe's PoseLandmarker finds 33 points on your body in the browser. The model ships with the game, so tracking needs no network.
2. **Read:** each of the 26 moves has its own detector. It measures angles and distances against your own shoulders and torso, so it holds for any body size, any camera distance and a turn of 30 degrees.
3. **Coach:** the Dojo uses the same measurements. A jab is checked for reach (elbow straight at 145 degrees), height, aim and speed (bent arm to straight within 200 ms). The weakest part becomes the tip.
4. **Fight:** the combat engine is plain TypeScript with no browser in it. It runs the phases, the combo, the divine power meter and the finishing move.
5. **Draw:** three.js through React Three Fiber renders the arenas, the monsters and your hero.
6. **Speak:** every voice line and sound effect is a clip made ahead of time, and the music ships with the game, so sound works offline.

![Architecture: everything runs in your browser. ElevenLabs clips ship with the game. A Node.js and Express server, used only when online, runs rooms and asks Google Gemini for the god scan.](docs/devpost/images/architecture.png)

The keyboard and the camera feed the same input every frame, so a fight is identical either way. Because the rules do not touch the browser, we test a whole fight, start to finish, as plain code.

The teaching is tested too. One test fails if a move has no real-world line. Another fails if a monster attack has no situation.

![Tech stack](docs/devpost/images/h-tech-stack.png)

| CATEGORY | TECHNOLOGIES |
|---|---|
| Frontend | React 19, TypeScript (strict), Vite |
| 3D | three.js, React Three Fiber, drei, postprocessing |
| Pose tracking | MediaPipe Tasks Vision (PoseLandmarker, runs in the browser) |
| Server | Node.js, Express, Zod (optional: the god scan, rooms, FaceTime and accounts) |
| AI | Google Gemini (god scan), ElevenLabs (voice, sound effects, stings) |
| Tests | Vitest, headless browser runs |
| Database | Tiger Data (Postgres) for accounts, off unless the server is given a database address |
| Art | Poly Haven (CC0 skies and textures), Quaternius (CC0 models), shapes built in code |

![Built with ElevenLabs: Athena coaches you out loud in every fight](docs/devpost/images/t-elevenlabs.png)

A coach has to talk. Athena, Homer and the monsters speak with ElevenLabs. We generated every clip ahead of time with our own account, so no network call happens in a fight.

- **Athena** calls every defense and every strike, praises a hit and warns after one. Her voice is Sarah, on model `eleven_v4`.
- **Homer** narrates before and after each stop. His voice is George.
- **Polyphemus** has his own taunts, in the voice of Callum, and the other monsters have theirs.
- **Sound effects and the win and loss stings** came from the same account.

We ran each clip through speech to text afterward. The check heard `call_knee` as "Me", so we generated that clip again. `[confirm: whether the team entered the ElevenLabs track]`

![Built with Google Gemini: the god scan names the Olympian you take after](docs/devpost/images/t-gemini.png)

Before the style menu, a webcam player gets a god scan. A snapshot goes to our Express server, which asks Gemini to name the Olympian they take after: Zeus, Poseidon, Athena, Hermes, Artemis or Apollo. The god comes with one power. Defends fill a power ring, so the game pays you for defending well. When the power goes off, the hero strikes a pose and the god's sound plays.

- **The key stays on the server.** The browser never sees it.
- **Every call has a time limit and a fallback.** With the server off, the scan measures your body in the browser and picks a god from that.
- **It can be skipped.** It ends by itself after 30 seconds. `[confirm: whether the team entered the Gemini track]`

![Challenges](docs/devpost/images/h-challenges.png)

- **Teaching without overclaiming.** A Siren's song and Circe's spell are not things a person meets on the street. We did not invent an assault to stand for them. Those attacks carry a general lesson, and our notes mark each one as that.
- **Training has to be kind.** A beginner who is marked down stops trying. So the Dojo counts a near miss, and a move that counts can never score below Good.
- **Bodies come in all sizes.** Detectors scale to your torso and tolerate a 30 degree turn. We tested them on made-up poses first. `[confirm: result of the first fight on a real body on the demo laptop, issues #7 and #17]`
- **Webcam play must survive a bad room.** Poor light or a failed camera cannot end the demo. Every move has a key, the keys stay live during a webcam fight, and a camera failure is shown on screen.
- **Strikes did not look like they landed.** The hit counted, but the hero stayed where he stood. Now he leaps so his fist, foot or blade meets the weak spot.
- **Three people and their coding agents in one repository.** Folder owners, one issue per task and a branch for every change kept merges small.

![Accomplishments](docs/devpost/images/h-accomplishments.png)

- 26 moves, each with a real-world line checked against a source.
- A Training Dojo that grades every try, gives one tip and changes the fights to fit you.
- A full game you can play with only your body, or only a keyboard.
- Rooms where two people fight one monster and strike together for double damage.
- Six stops, five styles and a finishing move that ends Polyphemus the way Book 9 does.
- Rules that run without a browser, so the whole fight is tested as code.

![What we learned](docs/devpost/images/h-learned.png)

- **One tip beats five.** A player can fix one thing on the next try.
- **The same detector can fight and teach.** We built the detectors for combat. Measuring their parts gave us the coach for free.
- **Agree the contracts first.** Shared types let several people build in parallel without rewriting each other's work.
- **A playtest beats a test suite** for finding what a player trips over.

![What's next](docs/devpost/images/h-next.png)

- Put the Dojo in front of a self-defense instructor and fix what they flag. `[confirm: the team agrees this is a next step]`
- Tune the detectors on more real bodies.
- Swap kicks the camera cannot see when a player is framed from the waist up.
- Show the character picker: Odysseus, Poseidon, Zeus, Athena and Achilles are built and not yet offered in a menu. The code that gives each god one of the five from the scan is built too, and no screen uses it yet.
- Turn on accounts and the Hall of heroes. The server routes, the Tiger Data code and the sign-in dialog are built, and the Account page does not show them yet.
- Try the FaceTime call on a real phone. A friend's iPhone can join a fight from the Multiplayer screen, and nobody has run it on a real call yet.
- Fights written from a sentence, with Gemini building the level. The server route exists and no menu opens it.

Play it at `[confirm: live demo URL]`. Open the Training Dojo first.

*Sources: martial arts participation from the Sports & Fitness Industry Association's 2024 report, as cited by [Gymdesk](https://gymdesk.com/blog/martial-arts-industry-statistics). The ten sources behind the move lines are in `docs/moves.md`.*

*Credits: skies and textures from [Poly Haven](https://polyhaven.com) (CC0). Hero and Polyphemus models by Quaternius (CC0). Voices, sound effects and stings generated with ElevenLabs. Music: "The Rise Of Heroes", "Passage Of Arms" and "The Fall Of Heroes" by Shane Ivers (https://www.silvermansound.com), CC BY 4.0. Pose tracking by Google MediaPipe (Apache License 2.0). The full list is in `CREDITS.md`.*
