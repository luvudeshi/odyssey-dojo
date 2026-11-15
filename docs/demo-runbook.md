# Demo runbook: Sunday morning

One page to follow so the 3-minute demo does not go wrong. What to say is in [pitch.md](pitch.md); this page is what to do. Read against `main` at `36cefe8` (Saturday night). "Not checked" means nobody has tried it. `pitch.md` was written at an older commit: where it says there is no god scan, no map or no pause, trust this page and what you see in step 3.

## 1. The night before, and on arrival

1. Get the newest `main` and install. The install needs a network once: it downloads the pose model into `public/mediapipe/`, which is not in git.
   ```bash
   git fetch origin && git switch main && git pull --ff-only
   npm install
   ```
2. Check `.env` is there with both keys. This prints `2` and never a key. If it prints less, copy `.env.example` to `.env` and fill it in.
   ```bash
   grep -c -E '^(GEMINI_API_KEY|ELEVENLABS_API_KEY)=.' .env
   ```
3. Start the game (step 2.1), then in a second terminal, from the repo root:
   ```bash
   npm run preflight
   ```
4. Read its seven lines. Only a FAIL stops the demo; a WARN means the game runs on a fallback.

| Line | PASS means | If it is not PASS |
|---|---|---|
| `clips` | Every voice and sound file listed is on disk | **FAIL:** an Athena, music, narration or taunt file is missing. `git restore public/audio`, run it again. WARN: an effect is missing (a built-in sound plays) or a file is in no index |
| `pose model` | The 3 body-tracking files are in `public/mediapipe` | **FAIL:** no camera play. Run `npm install` with a network (on Windows from Git Bash) |
| `keys` | Both keys are set | WARN: do step 2 above |
| `gemini` | The model answered; it shows which and how fast | WARN: no key, a refused key (HTTP 400, 401, 403) or no network. The god is then chosen on the laptop |
| `elevenlabs` | The voice list came back | WARN: only lines made at run time go silent. Every recorded clip still plays |
| `ai server` | The server on port 8787 is up with the keys | WARN "nothing answers": start it (step 2.1). WARN "started without the key": stop it and start it again |
| `preflight:` | `ready` | `ready, with fallbacks in use` is fine to demo. `NOT READY` is a FAIL above |

With no Wi-Fi, `npm run preflight -- --offline` skips the two internet calls.

## 2. Starting the game for judging

1. From the repo root, in a terminal you leave open:
   ```bash
   npm run dev:all
   ```
   This runs the game (`web`) and the AI server (`api`) together. If either one stops, the other is stopped too: run it again.
2. Open **http://localhost:5173** in Chrome. Only Chrome has been tried.
3. Make the window **at least 900 px tall**, full screen. At 720 px tall the god's portrait was measured squashed into an oval and the "Fight together" host screen ran into its border; 1440x900 and larger were right. A projector that mirrors at 720p shrinks the laptop too. To check, type `window.innerHeight` in the DevTools console.
4. System volume up, and the output set to the speakers you want (a projector cable can take the sound). Athena calls every move by voice.
5. Caps Lock **off**. With it on, the letter keys do nothing in a fight.
6. Close everything heavy: other browser windows, video calls (they hold the camera), and **every coding agent and its worktrees**. Do not `git pull` or save a file in this folder while a judge plays: the dev server reloads the page.
7. Laptop on power. Do-not-disturb on.

## 3. Warm it up before the first judge

Measured Saturday night with a script: the first click on "Fight with your body (webcam)" took 5 to 11 s cold and about 1 s after that. The first god scans can be slower too. So walk the whole camera path once, yourself, standing where the judge will stand:

