<!-- Devpost form fields: paste these into the separate fields on the submission form, not into the story. -->

**Project name:** Odyssey Dojo

**Tagline:** Learn the basics of self-defense with your own body, one monster at a time. A webcam coaches you through the Odyssey, alone or with a friend.

**Built with:** typescript, react, vite, three.js, react-three-fiber, mediapipe, elevenlabs, livekit, express, node.js, zod, postgresql, tiger-data, vultr, vercel, docker, vitest `[confirm: add google-gemini only if the Gemini section below stays]`

**Links:** Demo https://odysseydojo.club · Video `[confirm: demo video URL]` · Repo `[confirm: repo URL, github.com/toyeshhm/odyssey-dojo is private today]`

**Team:** toyeshhm, luvudeshi, tagrawal029, gatik-g

<!-- Checked against main at 7161d69 (PR 392, Sunday 6:34 AM). The account lines were redone at 5b90ce8 (PR 396, 6:47 AM), after PR 395 put the sign-in on the Account page. Anything else merged after 6:34 AM is not in here. -->
<!-- Images: Devpost cannot reach a private repo. In the story editor, use the image button to upload each file from the images/ folder next to this file, and put it where the matching line is below. The section titles are images too, as on the Dance Fantasy page; devpost-no-images.md keeps them as text. -->
<!-- RETAKE: all six screenshots (menu, defend-card, strike-card, quest-map, leap-strike, account) show the old look. Each is marked below. architecture.png and t-gemini.png still name the god scan, which is out of the game. -->
<!-- The statistic: we could not find a source for "less than 1% of adults can defend themselves". The 2 in 100 figure below is real: 6.61 million Americans practiced a martial art in 2023 (Sports & Fitness Industry Association, 2024 report, as cited by Gymdesk). -->

---

<!-- RETAKE: the main menu today is a storm painting, a bronze Odyssey Dojo name plate and four shield cards. -->
![Odyssey Dojo main menu](docs/devpost/images/menu.jpg)

A giant reaches for you. A card on the screen says BLOCK, and below it: "Someone grabs for you." You bring both fists up to your cheeks. The webcam sees it, and the hand misses.

That is one of the moves **Odyssey Dojo** teaches. It is a browser game that trains self-defense basics with your own body as the controller. You can train alone or with a friend, and the road you train on is the Odyssey.

![Inspiration](docs/devpost/images/h-inspiration.png)

About 2 in 100 Americans practice a martial art: 6.61 million people in 2023, by the Sports & Fitness Industry Association's count.

![About 2 in 100 Americans practice a martial art (SFIA, 2023). 26 moves, each with a real-world lesson. 1 webcam is all you need to train.](docs/devpost/images/stats.png)

A class takes money, a schedule and the nerve to walk in. A laptop already has a camera.

A dance game teaches by showing you a figure and scoring your copy of it. We wanted the same thing for a guard, a duck and a jab: stand up, copy the figure, and hear at once what to fix.

The Odyssey gave us the story for it. Odysseus does not get home by being the strongest. He gets past the Cyclops, the Sirens and Scylla by knowing what each one will do and having one answer ready. Athena stands beside him and tells him what to do. That is self-defense, and that is a coach.

![What it does](docs/devpost/images/h-what-it-does.png)

### Every attack is a real situation

<!-- RETAKE: the fight screen now has black-glass cards, a lava health bar and a glass power disc. -->
![A defend prompt: Polyphemus swings his club, and the card says dodge right, a wide swing from the side](docs/devpost/images/defend-card.jpg)

Each monster attack stands for something a person might really face. The first times you meet one, the card says so in plain words.

- Polyphemus swings his club: "A wide swing from the side". The card says DODGE RIGHT, and you step off the line.
- He reaches for you: "Someone grabs for you". The card says BLOCK: "Cover your head: fists up".
- He throws a boulder: "Something thrown at your head". The card says DUCK: "Under the swing: bend knees".

A 3D mannequin on the card acts out the answer before you try it. Athena calls it out loud. All 24 attacks across the six monsters carry a line. A few, like the Sirens' song and Circe's spell, are not street situations, so theirs is a general lesson.

A wrong or sloppy try does not end your turn. The screen flashes MISS, the card stays up, and you try again until the attack lands.

### Every move teaches one thing

<!-- RETAKE: the STRIKE card is now a black-glass spear point with lava cracks. -->
![A strike prompt: CROSS, power hand: right fist out](docs/devpost/images/strike-card.jpg)

The fights use 26 moves and the Training Dojo adds 8 more. Each one carries one line on what the move is for outside the game. A few of them:

