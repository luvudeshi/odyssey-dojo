# FaceTime demo script (Chert track)

For the "Best Use of FaceTime (Chert)" judging. The track is judged live. The judges look at three things: a fresh use of FaceTime video (this counts double), wow, and usefulness. The rule is that the agent makes or takes a real FaceTime call in the demo, and the team brings an iPhone.

Ours takes the call. A friend FaceTimes the line's number from an iPhone and the game answers. Athena sees the friend's body through the call, and the call shows the friend the fight.

**This script has not been run end to end. Run it twice before judging and change any step that does not match what happens.**

What has been seen on a real call so far, from the team's noticeboard:

- One real call from an iPhone to the line, 98.6 seconds long. Chert answered at once.
- A probe page in a browser was the thing the phone saw and heard. It sends the same picture and sound tracks the game sends.
- The ready sign came 7.6 seconds after the caller joined. Sound was already playing by then, so the call stayed up.
- The caller's picture reached the browser, 1280 by 720 (wide), about 15 frames a second.
- A second real call, at 03:21 on Sunday 15 November, 118.9 seconds long: **the game itself answered.** Its picture and its sound went out as the caller came in, the ready sign came 8.8 seconds later, and `chert dev` said the video and audio were coming from `odyssey-dojo`. The host started a fight. The caller hung up, the plate said "Your friend hung up.", and the game was waiting for the next call 0.4 seconds later. The details and the rules that call taught are in [facetime.md](facetime.md), "Answer a call".

What has not been seen on a real call:

- **A punch read from a phone's picture.** On the game's call no strike card was seen on the laptop, the monster stayed at 100 % and the host, who did not defend, was struck down in 65 seconds. This is being worked on. Do not promise the 1:00 and 1:45 rows below until a practice call shows them.
- What the phone showed and played on the game's call (Athena's greeting, how the tall picture sat) has not been reported yet.
- A second phone that used the join code.
- Which way the phone must be held.

## Before the judge arrives

- **The demo runs on the Mac that holds the line.** That is the Mac where Chert was signed in. The game must run on that Mac too: the server route that names the waiting room (`GET /api/facetime/waiting`) answers only to its own machine.
- **Two processes are already running on that Mac, and have been since the line was taken:**
  1. `chert dev --agent odyssey-dojo`. It holds the line and keeps a waiting room ready.
  2. The small silent LiveKit agent named `odyssey-dojo`. It sits in the waiting room and publishes nothing.

  If either stops, a trial line goes back to the pool. Do not close their Terminal windows. Do not let the Mac sleep. Keep it on power.
- **Check them:** run `chert doctor`. It must say the line is available, LiveKit accepted the keys, and the agent joined. Then look at the `chert dev` window: it is still printing, with no error.
- **The caller's iPhone has texted the join code to the line's number.** Once is enough for each phone. A phone that has not done it is refused. The code is handed out in person, never written down in the repo or in chat. If a judge may want to call from their own phone, say this first; it is quicker to hand them the team's iPhone.
- **Minutes.** A trial has 50 FaceTime minutes, 5 minutes a call, and lasts 24 hours from when it was taken. At the last note on the board 47 minutes were left. One run of this script takes about 3 minutes. The two practice runs take about 6. Keep at least 15 minutes (three full calls) for judging. Check how many are left before you start (check where Chert shows this).
- **The game is open in Chrome on the Multiplayer screen**, the tab in front, sound on, the volume up. "Wait for a FaceTime call" on the FaceTime card has been pressed: the card says "Waiting for a FaceTime call." and "Call" with the line's number. One window of the game only.
- Click once anywhere on the game's page after it loads. A browser plays no sound on a page nobody has clicked, and the call needs sound (see below).
- Start the fight opens the host's webcam step first, as the Host card does. Keyboard play is fine for the host: press "Use keyboard instead" there. That is one extra press (and Skip, if the god scan comes up). Practise it so it takes a second.
- Before pressing Start the fight, read the card's line. "The game can see your friend." means go. "The camera is on, but no body is in view" means the friend must step back first.
- A stand or a cup to prop the phone up, and two metres of floor for the friend. Light in front of the friend, not behind.
- **Check which way the picture sits.** The game sends a tall picture unless it is opened with `?ftframe=landscape`. The one real call brought the caller's picture in wide. On a practice call, look at the phone: if the fight is small or its edges are cut, turn the phone sideways and use the wide picture. Write the answer here once it is known.
- On Devpost, the track "Best Use of FaceTime (Chert)" is selected.