1. Title: click **Fight with your body (webcam)**. If Chrome asks, choose Allow.
2. God scan: click **Reveal my god**, hold a pose for the 3-second count, wait for the god, click **Begin the journey**.
3. Style: pick **Boxer**. Map: click the open stop. Intro: click **Face Polyphemus**.
4. Calibration: stand still, arms down, 3 seconds.
5. Fight for ten seconds. Listen for Athena. Look at the small camera picture, bottom left: it should say "Tracking your body".
6. Press **Esc**, choose **Quit to map**, then reload the page (section 7) so the next person starts clean.
7. Reload and do steps 1 and 2 again, four times, and look at the `api` lines in the terminal. If most scans print `reveal_second_attempt`, the venue network is slow: expect the laptop to choose the god more often (see [failure-drill.md](failure-drill.md), "What is not covered", point 4).

Nobody has logged listening to the sound in the game ([audio-levels.md](audio-levels.md) is measurement only). Step 5 is the listening test.

## 4. Where the judge stands, and what you say

1. Put a tape mark where the camera shows the judge from **head to hips**, about 2 to 3 m back ([webcam-smoke.md](webcam-smoke.md)). The game itself only needs both shoulders in the picture, between a tenth and seven tenths of its width and near the middle (`src/pose/presence.ts`), but front kick and knee need knees and ankles in view. Boxer has neither, so use Boxer unless the whole body shows.
2. Light the judge from the front. No window or bright screen behind them.
3. One body only: the tracker follows one person. You stand beside the laptop, out of the picture, and reach in to click. Nobody walks behind the judge.
4. **You click everything. The judge stays on the tape.** Wait on the title screen until the judge is on the mark, then click the camera button.
5. The god scan screen **closes by itself 30 seconds after it opens** if no god is shown yet, and it is not offered again. Click **Reveal my god** as soon as the judge is in the picture.
6. The scan takes about 5 seconds: a 3-second count, then 1 to 2 seconds for the answer (6 at most). Say while it runs: "In the poem the gods come in disguise. The camera reads your stance and names the Olympian you take after, and that god lends you one power in the fight." If asked where the picture goes: question 9 in [pitch.md](pitch.md).
7. Before calibration say: "Stand still, arms down, for three seconds."

## 5. If something goes wrong

Most likely first. Each has one action.

1. **"The camera did not start".** The panel says why. Refused: click the camera icon at the left of the address bar, Allow, then **Try the camera again**. "In use by another app": close that app, try again. Still failing: **Play on the keyboard** and say the line under "If the camera fails" in [pitch.md](pitch.md). Keyboard play has no god scan.
2. **Black or frozen camera picture in the fight.** The game restarts a stopped camera by itself ("Camera stopped. Restarting..."). If the panel shows **Use camera**, click it. Otherwise cover from the keys (item 7).
3. **"I can't see you", "Step back", "Step closer", "Move into view".** In calibration: move the judge to the tape; the count starts again when the body is seen. **Use keyboard instead** is always on that screen, and after 10 seconds unseen the heading asks the judge to step back. In a fight: the fight pauses after 0.7 s unseen and goes on 1 s after the judge is back. If it keeps pausing, press any move key once: it stops pausing for that fight, and the body still counts.
4. **The god scan sits on "The oracle is reading you".** It ends by itself: with no answer in 6 seconds the laptop picks the god from the pose and clothing colours. That is the built-in fallback and the screen looks the same. Carry on. **Skip (Esc)** leaves the scan; the power is then Athena's.
5. **No sound.** The browser plays nothing before the first click or key. Then check, in order: system volume and output device, the tab is not muted, and **Settings** on the title screen (music, effects and voice sliders).
6. **The AI server is down** (the terminal stopped, or `ai server` WARN). The game still plays: start only the game with `npm run dev`. Lost: the AI's choice of god (the laptop chooses) and "Fight together". Every recorded voice, sound and fight is in the game.
7. **A fight is going badly.** Keys work during a camera fight, so cover for the judge without restarting: Space block, arrows dodge and duck, J K L B for Boxer, T for the stake. The full list is "Keyboard controls" in the [README](../README.md); how to cover is "Covering from the keys" in [pitch.md](pitch.md). The card shows the key while "Show key hints" is on. Let go of Space as the fight ends: a held Space presses **Fight again** on the loss panel. To start over: **Esc**, **Restart fight** (it calibrates again).
8. **The Wi-Fi is down.** A keyboard fight needs nothing from the internet, and the camera path loads its model from the laptop ([offline.md](offline.md)); the pose library tries to send one usage log, which fails and does no harm. The god is chosen on the laptop after a wait of up to 6 seconds. The game with the AI server up and the internet down was tested with stand-ins, not run in a browser.
9. **The picture stutters.** Press **Q** in the fight for low graphics. It is saved, so it stays for the next judge.
10. **The page froze.** Reload (Cmd+R, or Ctrl+R). Kept: the settings. Gone: the god, the style, the beaten stops and the score. Start from the title; the camera starts in about a second. If it freezes again, use **Keyboard only**.