- **Jab:** a fast hand straight out in front holds someone at arm's length so they cannot crowd you.
- **Dodge right:** moving sideways, not straight back, takes you out of an attack's path so you can get away.
- **Double palm:** a firm push with both open hands opens a gap, and a gap is your chance to leave.
- **Duck:** bend your knees, not your waist, to drop under a swing and still see what is coming.

After a fight, the result screen says how many attacks you defended, lists the moves you learned, and shows the lines for up to three of them under "What each move is for".

We wrote each line ourselves and checked it against a source: the England Boxing coaching handbook, a self-defense sheet from the Asian American Federation and the Center for Anti-Violence Education, safety guides from three police departments, two police training articles, two karate organisations and a Wing Chun academy. Ten sources in all, listed in the repo.

The lines are about protecting yourself and getting away. None of them is about hurting anyone.

### The Training Dojo

![How the Training Dojo grades a jab: four measured parts, three grades, one tip](docs/devpost/images/dojo-grading.png)

<!-- [confirm: take a screenshot of the Training Dojo with a grade and a tip on screen, and add it here] -->

The Dojo is practice with no monster. An outline figure does one move and you copy it.

- **You pick what to practise.** Nine styles: the five from the fights, plus Taekwondo, Muay Thai, Karate basics and Self-defense basics. Tick the moves you want and choose 1, 3 or 5 tries at each.
- **A grade on every try.** Excellent is 150 points, Good is 100, Needs improvement is 25.
- **One tip, never a list.** The game measures the parts of the move and names the weakest one. For a duck: "Bend your knees, not your waist, and keep your eyes up on what is coming."
- **It is kind on purpose.** Any move that counts is at least Good. A near miss counts.
- **It tells you what to work on.** The end screen names your best move and up to three to practise.
- **Then the fights change.** Press Done, and for the rest of that session a beginner gets 25% more warning before every attack. A good player gets 15% less. The blocks, ducks and dodges you missed most come up more often.

With no camera the Dojo runs on keys. It can show you each move then, but it cannot measure your body.

### Alone or with a friend

<!-- RETAKE: the Road Home is now a painted storm sea with a medallion on each island. -->
![The quest map: six stops from Troy to Ithaca](docs/devpost/images/quest-map.jpg)

<!-- [confirm: take a screenshot of a boss cutscene, and of the Multiplayer screen with the room code and QR code, and add them here] -->

- **Alone:** Story mode is six stops in Homer's order: Polyphemus, Circe, the Sirens, Scylla, Charybdis and the Suitors. All six are open from the start, and each has its own monster, arena and attacks to read.
- **A cutscene before each stop:** pick a stop on the map and the monster's painting rises out of the dark, its name slams in with its book of the Odyssey, and the picture cracks open onto the fight. Any key skips it.
- **Five characters:** Odysseus, Poseidon, Zeus, Athena or Achilles. The choice is the look only, and any of them can fight in any style.
- **Five fighting styles:** Boxer, Jiu-jitsu, Karate, Kung Fu and Taekwondo.
- **Defending pays.** Five defends fill a power disc. Then Athena lends you her aegis: push both palms forward and the monster takes the damage of three plain strikes.
- **A finishing move on every stop.** At zero health the game teaches one last move. For Polyphemus it is the stake, the one that blinds him in Book 9.
- **With a friend:** the Multiplayer screen hosts a room, and a friend joins with a four-letter code or a QR code, from a laptop or a phone. A guest who reloads gets the same seat back. The host defends and both of you strike. Throw the same strike within 0.4 seconds of each other and it does double damage.
- **On a FaceTime call:** a friend calls the game's line from an iPhone, with no app to install. The phone shows the fight, and the game reads the friend's body from the call's video. This runs on the one Mac that holds our trial line. On Sunday at 3:21 AM the game answered a real call and held it for 118.9 seconds. `[confirm: the friend's strikes landing on a real call. The team's notes say a later call did it; docs/facetime.md still says not proven]`
- **No camera needed:** every move has a key, and the keys stay live during a webcam fight.

