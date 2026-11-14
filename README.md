# Odyssey Fighter

A full-body 3D fight training game for HackUTA 2026 (theme: Homer's Odyssey). Your webcam tracks your body; you follow Odysseus's route home, block, dodge and strike the monsters he met, and learn each move mid-fight.

## Start here

1. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): the plan, every feature, how the pieces fit, who owns what, and the timeline.
2. [docs/COORDINATION.md](docs/COORDINATION.md): how you and your coding agent claim a task and report on it.
3. [The issue list](https://github.com/toyeshhm/odyssey-fighter/issues): one issue per task. Pick an `open` one nobody is assigned to.

Coding agents load `AGENTS.md` / `CLAUDE.md`, which point at the same two docs.

## Run it

You need Node 22 or newer.

```bash
make setup
```

```bash
make dev
```

Open http://localhost:5173. Choose "Fight with your body" and allow the camera, or "Keyboard only".

`make setup` also copies the pose-tracking model into `public/mediapipe/`, so the game runs with no network after that.

## Keyboard controls

| Move | Key |
|---|---|
| Block | Space (hold) |
| Dodge left / right | Left / Right arrow (hold) |
| Duck | Down arrow (hold) |
| Jab, Cross, Left hook | J, K, L |
| Spear thrust, Overhead strike | U, I |

## AI server (optional)

The game runs without it. With it, a phrase the player types becomes a generated fight, and (soon) the webcam picks which god they are.

Copy `.env.example` to `.env`, add your `GEMINI_API_KEY` and `ELEVENLABS_API_KEY`, then run both the game and the server:

```bash
npm run dev:all
```

The keys stay on the server and never reach the browser. Every AI call has a timeout and a bundled fallback, so a slow or missing network only means a handcrafted level instead of a generated one. `GET /api/health` shows which services have a key. The server listens on your whole network so a phone can open a replay page, but the routes that spend your API credits (`/api/level`, `/api/reveal`, `/api/portrait` and `/api/speech`) answer only requests made from this machine and give any other device a 403.

Before a demo, run `npx tsx server/tools/preflight.ts`. It prints one PASS, WARN or FAIL line each for the audio clips, the pose model files, the keys, Gemini, ElevenLabs and this server.
A WARN means the game still runs; the line says what falls back or what to do. Only a FAIL (a missing Athena clip or pose file) exits non-zero.
Add `--offline` to skip the Gemini and ElevenLabs calls. It never prints a key, and the ElevenLabs call costs no credits.
The Gemini line shows which model answered and how long it took.

Sound effects in `public/audio/sfx/` and Athena's voice in `public/audio/athena/` were generated for this project with ElevenLabs.

## Before you open a PR

```bash
make check
```

That runs lint, typecheck, tests and a build. Add `?debug` to the URL to see every move detector's live confidence while you tune.

## Add things

- **A move:** copy `src/moves/defs/jab.ts`, change the fields and the detector, then name it in a style and in an enemy's weak spots.
- **A monster:** copy `src/enemies/defs/polyphemus.ts` for its data and `src/render/monsters/models/Polyphemus.tsx` for its 3D model. Until the model exists, the game shows a placeholder block.
- **A fighting style:** copy `src/styles/defs/boxer.ts`.

No shared list needs editing for any of these; each folder is picked up automatically.
