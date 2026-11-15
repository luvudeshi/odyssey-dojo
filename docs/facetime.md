# Call a friend on FaceTime

A third way to play together. The host types a friend's phone number. The friend's iPhone rings with a FaceTime call. No app. The friend sees the fight on the phone and strikes with their own body in front of the phone's camera.

**Read this first: none of this has been on a real call.** No phone has rung. A teammate ran the stand-in path against a real LiveKit room; the fixes that came out of that run (hang up closing the room, the wider margins, the plate's last line) were written with no keys and have not been back on a real room. What was run is listed under Tested. What was only written from Chert's setup page or LiveKit's docs is listed under Not tested.

## How it works

Chert bridges each FaceTime call into a LiveKit room. The game's browser tab joins that room as the agent.

1. The host presses Call on the card. The game server makes a room name and signs two LiveKit tokens: one for the game tab, one for Chert's bridge.
2. The tab joins the room and publishes two tracks before the phone rings: a camera track (the picture for the phone) and a microphone track (the game's sound). Chert sends video only when the speaking participant has a camera track.
3. The server asks Chert to place the call (`POST /api/v1/calls`, `customer_managed`, audio and video on).
4. When the room's metadata says `chert_bridge_ready`, the tab plays a chime at once and Athena's greeting. Chert wants a greeting within 10 seconds of that moment, not of joining. If the friend's video arrives and no such metadata is seen for 3 seconds, the tab greets anyway.
5. The friend's camera track is read by the same pose model the webcam uses. Their strikes go into the fight as the second fighter. Only the host defends, as in a room.
6. At 4:45 Athena says goodbye. At 5:00 the call is ended. The trial limit is 5 minutes a call.
7. Ending a call, by anyone and for any reason, does two things: the tab leaves the room, and the server deletes the room at LiveKit (see Hang up). The second drops Chert's bridge, which leaving alone does not.

What the phone gets is a 720 by 1280 picture at 20 frames a second: the monster's name, the time left, both health bars, the fight itself, then a large card with the move to do, a stick figure of it, and a timer bar. Add `?ftframe=landscape` to the game's address for a wide picture (phone held sideways).

A phone's screen is longer than 16:9. If FaceTime fills the screen with the picture, the long sides are cut: about 65 px off the left and right of the upright picture on a 393 by 852 screen. So nothing that must be read is within 72 px of those two edges (36 px on the other two). The wide picture has the same 72 px at its top and bottom.

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
| Server: tokens, Chert, closing a room, routes | `server/lib/facetimeToken.ts`, `facetimeChert.ts`, `facetimeRooms.ts`, `facetimeEnv.ts`, `server/routes/facetime.ts` |
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

   | Route | What it does |
   | --- | --- |
   | `GET /api/facetime/status` | Is FaceTime set up, which names are missing, and can a stand-in be used |
   | `POST /api/facetime/seat` | A new room and a token for the game's seat in it |
   | `POST /api/facetime/call` `{ to, room }` | Rings the phone and bridges the call into the room |
   | `POST /api/facetime/standin` `{ room }` | No phone: a token for the bridge's seat, for the stand-in page |
   | `GET /api/facetime/call/:id` | How the call is doing |
   | `POST /api/facetime/hangup` `{ room }` | Deletes the room at LiveKit, which drops everyone in it |

   A `POST` must have `Content-Type: application/json` or it gets 415. A page of another site open in the same browser can post plain text here without asking, but not JSON.

4. Check the setup without spending a minute. With the server running:

   ```
   curl http://localhost:8787/api/facetime/status
   ```

   `{"ready":true,"missing":[]}` means all six are found. Otherwise `missing` lists the names that are not set. It never shows a value.

5. The card is on the Multiplayer screen (see Mount below).

## Test with LiveKit only (no Chert line)

For when there is a LiveKit project and no Chert line yet. A browser window plays the friend's phone. It joins the call's real room in the seat the FaceTime bridge would take, so everything on the game's side runs against a real room: the token, the join, the published picture and sound, the friend's camera read into strikes, the clocks, both ways of hanging up.

A teammate ran these steps against a real room and every sign below came up. That was before hang up deleted the room and before the plate moved; those have not been back on a real room. See Tested and Not tested.

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
- The card says "The game can see your friend." That is the pose model finding a body in the stand-in's camera. If it says "The camera is on, but no body is in view", step back until your upper body is in the picture. Do not start the fight on that line: the punches will not land.
- Press "Start the fight" on the card. The phone frame shows the fight, the health bars and the move cards.
- On a strike card, step back from the Mac's camera until your upper body is in the small picture and punch. The game shows "YOU + FRIEND" and the monster takes the hit.
- Press Hang up in the stand-in window. The card says "Your friend hung up." In a fight the card is not on screen, so the plate at the bottom right says it for six seconds.
- Do it again and press Hang up on the game's side (the card, or the plate at the bottom right during a fight). The stand-in window says the game left and the call is over.
- In the LiveKit dashboard, the room `odyssey-dojo-` plus 12 letters and digits has two participants, `odyssey-dojo` and `facetime-bridge`. After a hang up from either side the room is gone at once, not only when both have left: the server's log has a `facetime_room_closed` line. Look at the room's participants, not the list of rooms: the list can lag a few seconds.

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
   - A small plate at the bottom right of the game shows the time left and a Hang up button. If the call ends or drops during the fight, the plate says why for six seconds.
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
- **The call does not end when the game hangs up.** The game leaves the room and the server deletes the room (see Hang up), so the bridge is dropped. Whether Chert then ends the FaceTime call on the phone is not known. If it does not, and Chert has an end-call request, add it to the hang up route in `server/routes/facetime.ts`.
- **The server's log says `facetime_room_not_closed`.** LiveKit refused the delete or was not reached. The status is in the line. 401 or 403 means the key and secret are not from the project `LIVEKIT_URL` points at.

## Answer a call (what works on the trial)

The other way round: the friend FaceTimes the game's Chert line and the game answers. It needs no Chert API key and no setting in Chert's console, so it is the path a trial line can take. **It has not been on a real FaceTime call yet either.** What was run is at the end of this section.

### How Chert hands a call over

Read from the code of `chert dev` (0.1.0-beta.21) and seen running:

1. `chert dev --agent odyssey-dojo` holds the line. It keeps one waiting room ready in our LiveKit project, named `chert-warm-<id>`, with the agent of that name in it. It makes a new one about every five minutes and after every call, and deletes the old one.
2. A waiting room takes two people beside the agent (`max_participants` 2), and LiveKit closes it two seconds after the last of them leaves (`departure_timeout` 2).
3. A FaceTime call comes into the room as the participant `chert-bridge-<call id>`. A call that finds no waiting room is put in a room named `chert-<operation id>`, and the agent has about five seconds to get there.
4. When FaceTime is up, the room's metadata becomes `{"chert_call":"<id>","chert_bridge_ready":true,"at":"..."}`. Something must be heard within 10 seconds of that, or Chert ends the call (`remote_audio_timeout`). A greeting when the caller joins is too early.
5. Sound is taken from exactly one participant, and a second one that publishes sound ends the call. The picture is taken only from that same participant.
6. A trial call lasts 5 minutes.

### What the game does

- **The agent is silent.** `scripts/chert/bridge.mjs` is the LiveKit agent `chert dev` puts in each room. It publishes nothing and subscribes to nothing. It is there because Chert only answers a call when the named agent is in the room. The game's browser tab is the one participant that publishes the sound and the picture.
- **The server finds the room.** `GET /api/facetime/waiting` (this machine only) asks LiveKit which `chert-` room has our agent in it: a room with a caller first, else the newest `chert-warm-` room. It answers `{ url, token, room, identity, caller, ready, line }`, or `{ room: null, reason }`. The token is for the game's seat (`odyssey-dojo`) in that one room, for ten minutes. The two questions (ListRooms, ListParticipants) only read. Code: `server/lib/chertWaitingRoom.ts`, `server/routes/facetimeWaiting.ts`.
- **The tab waits in the room.** Press "Wait for a FaceTime call" on the card. The tab joins the waiting room and publishes nothing. When the room is replaced it goes to the next one by itself.
- **The tab answers.** When `chert-bridge-...` comes in, the tab publishes the picture (`odyssey-dojo-fight`) and one sound track (`odyssey-dojo-sound`, with the host's microphone inside it), as a dialled call does. On the ready sign it plays the three notes and Athena. If the caller's camera is there and no sign comes for 8 seconds it greets anyway, and greets again if the sign comes later.
- **After the call** the tab leaves the room. It never deletes it: the room is Chert's (`POST /api/facetime/hangup` refuses it). It then waits in the next room, with no reload.
- Code in the page: `src/facetime/answer.ts`, `answerBrowser.ts`, `ui/AnswerPanel.tsx`, and `answer()` in `session.ts`.

### The two processes that must run

On the computer that holds the line, both from Chert's starter folder (made once with `npx @trychert/facetime new odyssey-dojo --video`, outside this repo; copy `scripts/chert/bridge.mjs` and `scripts/chert/room-note.mjs` into it):

```sh
node --env-file=<repo>/.env bridge.mjs start                                        # terminal 1: the silent agent
npx @trychert/facetime dev --agent odyssey-dojo --env-file <repo>/.env              # terminal 2: holds the line
```

`.env` holds `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` of one LiveKit project. The game's server reads the same three. Add `FACETIME_LINE_NUMBER=<the line's number>` to show the number on the card; without it the card says "your Chert line". A trial line with no agent connected goes back to Chert's pool, so both stay open until the demo is over.

### The room note

The agent also writes the room down: `{"room":"chert-warm-...","caller":null,"ready":false,"at":"..."}` in the file `ODYSSEY_ROOM_FILE` names (the server reads `FACETIME_ROOM_FILE`, else `~/.chert/odyssey-dojo-room.json`). The server uses it only when LiveKit cannot be asked, and only if it names a `chert-` room and was written in the last 8 minutes.

The first version of the agent wrote one room and let the last writer win. Each room is its own process and they overlap, so after every change of room the note said `"room": null` while a new room was waiting. That is why LiveKit is asked first. `room-note.mjs` keeps every open room and names the one with a caller, else the newest. **An agent that was started before this change still writes the old note; it works, because the note is only the second way.**

### Rules for the demo

- **One tab waits, never two.** The room has two seats beside the agent: the game and the caller. A second thing in the waiting room (another tab under another name, a test page) leaves no seat for the call. A second tab of the game takes the first one's seat, and the first says so and stops.
- **Do not leave the waiting room just before the call.** "Stop waiting", a reload or closing the tab makes LiveKit close the room 2 seconds later. `chert dev` had the next one ready 6 to 10 seconds after that, twice out of twice. Press "Wait for a FaceTime call" and leave it.
- Keep the game's tab in front for the whole call (a hidden tab stops drawing).
- The caller's iPhone must have joined the line (it texts the join code to the line's number once).

### The demo, step by step

1. Both terminals above are running. `chert dev` says the agent is in a waiting room.
2. The game's server and the game are running on the same computer. Open Multiplayer.
3. Press "Wait for a FaceTime call". Allow the microphone. The card says "Waiting for a FaceTime call." and shows the number.
4. The friend calls the number on FaceTime **Video**.
5. The card says "A FaceTime call is coming in. Connecting...", then "Your friend is on the call. Start the fight." The friend hears three notes and Athena and sees the game.
6. Press "Start the fight" and play as on a dialled call. The plate at the bottom right has the clock and Hang up.
7. When the call ends the card says so for five seconds and goes back to "Waiting for a FaceTime call." for the next caller.

In the `chert dev` terminal a good call reads: `Incoming FaceTime Video call.`, `Answered in ... s.`, `FaceTime is ready. ...`, then `Video and audio are coming from "odyssey-dojo".`

### Run so far

- Unit tests: `tests/facetimeAnswer.test.ts` (the tab) and `server/tests/facetimeWaiting.test.ts` (the server and the agent's note).
- In headless Chrome against the **real** waiting room of the held line: the route named the room, the card's button put `odyssey-dojo` in it beside the agent with no tracks, it stayed through a change of room (back in the new room about 4 seconds after the old one closed), and "Stop waiting" left it.
- A whole call in rooms of our own (not Chert's), with a browser as `chert-bridge-test` and the ready sign written by hand: one picture and one sound published when the caller came in, silence until the sign, the first sound heard at the other side 256 and 286 ms after the sign was sent, the friend hanging up, the next room, a second call.
- Seen from outside (ListRooms and ListParticipants only) while a teammate's test page was on a real call at 3:12 AM Sunday: the call's participant was `chert-bridge-<uuid>` with the tracks `facetime-remote-video` (1280 by 720) and `facetime-remote-audio`; the metadata was `{"chert_call":"...","chert_bridge_ready":true,"at":"..."}`; the next waiting room was made when the call was answered; a third participant that was not the agent published the picture and the sound, and the call was still up 70 seconds after the ready sign. Asked during that call, `GET /api/facetime/waiting` named the call's room with the caller and `ready: true`.
- **Not run:** a real FaceTime call answered by the game itself.

## Hang up

Leaving the room is not enough. Chert's bridge is a participant too. While it stays, the room stays, the call can stay up on the friend's phone, the line stays busy for the next call, and the trial's minutes keep running. On a real room the bridge's seat was still listed 3 seconds after the game left.

So every end of a call (Hang up on the card or the plate, the friend leaving, the five minutes, a refused or unanswered call, a lost room, the page closing) also sends `POST /api/facetime/hangup { room }`. The server then asks LiveKit to delete the room:

- `POST https://<the host of LIVEKIT_URL>/twirp/livekit.RoomService/DeleteRoom` with the JSON body `{"room": "<name>"}`.
- `Authorization: Bearer <token>`, a token signed on the server with the grant `video: { roomCreate: true }`. It names no room and no person, lives 60 seconds, and goes only to LiveKit.
- A 404 is tried once more after 0.7 seconds: a delete sent in the first second after a join answered 404 once on a real room. A second 404 means the room is already gone, which is fine.

The route only closes a room this server put a call or a stand-in into, and remembers each for 30 minutes. Any other name gets 400 and LiveKit is not asked. The page gets back one word (`deleted` or `gone`), never the token or LiveKit's reply. When the page is closing, the request is sent with `keepalive` so the browser finishes it.

If the delete fails, the call still ends on the game's side as before, and the room closes by itself once the bridge leaves.

## The loopback page

`tools/facetime/index.html` runs the whole thing in one tab with nothing real behind it: a fake room, a fake server, and a drawn "friend" whose picture goes through a real video track into the real pose path. Run `npm run dev` and open `/tools/facetime/index.html`. The right side shows the published picture in a phone shape, the made-up friend's camera, and counters. `?frame=landscape` sends the wide picture; `?left=20` starts with 20 seconds on the clock to see the goodbye and the end.

## Mount

The card is on the Multiplayer screen, mounted by the lead. `/tools/facetime/real.html` on the dev server has the same card with the real session on a page of its own.

The card is self-contained. It shows a title ("Call a friend on FaceTime"), one line of text, a phone number box and one button (Call). During a call the same card shows the status, "Start the fight" and "Hang up". If the server has no keys it shows one line: "FaceTime is not set up on this server." If only the three LiveKit names are set, it adds a "Test without a phone" button under that line (see Test with LiveKit only).

It takes one prop, `onStart`. The mount line is:

```tsx
<FaceTimeCard onStart={(link) => { props.onOpen(); props.onStart(link); }} />
```

Why both calls: the flow only takes a friend's link while it is on `host`, so it must pass through `host` (`onOpen`) before `onStart`, or the fight starts solo and the friend is never in it. Both land in one render, so no room is opened. Passing `props.onStart` alone looks right and is wrong: the phone shows "STAND BACK" for the whole fight.

## Sound

The game's sound goes to the phone as one stream: `gameSoundStream()` in `src/audio/soundOut.ts`. `src/facetime/browserSession.ts` passes it to `startCallAudio` and closes it with `stopGameSoundStream()` when the call ends. The stream holds its peaks under full scale, which the older way did not (8 clipped windows in 30 seconds on a real room). The chime, Athena's greeting and goodbye, and the host's microphone are added after it.

The older way is still in `src/facetime/callAudio.ts` and is used only when no stream is passed (the loopback page): it wraps `AudioNode.connect` and `HTMLMediaElement.play` and copies what goes to the speakers into the call.

The goodbye at 4:45 has no bundled line. If `/api/speech` gives nothing, the friend hears only the three notes. None of the clips in `public/audio/athena` is a goodbye, so none is used.

The host's microphone is sent to the phone only. The friend's voice plays on the computer.

## Limits

- One call at a time. A trial call is 5 minutes; the trial has 50 minutes in all.
- The Call button is outbound. For a friend to call the game, see "Answer a call": a small silent worker is the agent `chert dev` wants, and the tab joins the room that worker is in.
- The friend only strikes. Blocks and dodges stay with the host, as in a room.
- The keys stay on the server. The page gets only a short-lived token for its own seat in one room.

## Tested

- Unit tests: `npx vitest run tests/facetime server/tests/facetime` (eight files). They cover the call steps and timers, the phone number check, the bridge-ready parser, the picture layout and HUD words, the session with a fake room, token signing, the Chert request shape (against a fake fetch), and the routes over real HTTP on this machine.
- Hang up, with a fake fetch in place of LiveKit: the address, the body, the `roomCreate` grant, one retry on 404 and no more, a room this server did not use is refused without asking LiveKit, a failure is a plain 502, and no token, key or LiveKit reply is in any answer or log line. The session asks for the room to be closed on every kind of ending, once.
- Every FaceTime route, hang up included, answers 403 to a request that was passed on, through the real app. A `POST` that is not JSON gets 415 and takes no seat.
- The card's three lines about the friend's camera (waiting, no body in view, can see your friend), with a made-up pose reader.
- The margins: everything readable is inside the part of the picture a 393 by 852 screen shows when it fills, for both shapes.
- The loopback page in headless Chrome: the call reaches "playing", the published track is 720 by 1280 and readable, sound goes out, and the made-up friend's strikes land in the real fight. With `?leave=4` the friend hangs up in the fight and the plate says "Your friend hung up." and then goes.
- By a teammate, on a real LiveKit room with a browser as the friend, before these fixes: the join, both published tracks, 720 by 1280 at about 20 frames a second with no loss, the friend's camera read by the pose model, the 3 second fallback, both ways of hanging up, and the five-minute cap.
- The card on the Multiplayer screen, with and without setup.
- The stand-in path, with made-up LiveKit settings and no real room. Unit tests: the stand-in route gives a token for `facetime-bridge` in the seat's room, good for 10 minutes, uses the room up, sends nothing to Chert and is not an open path; the session opens the room, asks for the stand-in's seat, places no call and never polls; the link carries the seat after the `#` and reads it back. In headless Chrome: the stand-in page with no link, with a good link, with an old link, and with a room address that does not exist (it says the room could not be joined and what to check; the token is not shown); the card on `real.html` with only the LiveKit names set shows the button, and a room that cannot be joined fails the call with a plain line.

## Not tested

- **No real FaceTime call.** Nothing has rung a phone.
- **Hang up against a real room.** The route was written from LiveKit's docs and a teammate's one manual DeleteRoom (200, and the participant was dropped 128 ms later). The route itself, its retry, and the `keepalive` request on a closing page have only met a fake fetch.
- **Whether Chert ends the FaceTime call when its bridge is dropped from the room.**
- **The game's sound through `gameSoundStream()` on a call.** The switch type-checks. It was not heard on a real room or in the loopback page, which uses the older way.
- **How FaceTime shows the picture.** The 72 px margins answer a simulation of a filled screen, not a phone. If the picture arrives small inside a wide one, use `?ftframe=landscape`.
- **No Chert account.** The request body, the error words, the call status words and the meaning of `remote_participant_identity` are from the setup page, not from a reply.
- **The bridge-ready signal** and the bridge's track names were never observed.
- Pose reading on a real phone picture (portrait, compressed, a person far away). The loopback's friend is a drawing with a stand-in detector.
- Echo on a real call (the game's sound coming back through the phone's microphone).
- Safari and Firefox. Only Chrome was run.
