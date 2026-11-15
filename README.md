# Odyssey Dojo

> **HackUTA 2026** (November 14 to 15, 2026). Theme: Homer's Odyssey.
>
> 🎮 **[Play at OdysseyDojo.club](https://odysseydojo.club)**
<!-- link: the Devpost submission goes here once it is public -->

**Learn real self-defense, one monster at a time.** Odyssey Dojo is a browser fighting game where your
body is the controller. Your webcam watches you block, duck, dodge and strike while you follow Odysseus
home past Polyphemus, Circe, the Sirens, Scylla, Charybdis and the suitors. Athena calls every move out
loud, and every move says what it is for outside the game. Fight alone, with a friend in front of the
same camera, in an online room, or with a friend on a FaceTime call.

**Play at [OdysseyDojo.club](https://odysseydojo.club)** in Chrome with a webcam. No webcam? Every move has a key.

### 🏛️ Sponsor tools at a glance

| | Tool | What it does in Odyssey Dojo |
|---|---|---|
| 📞 | **Chert** | A friend FaceTimes the game from an iPhone, sees the fight on the call and strikes as the second fighter |
| ☁️ | **Vultr** | Runs the game's server (rooms, accounts) in Docker with Caddy for https |
| 🌐 | **GoDaddy** | The game's domain, [odysseydojo.club](https://odysseydojo.club) |
| 🐯 | **Tiger Data** | Accounts and the Hall of heroes: every fight of a signed-in player is a row in a hypertable |
| 🎙️ | **ElevenLabs** | The voices of Athena, Homer and every monster, plus the sound effects, all made ahead of time |
| ✨ | **Google Gemini** | Writes a whole fight from one sentence about how you fight (a hidden page, `?ai=1`) |

<!-- picture: a fight in progress, the hero facing Polyphemus with the defend card on screen -->

## 💡 Inspiration

A self-defense class takes money, a schedule and the nerve to walk in. A laptop already has a camera.
Dance games teach by showing a figure and scoring your copy of it. We wanted the same thing for a guard,
a duck and a jab: stand up, copy the move, and hear at once what to fix.

The Odyssey gave us the story. Odysseus does not get home by being the strongest. He gets past the
Cyclops, the Sirens and Scylla by knowing what each one will do and having one answer ready, with Athena
beside him telling him what to do. That is self-defense, and that is a coach.

## 🥋 What it does

- **Every fight has two beats.** The monster winds up and a card says how to stop it: BLOCK, DUCK,
  DODGE LEFT or DODGE RIGHT. Then a weak spot opens and the card names a strike. The better you throw it,
  the more damage it does: GOOD, GREAT or PERFECT.
- **Every attack is a real situation.** Polyphemus reaching for you is "someone grabs for you", and the
  answer is a guard. Each move carries one line on what it is for in real self-defense.
- **Six stops in Homer's order.** Polyphemus, Circe, the Sirens, Scylla, Charybdis and the suitors, each
  with its own monster, arena, attacks, sound and a finishing move. Polyphemus ends on the stake. A
  painted cutscene opens each stop.
- **Five heroes, five powers.** Pick Odysseus, Zeus, Poseidon, Athena or Achilles. Defends fill a power
  meter, and a full meter lets your hero's power loose: Zeus's Thunderbolt, Poseidon's Trident Sweep,
  Athena's Aegis Push, Odysseus's Moon Arrow or Achilles's Swift Dash.
- **Five fighting styles:** Boxer, Jiu-jitsu, Karate, Kung Fu and Taekwondo.
- **A Training Dojo.** Practise one move at a time with no monster. Every try gets a grade and one tip,
  and the end screen says what to work on.
- **Athena coaches out loud.** She calls every defend and strike, Homer narrates each stop, and every
  monster taunts you. All of it ships with the game, so sound works offline.
- **Play together, four ways.** The Multiplayer screen has four cards:
  - **Host a room** and get a four-letter code and a QR code.
  - **Join a room** from a laptop or a phone, with a camera, keys or touch buttons.
  - **Two players, one camera:** both bodies are tracked and each gets a hero.
  - **Call a friend on FaceTime:** the friend's iPhone shows the fight and the game reads their body
    from the call. The card always shows; its Call button works only when the server has its phone
    settings.

  Two fighters who throw the same strike together hit twice as hard.
- **Accounts and a Hall of heroes.** Sign in on the Account screen to keep your name, settings,
  character and trophies on another browser, and see the best scores. A signed-in player can change
  their sign-in name and password there. Without an account, progress stays in your browser.

| Main menu | Multiplayer |
|---|---|
| <!-- picture: the storm main menu with its four shield cards --> | <!-- picture: the Multiplayer screen with its four cards --> |

## 🌟 What makes it different

- **Your body is the whole controller.** MediaPipe tracks you in the browser with a model that ships with
  the game, so tracking needs no outside service. Online rooms pass only small JSON messages.
- **It works for any body.** Detectors measure in your own shoulder widths, taken while you stand still
  before the fight, so height and distance from the camera do not matter. A player seen only from the
  waist up can still fight: the game never asks for a kick the camera cannot see.
- **It is kind on purpose.** A wrong try says MISS and the card stays up until the attack lands. While a
  move is asked for, a rough attempt at it counts.
- **The rules never touch the browser.** The fight engine is plain TypeScript, so the keyboard, the
  webcam, a second body and a friend in another room all feed it the same input, and a whole fight is
  tested as code.
- **It never needs the network to play.** Every move has a key and every sound is a file. The server is
  only for rooms, accounts, FaceTime and Gemini.

## 🏛️ How we used each sponsor's tools

### 📞 Chert: a friend on FaceTime
A friend calls the game's line on FaceTime Video, with no app and no link. Chert bridges the call into a
LiveKit room where the game's tab answers it. The tab sends the fight to the phone as the call's picture
and sound, and reads the friend's body from the call's video with the same pose model the webcam uses.
The friend strikes as the second fighter. On 15 November the game answered a real call from an iPhone
and held it for 118.9 seconds. This runs on the one Mac that holds our trial line, so the hosted site
shows the card but cannot take a call. Details: [docs/facetime.md](docs/facetime.md).

### ☁️ Vultr: the game's server
One Vultr instance in Dallas runs our Node server in Docker, with Caddy in front of it for https. It is
the relay for online rooms and the home of accounts. The page itself is on Vercel and passes `/api/`
calls to the instance at `api.odysseydojo.club`. The kit is in [deploy/vultr/](deploy/vultr), the steps in
[docs/deploy-vultr.md](docs/deploy-vultr.md) and [docs/deploy-vercel.md](docs/deploy-vercel.md).

### 🌐 GoDaddy: OdysseyDojo.club
The game lives at **[odysseydojo.club](https://odysseydojo.club)**, served over https. A browser only gives
a page the camera over https, so the domain is what lets anyone play with their body.

### 🐯 Tiger Data: accounts and the Hall of heroes
Accounts and the Hall of heroes run on Tiger Data (Postgres with TimescaleDB). Every finished fight of a
signed-in player is a row in a **hypertable**, a **continuous aggregate** keeps each hero's best score by
the hour, and `time_bucket_gapfill` draws recent activity with the quiet stretches as zeros. The server
reaches it with one connection string and plays on without it. Details: [docs/accounts.md](docs/accounts.md).

### 🎙️ ElevenLabs: Athena, Homer and the monsters
Every voice line, sound effect and the win and loss stings were made with ElevenLabs ahead of time and
ship as files, so a fight never calls ElevenLabs. Athena is Sarah, Homer is George, and each monster has
its own voice. We ran the voice clips back through speech to text to check what each one says
([docs/audio-heard.md](docs/audio-heard.md)).

### ✨ Google Gemini: a fight from a sentence
Open the game with `?ai=1`, type or say how you fight, and our server asks Gemini to write the fight: a
named monster, its taunts, the place, the phases and Homer's lines. The key stays on the server. With no
key or a slow answer, you get one of five fights that ship with the game. It has no menu button.

### 🧰 Also built with
**React 19 + TypeScript (strict) + Vite 8** · **three.js 0.187** with **React Three Fiber** for the arenas,
monsters and heroes · **MediaPipe** (Google) for pose tracking in the browser · **Node + Express** (run with
tsx) for rooms, accounts and AI · **LiveKit** for the FaceTime call · **Vercel** for the page.

## ⚙️ How it works

1. **See.** MediaPipe's pose model finds your joints in each webcam frame, in the browser.
2. **Read.** Each of the 26 moves has its own detector, one file each in `src/moves/defs/`. It measures
   against your own torso, so body size and distance do not matter.
3. **Fight.** The keyboard, the webcam and a remote player all turn into the same input. The engine in
   `src/combat/engine.ts` runs the phases, combo, power meter and finishing move, with no camera, clock or
   graphics inside it.
4. **Show.** The arena, the HUD and the sound only read the fight's state and events. Athena's lines and
   the music are files picked by those events.

The plan, the full feature list and how the folders fit together: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

<!-- picture: the Training Dojo with a grade and a tip on screen -->

## 🧗 Challenges we ran into

- **Bodies come in all sizes.** A fixed threshold works for one person. Every detector measures in the
  player's own shoulder widths and holds for a 30 degree turn.
- **Teaching without overclaiming.** A Siren's song is not something a person meets on the street, so
  those attacks carry a general lesson instead of an invented assault.
- **Webcam play must survive a bad room.** If the camera loses you, the fight pauses and asks you to step
  back, or to press any move key to go on with the keyboard.
- **Strikes did not look like they landed.** The hit counted but the hero stood still. Now he leaps so
  his fist, foot or blade meets the weak spot.
- **A phone in the fight.** Getting a FaceTime call into a browser tab meant a LiveKit room, a silent
  bridge agent, and a tall 720 by 1280 picture of the fight sent back down the call.
- **Four people and three coding agents in one repo.** Folder owners, one issue per task and a branch
  for every change kept merges small ([docs/COORDINATION.md](docs/COORDINATION.md)).

## 🎮 Try it

**[OdysseyDojo.club](https://odysseydojo.club)** in Chrome with a webcam. Press **Story mode**, pick a hero
and a style, choose a stop on the map, stand back so the camera sees you, and fight. To play on the
keyboard, set **Play with** to Keyboard in the Account screen's settings.

To run it locally (Node 22 or newer):

```bash
make setup   # npm packages and the pose-tracking model
make dev     # the game on http://localhost:5173
```

The game plays a full fight with no server. For rooms, accounts and Gemini, copy
[.env.example](.env.example) to `.env`, add your keys, and run the game with its server:

```bash
npm run dev:all
```

Keys stay on the server and never reach the browser. The routes that spend API credits answer only
requests from the machine the server runs on. `npm run preflight` checks the clips, the pose model, the
keys and the server before a demo. Every doc in the repo is listed in [docs/README.md](docs/README.md).

### ⌨️ Keyboard controls

| Category | Move | Key |
|---|---|---|
| **Defends** | Block | Space (hold) |
| | Dodge left / right | Left / Right arrow (hold) |
| | Duck | Down arrow (hold) |
| | Jump | Up arrow (hold) |
| **Strikes** | Jab, Cross, Hook | J, K, L |
| | Uppercut | B |
| | Spear thrust, Overhead strike | U, I |
| | Front kick, Knee | F, N |
| | Reverse punch, Hammer fist | R, M |
| | Knife hand, Rising palm | H, G |
| | Double palm, Chain punch | P, C |
| **Finisher** | Stake thrust (Polyphemus) | T |
| **Powers** (full meter) | Thunderbolt (Zeus), Trident sweep (Poseidon), Aegis push (Athena) | 1, 2, 3 |
| | Swift dash (Achilles), Moon arrow (Odysseus), Sun burst | 4, 5, 6 |

## 🏺 Team

[toyeshhm](https://github.com/toyeshhm), [luvudeshi](https://github.com/luvudeshi),
[tagrawal029](https://github.com/tagrawal029) and [gatik-g](https://github.com/gatik-g).

## 🤖 AI tools used

- **Claude Code** (Anthropic) helped write and review the code, with coding agents working on separate
  branches under the rules in [AGENTS.md](AGENTS.md).
- **ElevenLabs** made every voice line, sound effect and sting ahead of time.
- **FLUX.2 Klein 4B**, run on our own laptop, painted the menu, map, cutscene and screen backdrops from
  our own prompts.
- **Google Gemini** writes the fights on the `?ai=1` page, as described above.
- **MediaPipe** (Google) tracks the body.

## 📜 Credits

Skies and textures from [Poly Haven](https://polyhaven.com) (CC0). Hero, Polyphemus, suitor and Charybdis
models by Quaternius (CC0), feast tables from KayKit by Kay Lousberg (CC0), and the columns of Circe's
hall: "Doric Greek Column" by Victor Viña, CC BY 3.0, via Poly Pizza. Music: "The Rise Of Heroes",
"Passage Of Arms" and "The Fall Of Heroes" by Shane Ivers, [silvermansound.com](https://www.silvermansound.com),
CC BY 4.0. Voices, sound effects and stings generated with ElevenLabs. Paintings generated by the team
with FLUX.2 Klein 4B. Pose tracking and the Draco mesh decoder by Google (Apache License 2.0). The game
loads no font files: it uses the fonts already on your computer.

Every shipped file has a row in [CREDITS.md](CREDITS.md), and `make credits` fails if one is missing.
