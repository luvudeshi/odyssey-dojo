# Prize tracks: what we used, and where the proof is

Part of issue #33. One page to copy from when you fill in Devpost, and to open when a sponsor judge says "show me where you used our thing".

Every path below was checked on `main` at PR #363. Each track has four parts: what we do with it, the files that prove it, what to show in 30 seconds, and the limits. **"To confirm" means the repo does not prove it.** Do not say it to a judge until somebody has checked.

The lines about the hosted copy (sections 2, 3, the Tiger Data part of 4, and rooms in 6) were brought up to date on Sunday 15 November, against `main` at PR #391 and the live site.

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

**What we do with it.** The game's server runs on one Vultr instance, in Docker, with Caddy in front of it for https. That server is the relay for online rooms: a visitor to `https://odysseydojo.club` can open a room or join one and play in it there. The game page itself is on Vercel (Hobby plan) and passes `/api/` on to the instance, which answers on `api.odysseydojo.club`.

**Proof in the repo.**

- `deploy/vultr/Dockerfile`, `deploy/vultr/docker-compose.yml`, `deploy/vultr/Caddyfile`, `deploy/vultr/setup.sh`, `deploy/vultr/.env.example`.
- [deploy-vultr.md](deploy-vultr.md): the steps, and "Run for real, once": a 1 vCPU / 2 GB instance in Dallas on Ubuntu 24.04, where Caddy got its own certificate and `https://odysseydojo.club` served the game from the instance. PR #386 (merged) brought it up to date for public rooms and accounts on the hosted copy.
- The room relay: `server/routes/rooms.ts`, `server/lib/rooms.ts`. What a hosted visitor may reach: `server/lib/localOnly.ts`.
- Rooms for visitors: `PUBLIC_ROOMS=1` on the instance (PR #373; `server/lib/localOnly.ts`, `server/lib/roomLimits.ts`, `server/tests/publicRooms.test.ts`, and "The hosted copy" in [rooms-tunnel.md](rooms-tunnel.md)).
- Rooms behind Vercel: the page's build long-polls for rooms (`VITE_ROOMS_POLL=1`, read in `src/net/transport.ts`, PR #382), because Vercel's proxy does not tell the server when a browser has gone.
- The check: `node scripts/rooms-smoke.mjs --url=https://odysseydojo.club` plays a room on the live site in two pages of headless Chrome.

**Show it in 30 seconds.** Open `https://odysseydojo.club` on any laptop: the padlock, then a keyboard fight. On a second laptop or a phone open the same address; one opens a room on the Multiplayer screen and the other types the code. Then open `deploy/vultr/docker-compose.yml` and point at the two services, `game` and `caddy`. If asked for more, show the instance in the Vultr dashboard (to confirm who has the login).

**Limits.**

- Checked on the live site on 15 November with the smoke script above: a fight plays to the same result on both pages, a guest who dropped is let back in after about 18 seconds, and a guest hears that the host left after about 38 seconds. Both pages were headless Chrome on one machine. Not checked: two real devices, a real phone, a camera on either side. Try the two-device room yourself before you show it to a judge.
- The waits are long because a page that only closes is noticed late behind Vercel. A leave call fixes that: the page now sends `POST /api/rooms/:code/leave` when a tab is shut (PRs #388, #390, #398). The waits above were not measured again with it.
- Everybody who comes through the same Vercel address counts as one caller for the room limits ([rooms-tunnel.md](rooms-tunnel.md)). A full hall may share one budget of rooms.
- The god scan, speech made on demand, replays and FaceTime answer 403 on the hosted copy. It is the offline game plus rooms.
- The Vercel config is on `main`: [`vercel.json`](../vercel.json) and [deploy-vercel.md](deploy-vercel.md).

## 3. GoDaddy Registry (MLH): the domain

**What we do with it.** The game lives at `https://odysseydojo.club`. The name opens the game page on Vercel, and `api.odysseydojo.club` is the Vultr instance, with Caddy in front of it for https. https matters here: a browser only gives a page the camera over https.

**Proof in the repo.**

- [deploy-vultr.md](deploy-vultr.md), step 3 "Point the domain at it" (it names GoDaddy as the registrar) and "Run for real, once" (it names `https://odysseydojo.club`). It was written when the name pointed straight at the instance.
- `deploy/vultr/Caddyfile` and `deploy/vultr/.env.example`: the one `DOMAIN` setting.

**Show it in 30 seconds.** Type `odysseydojo.club` in a browser. The game loads with a padlock.

**Limits.**

- `www.odysseydojo.club` answered with the game page on 15 November. Nothing in the repo sets it up, so give out the bare name.
- The worked example in the guide is `odysseydojo.us`; the real name is `odysseydojo.club`.
- `api.odysseydojo.club` is live, and `vercel.json` on `main` sends the page's `/api/` calls there.
- **To confirm with MLH that a `.club` name qualifies**, and that it was registered through the MLH GoDaddy Registry offer. The repo has no rule text and no receipt.

## 4. Gemini, ElevenLabs and Tiger Data

### Google Gemini (MLH): a fight from a sentence

**What we do with it.** No menu button opens this: the main menu's "Ask the Muse" button was taken out on 15 November, so it is reached only at `?ai=1`. That page opens "How do you fight?": the player types or says a sentence, our own server sends it to Gemini (`gemini-3.5-flash-lite`), and Gemini writes a fight: a title, what it heard, a named monster with its taunts, the place, the phases, and Homer's lines before and after. The page turns that into a fight on the normal fight screen. It is one call, text in and text out, made before the fight; the fight never waits on the network. The key stays on the server. With no key, or a slow or bad answer, the player gets one of five bundled fights ("A fight from the old songs").

**Proof.** `server/ai/gemini.ts` (the calls and the model names), `server/routes/level.ts` (`POST /api/level`), `src/ai/ui/museDoor.tsx` (the `?ai=1` door, drawn by `src/App.tsx`), `src/ai/ui/MuseRoute.tsx`, `src/ai/ui/StyleScreen.tsx`, `src/ai/fallbacks.ts` (the bundled fights), `tests/ai/museDoor.test.ts`, `server/tests/app.test.ts`. No pictures of it are on `main` (`docs/screenshots/muse/` is not there). [FEATURES.md](FEATURES.md) lists it as built, not on the menu.

**Show it.** On the demo laptop with the server and a key: open `http://localhost:5173/?ai=1`, type a sentence, press "Build my fight", and the card names the monster; then "Fight". `npm run preflight` prints a `gemini` line with the model that answered. Tried on 15 November: "like a Texas thunderstorm" came back from Gemini in 3.8 s as "The Wrath of Thrinacia", with the monster "Brontes the Squall".

**Limits.** Only where the server runs with a key. On the hosted copy the Muse gives a bundled fight and never reaches Gemini. A Muse fight starts on the keyboard; camera play inside it was not checked on 15 November, and no Muse fight was played through to its win or loss screen that day. The god scan, the older use of Gemini, is out of the game (PR #392): `POST /api/reveal` is still on the server and no game screen reaches it, so do not claim it.

### ElevenLabs (MLH): Athena, Homer and the monsters

**What we do with it.** Every voice line and sound effect was made ahead of time with ElevenLabs and ships with the game as files, so sound works with no network. Athena calls each defense and strike. Homer narrates. The monsters taunt.

**Proof.** The clips: `public/audio/athena/` (59 files), `public/audio/narration/` (13), `public/audio/taunts/` (16), `public/audio/sfx/` (18). The tools that made and checked them: `server/tools/genClips.ts`, `server/tools/hearClips.ts`, `server/ai/elevenlabs.ts`, `server/ai/voices.ts`. The lines: [athena-lines.md](athena-lines.md), [narration-lines.md](narration-lines.md). The speech-to-text check of all 82 voice clips: [audio-heard.md](audio-heard.md). Credits: `CREDITS.md`.

**Show it.** Start any fight with the sound up. Athena calls the first defense within seconds. Then open `public/audio/athena/` and `server/tools/genClips.ts`.

**Limits.** No ElevenLabs call happens during a fight; the clips are files. The one live route (`server/routes/speech.ts`, `POST /api/speech`) runs only on a laptop with a key. [audio-heard.md](audio-heard.md) says one clip, `athena/call_knee.mp3`, still needs a person to listen to it. The menu and fight music is not ElevenLabs: it is by Shane Ivers (CC BY 4.0). Only the win and loss stings came from the ElevenLabs music endpoint (see `CREDITS.md`).

### Tiger Data: accounts and the Hall of heroes

**What we do with it.** The server code for accounts (a hero name, a password, one saved game) and for a Hall of heroes (best scores, built on a hypertable, a continuous aggregate and `time_bucket_gapfill`) is written for Tiger Data and was run against a real Tiger Data service.

**Proof.** [accounts.md](accounts.md), above all "What Tiger Data does for the game" and "What was run against the real database". Code: `server/lib/db.ts`, `server/lib/accounts.ts`, `server/lib/heroes.ts`, `server/routes/account.ts`, `server/routes/heroes.ts`, `src/account/ui/AccountSignIn.tsx`, `src/account/ui/HallOfHeroes.tsx`. Tests: `server/tests/accountsDb.test.ts`, `server/tests/heroesDb.test.ts`.

**Show it.** Open [accounts.md](accounts.md) at "What Tiger Data does for the game" and `server/lib/heroes.ts` for the SQL. On a laptop with the database set: `/api/account/status` answers `{"available":true}`. The hosted copy has the database connected too: `https://odysseydojo.club/api/account/status` gave the same answer on 15 November, and the Hall of heroes route answered with an empty list.

**Limits.** The sign-in and the Hall of heroes are on the Account page (`src/screens/Account.tsx`). `PUBLIC_ACCOUNTS=1`, the setting that opens accounts to visitors on the hosted copy, is merged (PR #384). This page has no record of a sign-up on the live site: try one before you show it. Accounts are off unless the server has `DATABASE_URL`.

## 5. Cursor / SpaceXSI

**What is in the repo.** `.cursor/rules/odyssey-dojo.mdc`: the team's house rules as a Cursor rule file, set to always apply, so they load when the repo is opened in Cursor. That is all the repo shows.

**Limits.** Do not say any feature was built with Cursor: nothing in the repo records that. To confirm with the team who used Cursor, for what, and what this track asks for.

## 6. General tracks: what is real and playable today

From [ARCHITECTURE.md](ARCHITECTURE.md), [FEATURES.md](FEATURES.md) and [pitch.md](pitch.md), checked against the code:

- **A full game with your body or the keyboard.** Six stops in the Odyssey's order, five fighting styles, 26 moves, each with a line on what it is for in self-defense ([moves.md](moves.md)). Pose tracking runs in the browser; every move also has a key.
- **Training Dojo with pick-your-moves.** The Dojo card on the main menu opens a setup step where you tick the moves to practise and the tries at each (`src/coach/ui/DojoSetup.tsx`, `src/coach/catalog.ts`), then grades every try and gives one tip ([dojo.md](dojo.md), [dojo-moves.md](dojo-moves.md)).
- **Online rooms.** Host a room, a friend joins with a four-letter code or a QR code from a laptop or a phone, and strikes thrown together do double damage ([rooms.md](rooms.md), `src/net/`, `server/routes/rooms.ts`). On the hosted copy a visitor can open a room as well as join one; what was checked there is in section 2.
- **Two players on one camera: mounted, never tried with two real people.** `src/duo/` and its tests (`tests/duoAssign.test.ts`, `tests/duoLink.test.ts`) are in (PRs #357, #372, #381), and `src/screens/Multiplayer.tsx` mounts `DuoCard` beside Host, Join and FaceTime ([duo.md](duo.md) names the five files). It has only been tried with a fake camera and made-up bodies. Try it with two people on the demo laptop before showing it; the hosted copy has it only once it is deployed again.
- **Athena's coaching and the Muse's fight** as in section 4, and a FaceTime friend as in section 1.

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
