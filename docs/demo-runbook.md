# Demo runbook: Sunday morning

One page to follow so the 3-minute demo does not go wrong. What to say is in [pitch.md](pitch.md); this page is what to do. Checked against `main` at `f654f56` (Saturday, 10:30 PM), after the main menu landed. The screens were still changing that night: if a button named here is not on your screen, the walk in section 3 is where you find out before a judge does. "Not checked" means nobody has tried it. The button and screen names on this page were checked again against `main` at `7161d69` (Sunday morning), after the god scan was taken out of the game: Story mode now goes to the character choice. `pitch.md` was written at an older commit: where it names a button differently, trust this page.

## 1. The night before, and on arrival

1. Get the newest `main` and install. The install needs a network once: it downloads the pose model into `public/mediapipe/`, which is not in git.
   ```bash
   git fetch origin && git switch main && git pull --ff-only
   npm install
   ```
   If `git switch main` is refused because another worktree holds `main`, use `git switch --detach origin/main`.
2. Check `.env` is there with both keys. This prints `2` and never a key. If it prints less, copy `.env.example` to `.env` and fill it in.
   ```bash
   grep -c -E '^(GEMINI_API_KEY|ELEVENLABS_API_KEY)=.' .env
   ```
3. Start the game (step 2.1), then in a second terminal, from the repo root:
   ```bash
   npm run preflight
   ```
4. Read its eight lines. Only a FAIL stops the demo; a WARN means the game runs on a fallback.

| Line | PASS means | If it is not PASS |
|---|---|---|
| `clips` | Every voice and sound file listed is on disk | **FAIL:** an Athena, music, narration or taunt file is missing. `git restore public/audio`, run it again. WARN: an effect is missing (a built-in sound plays) or a file is in no index |
| `pose model` | The 3 body-tracking files are in `public/mediapipe` | **FAIL:** no camera play. Run `npm install` with a network (on Windows from Git Bash) |
| `keys` | Both keys are set | WARN: do step 2 above |
| `gemini` | The model answered; it shows which and how fast | WARN: no key, a refused key (HTTP 400, 401, 403) or no network. The god is then chosen on the laptop |
| `elevenlabs` | The voice list came back | WARN: only lines made at run time go silent. Every recorded clip still plays |
| `ai server` | The server on port 8787 is up with the keys | WARN "nothing answers": start it (step 2.1). WARN "started without the key": stop it and start it again |
| `accounts` | `ON`: the Tiger Data database answered from this laptop with its certificate checked, and the running server has accounts on. On `main` at `7161d69` no screen shows the sign-in or the Hall of heroes (`src/screens/Account.tsx` uses neither), so a judge sees no difference | Never a FAIL: the game plays without accounts. WARN `OFF (reason, code)`: the Account page shows no sign-in and no Hall of heroes. `no_database_url`: `.env` has no `DATABASE_URL`. `bad_ca_file`: the file `DATABASE_CA_FILE` names is not there. `no_answer`: no network, or the database refused (the code says which). WARN `OFF on the server`: the server was started before `.env` was filled in; stop it and start it again. WARN `ON ... certificate NOT checked`: accounts work; add `DATABASE_CA_FILE`. All of it is in [accounts.md](accounts.md), set-up |
| `preflight:` | `ready` | `ready, with fallbacks in use` is fine to demo. `NOT READY` is a FAIL above |

With no Wi-Fi, `npm run preflight -- --offline` skips the two internet calls and the database: the `accounts` line then says SKIP and only whether `DATABASE_URL` is set.

## 2. Starting the game for judging

1. From the repo root, in a terminal you leave open:
   ```bash
   npm run dev:all
   ```
   This runs the game (`web`) and the AI server (`api`) together. If either one stops, the other is stopped too: run it again.
2. Open **http://localhost:5173** in Chrome. Only Chrome has been tried.
3. Make the window **at least 900 px tall**, full screen (Mac: Ctrl+Cmd+F; Windows: F11). At 720 px tall the god's portrait was measured squashed into an oval and the room host screen ran into its border; 1440x900 and larger were right. A projector that mirrors at 720p shrinks the laptop too. To check, type `window.innerHeight` in the DevTools console.
4. System volume up, and the output set to the speakers you want (a projector cable can take the sound). Athena and Homer speak, and the judge should hear them.
5. Caps Lock **off**. With it on, the letter keys do nothing in a fight.
6. Close everything heavy: other browser windows, video calls (they hold the camera), and **every coding agent**. Do not `git pull` or save a file in this folder while a judge plays: the dev server reloads the page.
7. Laptop on power. Do-not-disturb on.

## 3. Warm it up before the first judge

