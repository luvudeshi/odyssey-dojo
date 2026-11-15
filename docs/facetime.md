# Call a friend on FaceTime

A third way to play together. The host types a friend's phone number. The friend's iPhone rings with a FaceTime call. No app. The friend sees the fight on the phone and strikes with their own body in front of the phone's camera.

**Read this first: none of this has been on a real call.** It was built with no Chert account, no LiveKit room and no iPhone. What was run is listed under Tested. What was only written from Chert's setup page is listed under Not tested.

## How it works

Chert bridges each FaceTime call into a LiveKit room. The game's browser tab joins that room as the agent.

1. The host presses Call on the card. The game server makes a room name and signs two LiveKit tokens: one for the game tab, one for Chert's bridge.
2. The tab joins the room and publishes two tracks before the phone rings: a camera track (the picture for the phone) and a microphone track (the game's sound). Chert sends video only when the speaking participant has a camera track.
3. The server asks Chert to place the call (`POST /api/v1/calls`, `customer_managed`, audio and video on).
4. When the room's metadata says `chert_bridge_ready`, the tab plays a chime at once and Athena's greeting. Chert wants a greeting within 10 seconds of that moment, not of joining. If the friend's video arrives and no such metadata is seen for 3 seconds, the tab greets anyway.
5. The friend's camera track is read by the same pose model the webcam uses. Their strikes go into the fight as the second fighter. Only the host defends, as in a room.
6. At 4:45 Athena says goodbye. At 5:00 the tab leaves the room, which ends the call. The trial limit is 5 minutes a call.

What the phone gets is a 720 by 1280 picture at 20 frames a second: the monster's name, the time left, both health bars, the fight itself, then a large card with the move to do, a stick figure of it, and a timer bar. Add `?ftframe=landscape` to the game's address for a wide picture (phone held sideways).

Where the code is:

| Part | File |
| --- | --- |
| Call steps and timers (pure) | `src/facetime/callMachine.ts` |
| The whole call, with its parts passed in | `src/facetime/session.ts` |
| The real room (the only file that uses `livekit-client`) | `src/facetime/livekitRoom.ts` |
| Reading the friend's body | `src/facetime/remotePlayer.ts` |
| The friend as second fighter (a `HostLink`) | `src/facetime/friendLink.ts` |
| The picture for the phone | `src/facetime/compositor.ts`, `frameLayout.ts`, `frameHud.ts`, `frameDraw.ts` |
| The sound for the phone | `src/facetime/callAudio.ts` |
| The card | `src/facetime/ui/FaceTimeCard.tsx` |
| Server: tokens, Chert, routes | `server/lib/facetimeToken.ts`, `facetimeChert.ts`, `facetimeEnv.ts`, `server/routes/facetime.ts` |
| Loopback page (no account needed) | `tools/facetime/index.html` |
| Stand-in friend (LiveKit only): the link, the friend's page, the card on its own page | `src/facetime/standIn.ts`, `tools/facetime/standin.html`, `tools/facetime/real.html` |

## Set up (Mac or Windows)

You need a Chert account with a line, the LiveKit project Chert's setup gives you, and an iPhone to call.

1. Put these six names in `.env.local` in the repo's top folder (`.env` works too). Values come from Chert's dashboard and the LiveKit project. Never commit this file and never paste a value into chat, an issue or a log.

   ```
   CHERT_API_KEY=
   CHERT_PROJECT_ID=
   CHERT_LINE_ID=
   LIVEKIT_URL=
   LIVEKIT_API_KEY=
   LIVEKIT_API_SECRET=
   ```

   `LIVEKIT_URL` is the `wss://` address. `CHERT_LINE_ID` is the id of the line to call from; `GET https://app.trychert.com/api/v1/lines` with your key lists them.

2. On a trial line, the friend must text the line's number once from the iPhone. Chert only calls verified phones.

3. Install and run:

   ```
   npm install
   npm run dev:all
   ```

   This starts the page (Vite) and the game server together. The `/api/facetime` routes answer only to this machine.

4. Check the setup without spending a minute. With the server running:

   ```
   curl http://localhost:8787/api/facetime/status
   ```

   `{"ready":true,"missing":[]}` means all six are found. Otherwise `missing` lists the names that are not set. It never shows a value.

5. Mount the card (see Mount below) if it is not on the Multiplayer screen yet.

## Test with LiveKit only (no Chert line)

For when there is a LiveKit project and no Chert line yet. A browser window plays the friend's phone. It joins the call's real room in the seat the FaceTime bridge would take, so everything on the game's side runs against a real room: the token, the join, the published picture and sound, the friend's camera read into strikes, the clocks, both ways of hanging up.

**This has not been run against a real room either.** It was built with no LiveKit keys. See Tested and Not tested.

Steps on a Mac, in Terminal, from the repo's top folder:

1. Get the branch and install:

   ```
   git fetch origin
   git checkout facetime-call
   git pull
   npm install
   ```

2. Put the three LiveKit names in `.env.local` (or `.env`) in the top folder. Leave the three `CHERT_` names out. Never commit this file and never paste a value anywhere.

   ```
   LIVEKIT_URL=
   LIVEKIT_API_KEY=
   LIVEKIT_API_SECRET=
   ```

3. Start the page and the game server:

   ```
   npm run dev:all
   ```

4. In a second Terminal window, check the setup:

   ```
   curl http://localhost:8787/api/facetime/status
   ```

   You want `"standIn":true`. With no Chert names it reads `{"ready":false,"missing":["CHERT_API_KEY","CHERT_PROJECT_ID","CHERT_LINE_ID"],"standIn":true}`. If `standIn` is false, `missing` names a LiveKit setting that was not found. Restart `npm run dev:all` after changing the file.

5. Open Chrome at `http://localhost:5173/tools/facetime/real.html`. This is the real card on a page of its own, with the real server, room, picture, sound and pose model behind it. (Once the card is mounted on the Multiplayer screen, the same works there.) The host has no camera on this page and defends with the keyboard.

6. The card says FaceTime is not set up and shows **Test without a phone**. Press it. Allow the microphone if asked. The card changes to "Waiting for the stand-in friend" and shows a link.

7. Press **Open the stand-in phone**. A second window opens. Put it beside the game's window. Do not cover the game or switch its tab away: a hidden tab stops drawing the picture.

8. In the new window press **Answer**. Allow the camera and the microphone. Wear headphones or press Mute, or the game's sound loops through the microphone. You have one minute from step 6; after that the game gives up as it does on an unanswered phone.

What to look for, in order:

- The stand-in window shows the game's picture in the phone frame, with "GET READY". The list beside it reads: Game in the room `odyssey-dojo`; Game's picture "yes, named odyssey-dojo-fight, 720 x 1280"; Game's sound "yes, named odyssey-dojo-sound"; My camera sent "yes".
- About 3 seconds after the camera is sent, the stand-in window plays three rising notes and then Athena. The game's card says the friend is on the call and shows the time left.
- The card says "The game can see your friend." That is the pose model reading the stand-in's camera out of the room.
- Press "Start the fight" on the card. The phone frame shows the fight, the health bars and the move cards.
- On a strike card, step back from the Mac's camera until your upper body is in the small picture and punch. The game shows "YOU + FRIEND" and the monster takes the hit.
- Press Hang up in the stand-in window. The card says "Your friend hung up."
- Do it again and press Hang up on the game's side (the card, or the plate at the top left during a fight). The stand-in window says the game left and the call is over.
- In the LiveKit dashboard, the room `odyssey-dojo-` plus 12 letters and digits has two participants, `odyssey-dojo` and `facetime-bridge`, and closes when both have left.

If it fails:

- The card says "The game could not join the call's room": the game's own join failed. The URL must be the `wss://` address, and the key and secret must be from the same LiveKit project.
- The stand-in window says "The room could not be joined": the same check. Its token is signed by the same server with the same secret.
- The stand-in window says the link is too old: a token lasts 10 minutes. Press Test without a phone again.
- "Nobody picked up" on the card: the minute ran out, or the stand-in's camera was not allowed. The game counts the call as answered only when it sees the friend's camera.

With all six names set, the card shows only the real Call form. Add `?ftstandin=1` to the address to get the stand-in button back.

What this does NOT prove:

- **Chert's request.** `POST /api/v1/calls` is never sent. Its body, its headers, its error words, its call states and the meaning of `remote_participant_identity` stay unchecked.
- **Ringing.** No phone rings, nothing is answered or declined, and nobody is asked how the call is doing.
- **The bridge's ready sign.** A participant's token cannot write the room's metadata, so `chert_bridge_ready` is never sent. The game takes its 3 second fallback every time here. What the real metadata looks like, and whether `bridgeReady()` reads it, is still unknown.
- **The bridge's identity and track names.** The stand-in joins as `facetime-bridge` and publishes a browser's camera and microphone tracks. What Chert's bridge calls itself and its tracks was never seen. Whether Chert sends the phone the game's picture (it wants a camera track from the speaking participant) is not shown either.
- **A phone's picture.** The stand-in sends a wide, clean webcam picture from a Mac. A phone sends a tall, compressed one, with a person further away. Pose reading on that is still untested.
- **The 10 second greeting rule and the 5 minute limit** as Chert enforces them. The game's own clocks run; nobody on the other side cuts the call.
- **Echo on a real call**, and Safari and Firefox.

## Place the first call

1. Open the game in Chrome on the computer. Go to Multiplayer.
2. In "Call a friend on FaceTime", type the number with its country code, for example `+1 555 555 0100`. Press Call. Allow the microphone if asked.
3. What to look for, in order:
   - The card says it is calling. The phone rings within a few seconds.
   - The friend answers. Within 10 seconds they hear three rising notes and then Athena.
   - The phone shows the game's picture with "GET READY".
   - The card says the friend is on the line. Press "Start the fight", pick a style and a boss.
   - A small plate at the top left of the game shows the time left and a Hang up button.
   - On a strike card the friend punches at the phone. The game shows "YOU + FRIEND" and the monster takes the hit.
4. Keep the game's tab in front for the whole call. A hidden tab stops drawing, and the phone's picture freezes.
5. The friend should prop the phone up and step back until the whole upper body is in view.

If something fails, the card says which step: not set up, a bad number, the line is busy, the number is not verified, nobody answered, or the room could not be joined. The server logs the step and Chert's status code. It never logs the number or a key.

### If the first call does not work

These are the places that were guessed. Each is one small change.

- **Call is refused with a 4xx about the participant.** `remote_participant_identity` in `server/lib/facetimeChert.ts` is sent as the game's identity (`odyssey-dojo`). If Chert means the bridge's own identity, change that one line to the bridge identity.
- **The friend hears nothing for 10 seconds and Chert drops the call.** Log the room metadata in `src/facetime/livekitRoom.ts` and compare it with `bridgeReady()` in `src/facetime/bridge.ts`. It accepts the bare word `chert_bridge_ready`, a JSON flag of that name, and a JSON `state`/`status`/`event`/`phase`/`bridge` with that value. If Chert signals it another way (a participant attribute, say), add it there.
- **Audio but no video on the phone.** The picture is published with source Camera from the same participant that publishes the sound. Check in the LiveKit dashboard that the room has both tracks from `odyssey-dojo`.
- **The card never leaves "calling".** `remoteState()` in `server/lib/facetimeChert.ts` maps Chert's call status words to ringing, live and over. Compare with what `GET /api/v1/calls/{id}` really returns.
- **The call does not end when the game hangs up.** No hang-up request is known. The game ends a call by leaving the room. If Chert has an end-call request, add it to `server/routes/facetime.ts`.

## The loopback page

`tools/facetime/index.html` runs the whole thing in one tab with nothing real behind it: a fake room, a fake server, and a drawn "friend" whose picture goes through a real video track into the real pose path. Run `npm run dev` and open `/tools/facetime/index.html`. The right side shows the published picture in a phone shape, the made-up friend's camera, and counters. `?frame=landscape` sends the wide picture; `?left=20` starts with 20 seconds on the clock to see the goodbye and the end.

## Mount

To try the card before it is mounted, open `/tools/facetime/real.html` on the dev server: the same card with the real session, on a page of its own.

The card is self-contained. It shows a title ("Call a friend on FaceTime"), one line of text, a phone number box and one button (Call). During a call the same card shows the status, "Start the fight" and "Hang up". If the server has no keys it shows one line: "FaceTime is not set up on this server." If only the three LiveKit names are set, it adds a "Test without a phone" button under that line (see Test with LiveKit only).

It takes one prop: `onStart`, the same function the Host card's "Start" uses. Tested locally on the two-card screen, not committed:

```diff
 import { Icon } from "../account/ui/icons";
+import { FaceTimeCard } from "../facetime/ui/FaceTimeCard";
 import type { HostLink } from "../net/host";
@@
           <RoomJoin initialCode={props.code} onJoined={props.onJoined} />
         </section>
+        <FaceTimeCard onStart={props.onStart} />
       </div>
```

## Sound

The game has no single output today, so `src/facetime/callAudio.ts` listens from outside: it wraps `AudioNode.connect` and `HTMLMediaElement.play` and copies what goes to the speakers into the call. When `src/audio` has one stream for all game sound, pass it in and neither wrapper is used for the call. The change is one line in `src/facetime/browserSession.ts`:

```ts
startSound: () => startCallAudio({ gameSound: gameSoundStream }),
```

The host's microphone is sent to the phone only. The friend's voice plays on the computer.

## Limits

- One call at a time. A trial call is 5 minutes; the trial has 50 minutes in all.
- Outbound only. For a friend to call the game, Chert dispatches a named LiveKit agent worker through `chert dev`. A browser tab cannot be that worker. It would need a small Node worker that tells the game server the room name, and then the tab joins with a token from `/api/facetime/seat`. Not built.
- The friend only strikes. Blocks and dodges stay with the host, as in a room.
- The keys stay on the server. The page gets only a short-lived token for its own seat in one room.

## Tested

- Unit tests: `npx vitest run tests/facetimeCall.test.ts tests/facetimeFrame.test.ts tests/facetimeSession.test.ts tests/facetimeStandIn.test.ts server/tests/facetimeServer.test.ts server/tests/facetimeStandIn.test.ts`. They cover the call steps and timers, the phone number check, the bridge-ready parser, the picture layout and HUD words, the session with a fake room, token signing, the Chert request shape (against a fake fetch), and the routes over real HTTP on this machine.
- The loopback page in headless Chrome: the call reaches "playing", the published track is 720 by 1280 and readable, sound goes out, and the made-up friend's strikes land in the real fight.
- The card on the Multiplayer screen, with and without setup.
- The stand-in path, with made-up LiveKit settings and no real room. Unit tests: the stand-in route gives a token for `facetime-bridge` in the seat's room, good for 10 minutes, uses the room up, sends nothing to Chert and is not an open path; the session opens the room, asks for the stand-in's seat, places no call and never polls; the link carries the seat after the `#` and reads it back. In headless Chrome: the stand-in page with no link, with a good link, with an old link, and with a room address that does not exist (it says the room could not be joined and what to check; the token is not shown); the card on `real.html` with only the LiveKit names set shows the button, and a room that cannot be joined fails the call with a plain line.

## Not tested

- **No real FaceTime call.** Nothing has rung a phone.
- **No real LiveKit room.** `livekitRoom.ts` type-checks against `livekit-client` 2.24.1 and has never connected. The stand-in page (`tools/facetime/standin.tsx`) uses the same package and has never connected either. The steps under Test with LiveKit only are how to do it.
- **No Chert account.** The request body, the error words, the call status words and the meaning of `remote_participant_identity` are from the setup page, not from a reply.
- **The bridge-ready signal** and the bridge's track names were never observed.
- Pose reading on a real phone picture (portrait, compressed, a person far away). The loopback's friend is a drawing with a stand-in detector.
- Echo on a real call (the game's sound coming back through the phone's microphone).
- Safari and Firefox. Only Chrome was run.
