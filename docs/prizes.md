# Prize tracks: what we used, and where the proof is

Part of issue #33. One page to copy from when you fill in Devpost, and to open when a sponsor judge says "show me where you used our thing".

Every path below was checked on `main` at PR #363. Each track has four parts: what we do with it, the files that prove it, what to show in 30 seconds, and the limits. **"To confirm" means the repo does not prove it.** Do not say it to a judge until somebody has checked.

The Devpost text itself is in [devpost/devpost.md](devpost/devpost.md). This page does not replace it.

## 1. Chert: Best Use of FaceTime

**What we do with it.** A friend FaceTimes the game's line from an iPhone. No app and no link. Chert bridges the call into a LiveKit room, and the game's browser tab sits in that room. The tab sends the fight to the phone as the call's picture and sound (a tall 720 by 1280 picture with the health bars and the move card). The friend's camera comes back through the same call and is read by the same pose model the webcam uses. The friend's strikes go into the fight as the second fighter. Athena greets the caller when the call is up.

**Proof in the repo.**

- [facetime.md](facetime.md): how a call reaches the game, the routes, and what was run. "Run so far" has the two real calls of Sunday 15 November that are written down: a probe page at 03:12 (98.6 s) and the game itself at 03:21 (118.9 s).
- [facetime-demo.md](facetime-demo.md): the three-minute script for the judge and what to do when something fails.
- `src/facetime/`: `answer.ts` and `answerBrowser.ts` (answering a call), `session.ts` and `callMachine.ts` (the call and its clocks), `livekitRoom.ts` (the room), `remotePlayer.ts` (reading the friend's body), `friendLink.ts` (the friend as second fighter), `compositor.ts` (the picture for the phone), `callAudio.ts` (the sound), `ui/FaceTimeCard.tsx` and `ui/AnswerPanel.tsx` (the card).
- `server/routes/facetime.ts`, `server/routes/facetimeWaiting.ts`, `server/lib/chertWaitingRoom.ts`, `server/lib/facetimeChert.ts`, `server/lib/facetimeToken.ts`, `server/lib/facetimeRooms.ts`.
- `scripts/chert/bridge.mjs`: the silent agent Chert needs in the room.
- The card is on the Multiplayer screen: `src/screens/Multiplayer.tsx` mounts `FaceTimeCard`.
- Tests: `tests/facetimeAnswer.test.ts`, `tests/facetimeSession.test.ts`, `tests/facetimeCall.test.ts`, `tests/facetimeFrame.test.ts`, `server/tests/facetimeWaiting.test.ts`, `server/tests/facetimeServer.test.ts`.

**Show it in 30 seconds.** On the Mac that holds the line: open Multiplayer, the card says "Waiting for a FaceTime call." The judge calls the line on FaceTime Video. The card says the friend is on the call and the phone shows the game. Press "Start the fight"; the friend punches at the phone and the monster's health drops. The full script is in [facetime-demo.md](facetime-demo.md).

**Limits.**

- It runs only on the one teammate's Mac that holds the trial line, with two processes kept running there. The hosted site cannot do it: the FaceTime routes answer only to their own machine.
- Trial line: 5 minutes a call, 50 minutes in all, 24 hours. A new phone must join the line once before it can call.
- The friend only strikes. The host defends.
- Dialling out from the game (the Call button) has never rung a phone.
- **To confirm: the friend's strikes on a real call.** The team's board says three real calls worked on 15 November and the friend's strikes took the monster from 100% to 31%. The docs on `main` do not say this yet: [facetime.md](facetime.md) still says "The friend's strikes on a real call are not proven yet" and that the monster stayed at 100% on call 2. Update that doc, or have the person who ran the third call confirm, before you quote the 31%.

## 2. Vultr (MLH)

**What we do with it.** The game's server runs on one Vultr instance, in Docker, with Caddy in front of it for https. That server is the relay for online rooms: a visitor can join a room and play in it there. Today the same instance also serves the game page.

**Proof in the repo.**

- `deploy/vultr/Dockerfile`, `deploy/vultr/docker-compose.yml`, `deploy/vultr/Caddyfile`, `deploy/vultr/setup.sh`, `deploy/vultr/.env.example`.
- [deploy-vultr.md](deploy-vultr.md): the steps, and "Run for real, once": a 1 vCPU / 2 GB instance in Dallas on Ubuntu 24.04, where Caddy got its own certificate and `https://odysseydojo.club` serves the game.
- The room relay: `server/routes/rooms.ts`, `server/lib/rooms.ts`. What a hosted visitor may reach: `server/lib/localOnly.ts`.

**Show it in 30 seconds.** Open `https://odysseydojo.club` on any laptop: the padlock, then a keyboard fight. Then open `deploy/vultr/docker-compose.yml` and point at the two services, `game` and `caddy`. If asked for more, show the instance in the Vultr dashboard (to confirm who has the login).

**Limits.**

- A visitor to the hosted copy can join a room but cannot make one. The owner can make one through an SSH tunnel, and [deploy-vultr.md](deploy-vultr.md) says that was not tried.
- The god scan, speech made on demand, replays and FaceTime answer 403 on the hosted copy. It is the offline game plus joining rooms.
- Not checked on the real domain, by that doc: the camera prompt, a full fight, and a room joined through Caddy. To confirm before you say "online rooms run on Vultr" as a thing a judge can try.
- "The page on Vercel, the room server on `api.`" is not on `main`. It is open PR #351 (`docs/deploy-vercel.md` and `vercel.json` are only on that branch), and its guide says "Nothing was deployed." To confirm whether it has been deployed since.

## 3. GoDaddy Registry (MLH): the domain

**What we do with it.** The game lives at `https://odysseydojo.club`. The name's A record points at the Vultr instance, and Caddy gets and renews the https certificate for it. https matters here: a browser only gives a page the camera over https.

**Proof in the repo.**

- [deploy-vultr.md](deploy-vultr.md), step 3 "Point the domain at it" (it names GoDaddy as the registrar) and "Run for real, once" (it names `https://odysseydojo.club`).
- `deploy/vultr/Caddyfile` and `deploy/vultr/.env.example`: the one `DOMAIN` setting.

**Show it in 30 seconds.** Type `odysseydojo.club` in a browser. The game loads with a padlock.

**Limits.**

- `www.odysseydojo.club` is not served.
- The worked example in the guide is `odysseydojo.us`; the real name is `odysseydojo.club`.
- No `api.odysseydojo.club` on `main`: that name is only in open PR #351, as a placeholder.
- **To confirm with MLH that a `.club` name qualifies**, and that it was registered through the MLH GoDaddy Registry offer. The repo has no rule text and no receipt.

## 4. Gemini, ElevenLabs and Tiger Data

### Google Gemini (MLH): the god scan

**What we do with it.** Before the style menu, a webcam player gets a god scan. One snapshot goes to our own server, which asks Gemini which Olympian the player takes after (Zeus, Poseidon, Athena, Hermes, Artemis or Apollo). The god gives one power in the fight. The key stays on the server. With the server off, the scan picks a god in the browser from body measurements.

**Proof.** `server/ai/gemini.ts` (the calls and the model names), `server/routes/reveal.ts` (`POST /api/reveal`), `src/ai/revealGod.ts`, `src/screens/GodScan.tsx` (mounted in `src/App.tsx`), `server/tests/reveal.test.ts`. [FEATURES.md](FEATURES.md) lists it as in the game.

**Show it.** On the demo laptop with the server and a key: start Story mode with the camera, stand still for the three-second count, and the god is named. `npm run preflight` prints a `gemini` line with the model that answered.

**Limits.** Camera play only, and only where the server runs with a key. On the hosted site the scan uses the browser fallback and never reaches Gemini. Fights written from a sentence by Gemini have a server route (`server/routes/level.ts`) and no menu entry: do not claim them.

### ElevenLabs (MLH): Athena, Homer and the monsters

**What we do with it.** Every voice line and sound effect was made ahead of time with ElevenLabs and ships with the game as files, so sound works with no network. Athena calls each defense and strike. Homer narrates. The monsters taunt.

**Proof.** The clips: `public/audio/athena/` (59 files), `public/audio/narration/` (13), `public/audio/taunts/` (16), `public/audio/sfx/` (18). The tools that made and checked them: `server/tools/genClips.ts`, `server/tools/hearClips.ts`, `server/ai/elevenlabs.ts`, `server/ai/voices.ts`. The lines: [athena-lines.md](athena-lines.md), [narration-lines.md](narration-lines.md). The speech-to-text check of all 82 voice clips: [audio-heard.md](audio-heard.md). Credits: `CREDITS.md`.

**Show it.** Start any fight with the sound up. Athena calls the first defense within seconds. Then open `public/audio/athena/` and `server/tools/genClips.ts`.

**Limits.** No ElevenLabs call happens during a fight; the clips are files. The one live route (`server/routes/speech.ts`, `POST /api/speech`) runs only on a laptop with a key. [audio-heard.md](audio-heard.md) says one clip, `athena/call_knee.mp3`, still needs a person to listen to it. The menu and fight music is not ElevenLabs: it is by Shane Ivers (CC BY 4.0). Only the win and loss stings came from the ElevenLabs music endpoint (see `CREDITS.md`).

### Tiger Data: accounts and the Hall of heroes

**What we do with it.** The server code for accounts (a hero name, a password, one saved game) and for a Hall of heroes (best scores, built on a hypertable, a continuous aggregate and `time_bucket_gapfill`) is written for Tiger Data and was run against a real Tiger Data service.

**Proof.** [accounts.md](accounts.md), above all "What Tiger Data does for the game" and "What was run against the real database". Code: `server/lib/db.ts`, `server/lib/accounts.ts`, `server/lib/heroes.ts`, `server/routes/account.ts`, `server/routes/heroes.ts`, `src/account/ui/AccountSignIn.tsx`, `src/account/ui/HallOfHeroes.tsx`. Tests: `server/tests/accountsDb.test.ts`, `server/tests/heroesDb.test.ts`.

**Show it.** Open [accounts.md](accounts.md) at "What Tiger Data does for the game" and `server/lib/heroes.ts` for the SQL. On a laptop with the database set: `/api/account/status` answers `{"available":true}`.

**Limits.** **A player cannot see it on `main`.** Nothing outside `src/account/` imports the sign-in dialog or the hall board, so the Account page shows neither. Accounts are off unless the server has `DATABASE_URL`. To confirm whether the team enters this track at all with the feature not on a screen.

## 5. Cursor / SpaceXSI

**What is in the repo.** `.cursor/rules/odyssey-dojo.mdc`: the team's house rules as a Cursor rule file, set to always apply, so they load when the repo is opened in Cursor. That is all the repo shows.

**Limits.** Do not say any feature was built with Cursor: nothing in the repo records that. To confirm with the team who used Cursor, for what, and what this track asks for.

## 6. General tracks: what is real and playable today

From [ARCHITECTURE.md](ARCHITECTURE.md), [FEATURES.md](FEATURES.md) and [pitch.md](pitch.md), checked against the code:

- **A full game with your body or the keyboard.** Six stops in the Odyssey's order, five fighting styles, 26 moves, each with a line on what it is for in self-defense ([moves.md](moves.md)). Pose tracking runs in the browser; every move also has a key.
- **Training Dojo with pick-your-moves.** The Dojo card on the main menu opens a setup step where you tick the moves to practise and the tries at each (`src/coach/ui/DojoSetup.tsx`, `src/coach/catalog.ts`), then grades every try and gives one tip ([dojo.md](dojo.md), [dojo-moves.md](dojo-moves.md)).
- **Online rooms.** Host a room, a friend joins with a four-letter code or a QR code from a laptop or a phone, and strikes thrown together do double damage ([rooms.md](rooms.md), `src/net/`, `server/routes/rooms.ts`).
- **Two players on one camera: the logic is merged, the card is not on `main`.** `src/duo/` and its tests (`tests/duoAssign.test.ts`, `tests/duoLink.test.ts`) are in. `src/screens/Multiplayer.tsx` does not mount `DuoCard`; it has Host, Join and FaceTime only. [duo.md](duo.md) lists the four lead-file changes that turn it on. Do not show it as playable until those land.
- **Athena's coaching and the god scan** as in section 4, and a FaceTime friend as in section 1.

**Limits.** [FEATURES.md](FEATURES.md) "Not done" says no full webcam fight on a real body on the demo laptop was recorded in the repo, and detectors were tested on made-up poses. To confirm that this has been done since.

## Before you submit

Tracks to tick on Devpost:

- [ ] Best Use of FaceTime (Chert). [facetime-demo.md](facetime-demo.md) says this one is judged live with an iPhone.
- [ ] Vultr (MLH).
- [ ] GoDaddy Registry (MLH), once MLH confirms a `.club` name counts.
- [ ] Gemini (MLH). The Devpost draft still has `[confirm: whether the team entered the Gemini track]`.
- [ ] ElevenLabs (MLH). The draft has the same `[confirm]` tag.
- [ ] Tiger Data, Cursor / SpaceXSI: only if the team decides to, given the limits above.
- [ ] The general HackUTA tracks the team picks (to confirm the exact names on Devpost).

Links to paste:

- [ ] Live demo: `https://odysseydojo.club`. Open it yourself first.
- [ ] Repo: `https://github.com/toyeshhm/odyssey-dojo`. The Devpost draft says it is private; to confirm it is public, or that judges have access.
- [ ] Demo video: to confirm the URL.

Last checks:

- [ ] The "to confirm" lines above are each answered or left out of the Devpost text.
- [ ] The Devpost draft's "What's next" says nobody has run FaceTime on a real call. That is out of date: fix it in [devpost/devpost.md](devpost/devpost.md) (its owner does that) before pasting.
- [ ] No keys, phone numbers or join codes in anything you paste.
