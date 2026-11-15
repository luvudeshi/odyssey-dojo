# Docs

Every page in this folder, grouped by what you came for. The game itself is described in the
[README](../README.md).

## Start here

| Page | What it covers |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | The plan, the feature list, how the pieces fit, who owns which folder |
| [FEATURES.md](FEATURES.md) | Every feature with its status on `main`: in the game, built but not on a screen, or planned |
| [COORDINATION.md](COORDINATION.md) | How the team and its coding agents claim a task, report on it and land work |

## The game

| Page | What it covers |
|---|---|
| [characters.md](characters.md) | The five heroes: a hero is a look, a style is a move set |
| [moves.md](moves.md) | What each move teaches, with the sources behind each line |
| [situations.md](situations.md) | The real situation each monster attack stands for |
| [endings.md](endings.md) | How each stop ends, as the Odyssey ends it |
| [balance.md](balance.md) | Fight length and win rate at every stop |
| [report-card.md](report-card.md) | The report card at the end of a fight |
| [defense-progress.md](defense-progress.md) | A panel of what the player defended (built, not on a screen) |
| [move-feedback.md](move-feedback.md) | The grade, points and tip after a move counts in a fight |
| [move-guide.md](move-guide.md) | An animated figure of the move with a live checklist |
| [warmup.md](warmup.md) | The warm-up skill check before a fight |
| [waist-up.md](waist-up.md) | Which moves still count when the camera sees no hips or legs |

## Training Dojo

| Page | What it covers |
|---|---|
| [dojo.md](dojo.md) | The Training Dojo: one move at a time, a grade and a tip |
| [dojo-moves.md](dojo-moves.md) | The extra moves and styles the Dojo adds |
| [practice.md](practice.md) | The pure parts of practice mode |

## Playing together

| Page | What it covers |
|---|---|
| [rooms.md](rooms.md) | Online rooms: the host's and guest's screens, the smoke run, the relay's routes and limits |
| [rooms-tunnel.md](rooms-tunnel.md) | Rooms over the internet: the tunnel and the hosted copy's limits |
| [duo.md](duo.md) | Two players on one camera |
| [facetime.md](facetime.md) | Call a friend on FaceTime: how a call reaches the game, and what was run |
| [facetime-demo.md](facetime-demo.md) | The three-minute FaceTime demo script |

## Server and hosting

| Page | What it covers |
|---|---|
| [accounts.md](accounts.md) | Accounts and the Hall of heroes on Tiger Data |
| [deploy-vercel.md](deploy-vercel.md) | The page on Vercel with the Vultr server behind it |
| [deploy-vultr.md](deploy-vultr.md) | Running the server on Vultr with Docker and Caddy |
| [offline.md](offline.md) | Proof the judged path needs nothing from the internet |
| [check-dist.md](check-dist.md) | Proof no key is in the files a browser downloads |
| [failure-drill.md](failure-drill.md) | What each server route does when the network or a key fails |

## Tracking and tests

| Page | What it covers |
|---|---|
| [detector-tuning.md](detector-tuning.md) | Tuning the move detectors on real bodies |
| [cross-fire.md](cross-fire.md) | Which moves set off which |
| [ghost-check.md](ghost-check.md) | Whether copying the move ghost would count |
| [webcam-smoke.md](webcam-smoke.md) | The fake-camera run of the webcam path |
| [smoke.md](smoke.md) | Smoke run output (written by `scripts/smoke.mjs`) |
| [perf.md](perf.md) | Frame rate per stop and quality (written by `make fps`) |
| [playtest.md](playtest.md) | The hand-test checklist and bug log |

## Art and sound

| Page | What it covers |
|---|---|
| [licences.md](licences.md) | Every shipped file, its credit and how its licence was checked. The short list is [CREDITS.md](../CREDITS.md) |
| [assets.md](assets.md) | Free models, textures and skies we may use |
| [models.md](models.md) | Dropping in GLB models, and the model log. Per stop: [models/](models/) |
| [ui-pebble.md](ui-pebble.md) | The pebble mosaic UI kit |
| [athena-lines.md](athena-lines.md) | Athena's coaching lines |
| [narration-lines.md](narration-lines.md) | Homer's narration and the monsters' taunts |
| [audio-heard.md](audio-heard.md) | What each voice clip says, checked by speech to text |
| [audio-levels.md](audio-levels.md) | The loudness of every clip |

Screenshots taken while building are in [screenshots/](screenshots/).

## Demo and submission

| Page | What it covers |
|---|---|
| [demo-runbook.md](demo-runbook.md) | What to do, step by step, for the judged demo |
| [pitch.md](pitch.md) | What to say while a judge plays, and answers to expected questions |
| [prizes.md](prizes.md) | Each sponsor tool we used and where the proof is |
| [devpost/](devpost/devpost.md) | The Devpost draft and its images |

## Working on the code

Run this before you open a PR. It runs lint, typecheck, the tests and a build:

```bash
make check
```

`make ready` also fails unless your branch sits on top of the latest `main`. Add `?debug` to the game's
address to see every move detector's live confidence while you tune.

To add content, copy one file. No shared list needs editing; each folder is picked up by itself.

- **A move:** copy `src/moves/defs/jab.ts`, change the fields and the detector, then name it in a style
  and in an enemy's weak spots.
- **A monster:** copy `src/enemies/defs/polyphemus.ts` for its data and
  `src/render/monsters/models/Polyphemus.tsx` for its 3D model. Until the model exists, the game shows a
  placeholder block.
- **A fighting style:** copy `src/styles/defs/boxer.ts`.