## 6. Optional extras

| Extra | How to switch it on | In front of a judge? |
|---|---|---|
| Warm-up | **Warm up (15 s)** on the intro screen, camera play only. It tunes the monsters to the player | It costs 15 to 25 of the 180 seconds and its numbers were never tried on a real body ([warmup.md](warmup.md)). Skip it |
| A later stop | Add `?stop=circe` (or `sirens`, `scylla`, `charybdis`, `suitors`) to the address: the earlier stops count as beaten | Safe. It stays in the address after a reload |
| A friend on a phone | See below | Only if you tried it with that phone this morning |
| God card and QR code | `SharePanel` is only on the test page `/src/ai/lab/`. The game's result screen does not show it at `36cefe8` | Not in the game. Look at the result screen before you promise it |
| `?debug` | Adds a "q: quality" line to the fight and puts internals on `window` | No |
| `?ghost=1` | Turns on the gold move ghost (off by the lead's choice; copying it counted for 7 of 26 moves) | No |
| `?model=classic`, `?model=dev` | Older Polyphemus model, or a test robot | No |
| `?look=a`, `b`, `base` | Drafts of the Charybdis stop. Which one is best: not checked | No |
| `?burst=b`, `c` | Other drawings of the dodge burst | Harmless; leave off |
| `?pose=cpu` | Runs body tracking on the CPU. The game already falls back to it by itself | Only if tracking will not start. Not checked |
| Test pages | `/tools/dojo/`, `/tools/guide/`, `/tools/recorder/`, `/tools/characters/`, `/tools/pebble/`, `/src/ai/lab/` (dev server only) | No |

**A friend joins on a phone** ([rooms.md](rooms.md), [rooms-tunnel.md](rooms-tunnel.md)):

1. The guest needs the built game from the server, so use this in place of step 2.1 and open **http://localhost:8787**:
   ```bash
   npm start
   ```
2. Title: **Fight together**, **Host a room**. The guest scans the QR code. On the Wi-Fi address a phone gets touch buttons, not its camera. Press **Start** when the screen says "A friend has joined."
3. For the guest's camera, in another terminal (needs `cloudflared` installed and internet):
   ```bash
   npm run tunnel
   ```
   Wait for "Checked through the tunnel" before you show the QR code. **Warning: no real tunnel has ever been run.** While it is up anyone with the address can reach this laptop's game server; press Ctrl+C when done. Never point it at port 5173.

## 7. After each judge

1. Reload the page (Cmd+R, or Ctrl+R). There is no button back to the title: "Back to the map" and "Change style" keep the last judge's god and beaten stops.
2. A reload clears the god, the style, the beaten stops, the warm-up result and the score. It keeps the saved settings (graphics quality, three volumes, mirror, key hints) and whatever is in the address bar.
3. If anybody pressed Q or opened Settings, check **Settings** on the title screen: graphics High, voice and effects full.
4. Chrome should not ask for the camera again on `localhost` (not checked on the demo laptop; step 3 shows you).
5. Wait on the title screen for the next judge. Sound starts with your first click.
