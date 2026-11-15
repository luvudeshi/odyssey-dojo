# FaceTime demo script (Chert track)

For the "Best Use of FaceTime (Chert)" judging. The track asks for an AI agent that uses FaceTime video to see what you show it, show you what you need, or both. Ours does both: Athena sees the friend's body through the call, and the call shows the friend the fight.

**This script has not been run on a real call yet.** Run it end to end at least twice before judging and change any step that does not match what happens.

## Before the judge arrives

- The laptop is the one whose Chert sign-in approved it. `curl http://localhost:8787/api/facetime/status` gives `{"ready":true,"missing":[]}`.
- The friend's iPhone has texted the line's number in the last 24 hours (a trial line only calls verified phones). Do it again that morning.
- A trial has 50 minutes in all and 5 minutes a call. Keep at least three calls' worth for judging.
- The game is open in Chrome on the Multiplayer screen, sound on, the tab in front. Keyboard play is fine for the host.
- A stand or a cup to prop the phone up, and two metres of floor for the friend.
- On Devpost, the track "Best Use of FaceTime (Chert)" is selected.

## The three minutes

| Time | What happens | What to say |
| --- | --- | --- |
| 0:00 | Show the Multiplayer screen. | "Odyssey Dojo teaches self-defense moves by fighting monsters from the Odyssey with your own body. Your friend does not need the game. They need a phone." |
| 0:15 | Type the friend's number, press Call. Hand the judge the ringing iPhone if they want it. | "The game is calling over FaceTime. No app, no link." |
| 0:30 | The friend answers. Athena greets them and the phone shows the game. | "That voice is Athena, our coach. She can see the caller through the FaceTime video." |
| 0:45 | Prop the phone up, friend steps back. Press "Start the fight", pick Polyphemus. | "The phone is now both the camera and the screen." |
| 1:00 | A strike card comes up on the phone. The friend punches. The Cyclops takes the hit and the laptop shows YOU + FRIEND. | "The pose model is reading a FaceTime picture. That punch was thrown at a phone." |
| 1:45 | Host defends on the laptop while the friend keeps striking. | "Two people, two places, one fight." |
| 2:30 | Press Hang up, or let the win screen come. | "Fresh use of FaceTime video: the call is the controller and the display." |

## If something goes wrong

- **The phone does not ring:** the card says why. "Not verified" means text the line again. "Line busy" means an earlier call is still open: wait 30 seconds.
- **Picture but the punches do not land:** the friend is too close. The whole upper body must be in view. Good light on the friend, not behind them.
- **The phone's picture freezes:** the game tab went to the back. Bring it to the front.
- **Nothing works:** open `/tools/facetime/index.html`. It shows the same flow in one tab with a made-up friend, and say plainly that it is the loopback page, not a call.