<!-- RETAKE: same leap, new fight screen around it. -->
![A strike lands: the hero leaps to Polyphemus's eye and the game rates the hit GOOD](docs/devpost/images/leap-strike.jpg)

When a strike counts, your hero leaps to the weak spot, so a good jab looks like one.

<!-- RETAKE: the Account page is now a trophy hall: your name, three coins and trophies on the walls. -->
![The Account page: hero name, achievements and settings](docs/devpost/images/account.jpg)

### What it is not

Odyssey Dojo is practice for two things: reacting in time and keeping your distance. It does not replace a class with an instructor and a partner. In a real situation the first choice is to leave.

![How we built it](docs/devpost/images/h-how-we-built-it.png)

![The pipeline: See, Read, Coach, Fight](docs/devpost/images/pipeline.png)

1. **See:** MediaPipe's PoseLandmarker finds 33 points on your body in the browser. The model is served from the game's own files, so tracking needs no outside service.
2. **Read:** each move has its own detector. It measures in shoulder widths and against your own torso, taken while you stand still before the fight, so body size and camera distance do not matter.
3. **Coach:** the Dojo uses the same measurements. A jab is checked for reach (elbow straight past 145 degrees), height, aim and speed (bent arm to straight within 200 ms). The weakest part becomes the tip.
4. **Fight:** the combat engine is plain TypeScript with no browser in it. It runs the phases, the combo, the power meter and the finishing move.
5. **Draw:** three.js through React Three Fiber renders the arenas, the monsters and your hero.
6. **Speak:** every voice line, sound and music track in a fight is a file that ships with the game. We played a keyboard fight with every outside request blocked, and nothing was missing.

<!-- REDO: this picture still says the server asks Gemini for the god scan. The scan is out of the game. -->
![Architecture: everything runs in your browser. ElevenLabs clips ship with the game. A Node.js and Express server, used only when online, runs rooms, FaceTime and accounts.](docs/devpost/images/architecture.png)

The keyboard and the camera feed the same kind of input to the same rules every frame, so a fight plays by the same rules either way. Because the rules do not touch the browser, we test a whole fight, start to finish, as plain code.

The teaching is tested too. One test fails if a move has no real-world line. Another fails if a monster attack has no situation.

The server is optional. It runs the rooms, the FaceTime call and the accounts, and the game plays without it. The live copy at https://odysseydojo.club is a page on Vercel in front of one small Vultr server in Dallas, running in Docker with Caddy for https.

Accounts and a Hall of heroes are built on Tiger Data. Every finished fight of a signed-in player is a row in a hypertable, a continuous aggregate keeps each hero's best score by the hour, and `time_bucket_gapfill` draws the last six hours of activity in ten-minute buckets, with the quiet ones as zeros. We ran the 27 database tests against a real Tiger Data service. On the Account page you can sign in to keep your name, settings, character and trophies, and open the Hall of heroes for the best scores tonight and of all time. Without an account, your progress stays in your browser.

![Tech stack](docs/devpost/images/h-tech-stack.png)

| CATEGORY | TECHNOLOGIES |
|---|---|
| Frontend | React 19, TypeScript 6 (strict), Vite 8 |
| 3D | three.js, React Three Fiber, drei, postprocessing |
| Pose tracking | MediaPipe Tasks Vision (PoseLandmarker, runs in the browser) |
| Server | Node.js, Express 5, Zod (optional: rooms, FaceTime and accounts) |
| Calls | LiveKit and Chert, for the FaceTime call |
| Voice and sound | ElevenLabs (voices, sound effects, win and loss stings) |
| Database | Tiger Data (Postgres with TimescaleDB), off unless the server is given a database address |
| Hosting | Vercel for the page, Vultr (Docker, Caddy) for the server, a domain from GoDaddy |
| Tests | Vitest, 238 test files, and seven headless-browser scripts that play the game |
| Art | 20 paintings made on our own laptop with FLUX.2 Klein, Poly Haven (CC0 skies and textures), Quaternius and KayKit (CC0 models), shapes built in code |

![Built with ElevenLabs: Athena coaches you out loud in every fight](docs/devpost/images/t-elevenlabs.png)

A coach has to talk. Athena, Homer and the monsters speak with ElevenLabs. We generated the clips ahead of time with our own account, 135 files in all, and they ship with the game, so a normal fight never calls ElevenLabs.

- **Athena** calls every defense and every strike, praises a hit and warns after one. Her voice is Sarah.
- **Homer** narrates before and after each stop. His voice is George.
- **Each monster has its own voice:** Callum for Polyphemus, Lily for Circe, Jessica for the Sirens, Harry for Scylla, Brian for Charybdis and Liam for the Suitors.
- **Sound effects and the win and loss stings** came from the same account. The menu and fight music is by Shane Ivers.

We ran the voice clips through speech to text afterward. The check heard `call_knee` as "Me", so we generated that clip again. `[confirm: whether the team entered the ElevenLabs track]`

<!-- The old "Built with Google Gemini" section described the god scan. PR 392 took the scan out of the game on Sunday at 6:34 AM, so that section and t-gemini.png are gone from here. What is left of Gemini is below. Cut this section, and google-gemini from Built with, if the team does not enter the track. -->

### Google Gemini: a fight from a sentence

`[confirm: keep this section only if the team still enters the Gemini track]` Type how you fight, and Gemini writes the fight: our Express server sends the sentence to Gemini and gets back a monster's attacks and timing. The key stays on the server. With no key, or with the server off, the game uses a fight that ships with it. This page has no menu button yet. It opens when the address has `?ai=1` in it.

![Challenges](docs/devpost/images/h-challenges.png)

- **Teaching without overclaiming.** A Siren's song and Circe's spell are not things a person meets on the street. We did not invent an assault to stand for them. Those attacks carry a general lesson, and our notes mark each one as that.
- **Training has to be kind.** A beginner who is marked down stops trying. So the Dojo counts a near miss, a move that counts can never score below Good, and a wrong try in a fight says MISS and lets you go again.
- **Bodies come in all sizes.** Detectors measure in your own shoulder widths. We tested them on made-up poses first, and on Sunday morning we loosened them so a rough motion of the right arm or leg counts. `[confirm: result of the first fight on a real body on the demo laptop, issues #7 and #17]`
- **Webcam play must survive a bad room.** Poor light or a failed camera cannot end the demo. If the camera loses you, the fight pauses and says "Or press any move key to play on the keyboard".
- **Strikes did not look like they landed.** The hit counted, but the hero stayed where he stood. Now he leaps so his fist, foot or blade meets the weak spot.
- **Cutting our own feature.** A webcam scan that named the Olympian you take after was built and in the game. We took it out on Sunday morning. `[confirm: one line on why the god scan came out]`
- **A restart at 3:05 AM.** The lead's laptop rebooted with a room full of coding agents in the middle of their work. Each one had its own folder and its own branch, so no code was lost. About 170 pictures in a temp folder were.
- **Three people and their coding agents in one repository.** Folder owners, one issue per task and a branch for every change kept merges small. 291 pull requests merged in the first 16 hours.

![Accomplishments](docs/devpost/images/h-accomplishments.png)

- 34 moves, each with a real-world line and a cited source.
- A Training Dojo that grades every try, gives one tip and changes the fights to fit you.
- A full game you can play with only your body, or only a keyboard.
- Rooms where two people fight one monster and strike together for double damage.
- A real FaceTime call answered by a browser game.
- Accounts and a Hall of heroes leaderboard on Tiger Data.
- Six stops, each with its own cutscene and finishing move. Polyphemus's is the stake from Book 9.
- Rules that run without a browser, so the whole fight is tested as code.
- A live copy anyone can open: https://odysseydojo.club.

![What we learned](docs/devpost/images/h-learned.png)

- **One tip beats five.** A player can fix one thing on the next try.
- **The same detector can fight and teach.** We built the detectors for combat. Measuring their parts gave us the coach for free.
- **Agree the contracts first.** Shared types let several people build in parallel without rewriting each other's work.
- **A playtest beats a test suite** for finding what a player trips over.

![What's next](docs/devpost/images/h-next.png)

- Put the Dojo in front of a self-defense instructor and fix what they flag. `[confirm: the team agrees this is a next step]`
- Tune the detectors on more real bodies.
- Show the defense panel: what you defended by kind, and what to practise next. It is built, and today only its one line appears on the result screen.
- Two players on one camera. The logic and its tests are merged, and the Multiplayer screen has no card for it yet.
- Swap kicks the camera cannot see when a player is framed from the waist up. The swap is written and nothing calls it yet.
- Give the fight written from a sentence a button on the menu.
- Take FaceTime past a trial line that lives on one laptop.

Play it at https://odysseydojo.club. Open the Training Dojo first.

*Sources: martial arts participation from the Sports & Fitness Industry Association's 2024 report, as cited by [Gymdesk](https://gymdesk.com/blog/martial-arts-industry-statistics). The ten sources behind the move lines are in `docs/moves.md`.*

*Credits: skies and textures from [Poly Haven](https://polyhaven.com) (CC0). Hero and Polyphemus models by Quaternius (CC0), set pieces from KayKit (CC0), and a column by Victor Viña (CC BY 3.0). The paintings on the menu, the map, the cutscenes and the screen backdrops were generated by the team with FLUX.2 Klein. Voices, sound effects and stings generated with ElevenLabs. Music: "The Rise Of Heroes", "Passage Of Arms" and "The Fall Of Heroes" by Shane Ivers (https://www.silvermansound.com), CC BY 4.0. Pose tracking by Google MediaPipe (Apache License 2.0). The full list is in `CREDITS.md`.*