The first click that starts the camera loads the body-tracking model: 5 to 11 s in one scripted run on Saturday night, about 1 s after that. So walk the whole camera path once, yourself, standing where the judge will stand:

1. Main menu: click **Story mode**. If Chrome asks, choose Allow.
2. Character: on **Choose your character** click **Fight as** with the name shown. There is no god scan now.
3. Style: pick **Boxer**. Map (**The Road Home**): click the first stop, Polyphemus. A cutscene with his name plays for about 5 seconds; any key or a click skips it.
4. Calibration: stand still, arms down, 3 seconds.
5. Fight for ten seconds. Listen for Athena. Look at the small camera picture: it should say "Tracking your body".
6. Press **Esc**, choose **Quit to map**, then reload the page (section 7) so the next person starts clean.

Nobody has logged listening to the sound in the game ([audio-levels.md](audio-levels.md) is measurement only). Step 5 is the listening test.

## 4. Where the judge stands, and what you say

1. Put a tape mark where the camera shows the judge from **head to hips**, about 2 to 3 m back ([webcam-smoke.md](webcam-smoke.md); not confirmed with a real body in any doc). The game itself only needs both shoulders in the picture, between a tenth and seven tenths of its width and near the middle (`src/pose/presence.ts`). Only Pankration has a kick and a knee, which need the legs in view: use Boxer.
2. Light the judge from the front. No window or bright screen behind them.
3. One body only: the tracker follows one person. You stand beside the laptop, out of the picture, and reach in to click. Nobody walks behind the judge.
4. **You click everything. The judge stays on the tape.** Wait on the main menu until the judge is on the mark, then click **Story mode**.
5. There is no god scan between the menu and the fight now. On **Choose your character** click **Fight as** with the name shown, then pick **Boxer**. Do not press **Esc** on the character screen: it goes back to the main menu.
6. Before you click the stop on the map, say: "Stand still, arms down, for three seconds." The cutscene with the monster's name comes first; the count starts after it.

## 5. If something goes wrong

Most likely first. Each has one action.

1. **"The camera did not start".** The panel says why. Refused: click the camera icon at the left of the address bar, Allow, then **Try the camera again**. "In use by another app": close that app, try again. Still failing: **Play on the keyboard** and say the line under "If the camera fails" in [pitch.md](pitch.md).
2. **Black or frozen camera picture in the fight.** The game restarts a stopped camera by itself ("Camera stopped. Restarting..."). If the panel shows **Use camera**, click it. Otherwise cover from the keys (item 7).
3. **"I can't see you", "Step back", "Step closer", "Move into view".** In calibration: move the judge to the tape; the count starts again when the body is seen. **Use keyboard instead** is always on that screen, and after 10 seconds unseen the heading asks the judge to step back. In a fight: the fight pauses after 0.7 s unseen and goes on 1 s after the judge is back. If it keeps pausing, press a move key while it is paused: it stops pausing for that fight, and the body still counts.
4. **No god scan comes up.** That is right: it is not in the game on `main` at `7161d69`. Story mode goes straight to **Choose your character**, and the power in every fight is Athena's.
5. **No sound.** The browser plays nothing before the first click or key. Then check, in order: system volume and output device, the tab is not muted, and the three volume sliders (main menu: **Account**, **Open settings**; in a fight: **Esc**, **Settings**).
6. **The AI server is down** (the terminal stopped, or `ai server` WARN). The game still plays: start only the game with `npm run dev`. Lost: rooms with a friend, sharing a hero card (it can still be saved) and the Muse's own fight (a bundled one comes). Every recorded voice, sound and fight is in the game.
7. **A fight is going badly.** Keys work during a camera fight, so cover for the judge without restarting: Space block, arrows dodge, duck and jump, J K L B for Boxer, T for the stake, and any of 1 to 6 throws the god's power when the banner says it is ready. The full list is "Keyboard controls" in the [README](../README.md); how to cover is "Covering from the keys" in [pitch.md](pitch.md). The card shows the key while "Show key hints" is on. A Space still held as the fight ends no longer presses **Fight again** on the loss panel: only a key pressed after the panel has been up for 0.8 s counts. To start over: **Esc**, **Restart fight** (it calibrates again).
8. **The Wi-Fi is down.** A keyboard fight needs nothing from the internet, and the camera path loads its model from the laptop ([offline.md](offline.md)). The game with the AI server up and the internet down was tested with stand-ins, not run in a browser.
9. **The picture stutters.** Leave it: the game drops to low graphics by itself after a few seconds of slow frames, until the next reload. **Do not press Q** then: Q flips the setting, and after an automatic drop it puts High back. To have Low from the start, set **Graphics quality** to **Low (faster)** in the settings before the judge steps up; that is saved.
10. **The page froze.** Reload (Cmd+R, or Ctrl+R). Kept: the settings, the chosen character and the beaten stops on the map. Gone: the style and the score. Start from the main menu; the camera starts in about a second. If it freezes again, play on the keyboard: **Account**, **Open settings**, set **Play with** to **Keyboard**, then **Story mode**.