## The three minutes

| Time | What happens | What to say |
| --- | --- | --- |
| 0:00 | Show the Multiplayer screen. Point at the line's number on the FaceTime card. | "Odyssey Dojo teaches self-defense moves by fighting monsters from the Odyssey with your own body. Your friend does not need the game. They need a phone." |
| 0:15 | The judge (or a teammate) opens the FaceTime app on the iPhone, types the line's number and starts a video call. | "This is a plain FaceTime call. No app, no link. The game is about to pick up." |
| 0:25 | The game answers. The phone shows the game's picture. Athena speaks within a few seconds (the ready sign took about 8 seconds on the probe call). The card says "A FaceTime call is coming in. Connecting..." with one button, "Hang up", then "Your friend is on the call. Start the fight." and the button "Start the fight" appears. | "The game answered. That voice is Athena, our coach. She can see the caller through the FaceTime video." |
| 0:45 | Prop the phone up. The friend steps back until the whole upper body is in view. Wait for "The game can see your friend." | "The phone is now both the camera and the screen." |
| 1:00 | Press "Start the fight", pick Polyphemus. A strike card comes up on the phone. The friend punches. The Cyclops takes the hit and the laptop shows YOU + FRIEND. | "The pose model is reading a FaceTime picture. That punch was thrown at a phone." |
| 1:45 | The host defends on the laptop while the friend keeps striking. | "Two people, two places, one fight." |
| 2:30 | Press Hang up (the plate at the bottom right), or the friend hangs up on the phone, or let the win screen come. | "Fresh use of FaceTime video: the call is the controller and the display. And it is useful: anyone with an iPhone can train with you from anywhere." |

After the call, the card goes back to waiting by itself, ready for the next judge (0.4 seconds on the real call, when the caller hung up on the phone).

## If something goes wrong

- **The call ends by itself after about 10 seconds.** Chert ends a call when nothing is heard within 10 seconds of its ready sign. So the game's sound was not playing. Check that the game's tab is in front, the page was clicked once, and the sound is on in the game and on the Mac. Then call again.
- **The call ends the moment it connects, or `chert dev` complains about audio.** Only one participant may publish audio in the room. Something else is publishing: a second game tab, the probe page, or the agent. Close every tab but one and call again.
- **The line is gone** (`chert doctor` says no line, or the call does not connect at all). One of the two processes stopped. Start `chert dev --agent odyssey-dojo` again, then the silent agent, then run `chert doctor`. Getting a line back can take a while when the lines are full; one night they were full for two hours. This is why the processes must never be stopped.
- **The phone is refused.** That phone has not texted the join code to the line's number. Do it once, then call again. Or use the team's iPhone.
- **The card stopped waiting, or the call is answered but the phone shows nothing.** `chert dev` replaces the waiting room about every 5 minutes when no call comes. The card should join the new room by itself. If it does not, reload the game, go back to Multiplayer, click the page once, and call again.
- **Picture but the punches do not land.** The friend is too close or badly lit. Step back until the whole upper body is in view. Put the light in front of the friend, not behind.
- **The phone's picture freezes.** The game tab went to the back. Bring it to the front.
- **The friend hangs up or the call drops mid-fight.** The plate at the bottom right says so for six seconds and the fight carries on solo. Say it out loud and finish the fight, or have the friend call again.
- **The words at the edges of the phone are cut.** Hold the phone sideways and reload the game with `?ftframe=landscape`.
- **Out of minutes, or the 24 hours ran out.** There is no fix on the day. Go to the last resort.
- **Last resort: nothing works.** Open `/tools/facetime/index.html` (the loopback page: one tab, a made-up friend), or the stand-in page from `docs/facetime.md` (a second browser window plays the phone). Say plainly, before you show it: "This is not a FaceTime call. It is the same game path with a stand-in for the phone." Do not let a judge think it is a call.