## 6. Optional extras

| Extra | How to switch it on | In front of a judge? |
|---|---|---|
| Training Dojo | **Training Dojo** on the main menu. It starts the camera (or the keyboard when **Play with** says Keyboard). Pick the moves, **Start training**; it grades each try of each move; **Done** at the end tunes the monsters to the player until a reload. **Quit** or Esc leaves it | It takes minutes of the 180 seconds and was mounted late Saturday; on a real body: not checked. Only if the judge asks |
| Account | **Account** on the main menu: a hero name, fight counts, trophies, and **Open settings**. A typed name shows on the main menu ("Welcome back") and on the result screen | Safe. It is saved in the browser: clear it after (section 7) |
| A later stop | Add `?stop=circe` (or `sirens`, `scylla`, `charybdis`, `suitors`) to the address: the earlier stops count as beaten | Safe. It stays in the address after a reload |
| The Muse's fight ("How do you fight?") | Open `http://localhost:5173/?ai=1`. It is not on the menu: only this address opens it. Type how you fight, **Build my fight**, wait about 4 s, **Fight**. It plays on the keyboard; **Use camera** on the fight's camera panel starts the camera and calibrates. **Main menu** leaves it for the normal game until a reload. With the AI server down a bundled fight comes at once, and after 10 s at most if the server hangs | On the keyboard: checked Saturday night, with the AI server up, down and hanging. Nothing is saved and no stop is cleared. With the camera on a real body, and "Speak it": not checked. The monster wears a quest stop's model |
| A friend on a phone | See below | Only if you tried it with that phone this morning |
| Hero card and QR code | **Your hero card** on the result screen. It shows the card with **Save card** and **Share**; Share uploads to the game's server and then shows a QR code. No god is on the card, because the game has no god scan | With the AI server up, and scanned on a phone: not checked. Try it before you promise it |
| `?debug` | Adds a "q: quality" line to the fight and puts internals on `window` | No |
| `?ghost=1` | Turns on the gold move ghost (off by the lead's choice on Saturday) | No |
| `?model=classic`, `?model=dev` | Older Polyphemus model, or a test robot | No |
| `?look=a`, `b`, `base` | Drafts of the Charybdis stop. Which one is best: not checked | No |
| `?pose=cpu` | Runs body tracking on the CPU. The game already falls back to it by itself | Only if tracking will not start. Not checked |
| Test pages | `/tools/dojo/`, `/tools/guide/`, `/tools/recorder/`, `/tools/characters/`, `/tools/pebble/`, `/src/ai/lab/` (dev server only) | No |

**A friend joins on a phone** ([rooms.md](rooms.md), [rooms-tunnel.md](rooms-tunnel.md)):

1. The guest needs the built game from the server, so use this in place of step 2.1 and open **http://localhost:8787**:
   ```bash
   npm start
   ```
2. Main menu: **Multiplayer**, then **Open a room**. The guest scans the QR code. On the Wi-Fi address a phone gets touch buttons, not its camera. Press **Start** when the screen says "A friend has joined."
3. For the guest's camera, in another terminal (needs `cloudflared` installed and internet):
   ```bash
   npm run tunnel
   ```
   Wait for "Checked through the tunnel" before you show the QR code. **Warning: no real tunnel has ever been run.** While it is up anyone with the address can reach this laptop's game server; press Ctrl+C when done. Never point it at port 5173.

## 7. After each judge

1. Reload the page (Cmd+R, or Ctrl+R). The map's **Main menu** button is not enough: it keeps the last judge's style.
2. A reload clears the style, the dojo result and the score on screen. It keeps what the browser saved: the settings (Play with, graphics quality, three volumes, mirror, key hints), the Account (hero name, fight counts, achievements, and the beaten stops, which stay marked Won on the map), the chosen character, and whatever is in the address bar.
3. If the judge typed a hero name, or you want the achievements and the map's Won marks empty again, type this in the DevTools console, then reload:
   ```js
   localStorage.removeItem("odyssey-dojo.profile")
   ```
4. If anybody pressed Q or opened the settings, check them (**Account**, **Open settings**): graphics High, voice and effects full.
5. Chrome should not ask for the camera again on `localhost` (not checked on the demo laptop; step 3 shows you).
6. Wait on the main menu for the next judge. Sound starts with your first click.
