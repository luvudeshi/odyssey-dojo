# START HERE: handoff prompt for a new chat

> **How to use:** Upload this whole folder (or the .zip) to a new chat and paste everything below the line as your first message. It gives the assistant all the context needed to keep editing.

---

I'm continuing work on the **intro of our HackUTA '26 demo video**. I've attached a project folder with all source footage, a Python/ffmpeg build script, and the current rendered intro. Please read this whole brief, then inspect the folder before making changes.

## 1. Project context
- **Event:** HackUTA 2026 (Devpost). Demo video must be **30s–2min**. Target is ~95–105s total. This folder covers **only the intro (~33s)**.
- **Our product:** a game that teaches you **self-defense** (themed around Greek mythology / Homer's Odyssey, which is the hackathon theme).
- **Intro concept:** a parody of the Halloween skeleton-ambush scene from *The Karate Kid* (1984). We intercut the real movie with our own recreation, filmed at night on campus. Our "victim" wears a **red hoodie** and the attackers wear **black**. It freezes on the hit, then we break the fourth wall: *"Instead of being this guy... you can be THIS guy (Miyagi)."* Then *"Want to learn self-defense?"*, then the game title card.

## 2. Folder layout
```
HackUTA26_Intro/
├─ START_HERE_PROMPT.md          ← this file
├─ build_intro.py                ← builds everything. Run: python3 build_intro.py A   (or B / C)
├─ final/
│  ├─ intro_A_shot_for_shot.mp4  ← ★ CHOSEN VERSION (current best, ~33.0s)
│  ├─ intro_B_split_screen.mp4   ← alternate (not chosen)
│  └─ intro_C_then_vs_now.mp4    ← alternate (not chosen)
├─ source/
│  ├─ kit/01-menu-scene-scylla-and-charybdis.png   (from the Odyssey Dojo video kit: virtual background art)
│  ├─ derived/IMG_7043_alpha.avi   (person cut-out matte for IMG_7043, made by tools/make_matte.py)
│  ├─ movie/karate_kid_training_pays_off.mp4  ("Mr. Miyagi's training pays off" scene; the right-window blocking clip comes from here)
│  ├─ movie/karate_kid_halloween_1984.mp4   (2:30, 1080p, 29.97fps. Usable 0:00–1:30; YouTube end card from ~2:15)
│  └─ our_footage/  IMG_4145.MOV, IMG_4150–4154.mov, IMG_4155.webp, IMG_7043.mp4, IMG_7048.mp4
├─ tools/make_matte.py           ← rebuilds the IMG_7043 cut-out matte (clean-plate difference key + GrabCut; no AI model, works offline, ~2.5 min)
├─ reference/
│  ├─ movie_clip_pool/           44 numbered 1–2.6s clips of the movie + 00_CONTACT_SHEET.jpg (for picking shots)
│  └─ original_edit_plan.md      first planning doc (partly outdated, see this file for current state)
└─ build/                        temp files (auto-created, safe to delete)
```

## 3. Our footage inventory
| File | What it is | Notes |
|---|---|---|
| IMG_4145.MOV | 10s, **4K HEVC HDR (HLG)**. 0–1.5s: red hoodie runs L→R across grass by a wall. ~3.8–5.3s: two attackers in black burst past camera chasing him | Needs HDR→SDR tonemap (zscale). The script does this |
| IMG_4150.mov | 0.8s, two attackers squaring up | unused |
| IMG_4151.mov | 4.1s, two attackers in fighting stance | unused in A (the "skeleton duo" match was weak) |
| IMG_4152.mov | 5s, red hoodie gets put in a **headlock**/pulled down | used 1.0–2.3s |
| IMG_4153.mov | 4.2s, red hoodie takes a **knee to the gut**, doubles over (impact ≈1.85s) | used 1.0–1.85s, and the **freeze frame is at 1.85s** |
| IMG_4154.mov | 5.9s, red hoodie runs to fence, climbs, **gets pulled off the fence** | used 3.2–4.7s |
| IMG_4155.webp | still photo (4:3): red hoodie gripping fence bars, terrified face, attacker behind | used in the "rewind → zoom into his face" beat |
| IMG_7043.mp4 | 4.3s, 720p, bright classroom. Teammate in a **cowboy hat** at a whiteboard says *"Instead of being like this..."*, pointing **up-left** (~1.4–2.2s), then *"...be like this"*, pointing **up-right** (~2.8–3.3s) | used 0.1–4.26s as the background of the pointing beat. Shown ungraded (fourth-wall break) |
| IMG_7048.mp4 | 15.5s, 720p. **The pitch**: grey-sweater teammate talks, points at "<1%" on the whiteboard (0–4s) → whip pan → blue-shirt teammate at "Odyssey Dojo" (game name) on the board (~5.5–9s) → pan → red-hoodie teammate talking by stick figures (~9.5–15s) | used 0.0–15.4s, ungraded, right after the pointing beat |
All 41xx .mov files are 854x480 and the 70xx files are 1280x720 (all upscaled to 1080p in the build). The speech timings above come from gesture and silence detection; nobody has transcribed the audio.

## 4. Current intro A timeline (what final/intro_A_shot_for_shot.mp4 contains)
Approximate output times. O = movie (source time), R = ours.

| Out time | Shot | Source |
|---|---|---|
| 0:00.0 | O: Daniel runs L→R through field | movie 0:03.0, 1.3s |
| 0:01.3 | R: red hoodie runs L→R | 4145 0.2s, 1.2s |
| 0:02.5 | O: skeletons gaining (wide) | movie 0:12.5, 1.3s |
| 0:03.8 | R: chasers burst past camera | 4145 3.8s, 1.3s |
| 0:05.1 | O: skeletons pull him off the fence (wide) | movie 0:20.0, 1.3s |
| 0:06.4 | R: we pull him off the fence | 4154 3.2s, 1.5s |
| 0:07.9 | O: skeleton headlock | movie 0:25.2, 1.3s |
| 0:09.2 | R: headlock | 4152 1.0s, 1.3s |
| 0:10.5 | R: knee to the gut | 4153 1.0s, 0.85s |
| ~0:11.4 | **FREEZE** on impact + white flash + **record scratch** (0.6s) | 4153 frame @1.85s |
| ~0:12.0 | **Pointing beat** (4.16s): IMG_7043's teammate is **cut out of the classroom, centered, and placed on a VIRTUAL BACKGROUND**: the game's storm title art (Scylla & Charybdis) with a slow push-in, animated rain, and a lightning flash when Miyagi appears. The frozen frame **shrinks from full screen into the LEFT window** above his raised hand (0.7s). His off-camera "go" at the start is muted | IMG_7043 + source/kit storm art |
| ~0:12.7 | Left window: **VHS fast-rewind** of the ambush (8x, "◀◀ REW", static, rolling bar) + reversed sped-up audio (0.6s) | last 4.8s of ambush |
| ~0:13.3 | White flash → **fence still, zooms gently toward his face** (`FACE_ZOOM=0.7`, reduced from 1.4 so the hood and bars stay in frame) (1.25s). He points up-left: *"Instead of being like this..."* | IMG_4155 |
| ~0:14.55 | Face **freezes**. The RIGHT window pops in with **Daniel blocking Miyagi's strikes at real speed** (a non-violent self-defense clip chosen over the old fight clip). He points up-right: *"...be like this"* (1.6s) | training_pays_off.mp4 @3:17.6 (`MIY_START`) |
| ~0:16.2 | **The pitch, IMG_7048** (15.4s): "<1%" → whip pan to "Odyssey Dojo" → red-hoodie teammate | |
| ~0:31.6 | PLACEHOLDER: game title card (1.5s). Could be dropped, since "Odyssey Dojo" already appears on the whiteboard | |
| 0:33.0 | end | |

Window slots (in the script): left x=384, right x=1027, y=20, size 520x292, directly above his hands. The person is shifted right by `SHIFT=94` px so his torso sits at frame center. He's slightly darkened and cooled (`FGC`) to sit in the storm. 4 virtual-background options were tried (storm, Ithaca, Polyphemus' cave, blurred game hall); **the storm was chosen**.

**Audio:** movie score from 0:03 under the whole ambush → synth record scratch at the freeze → our dialogue from IMG_7043, the reversed rewind sound, and the blocking clip's own audio at low volume under the side-by-side → IMG_7048's own audio for the pitch.

## 5. Look and grade decisions (keep these)
- Our footage is graded **toward the 1984 film**: darker, cooler/teal, low saturation, slightly lifted blacks, softened (`RLOOK`, `SOFT` in the script). A shared **grain + vignette** (`FILM`) goes on everything so both sources blend.
- An earlier grade was too bright/foggy. Don't lift the blacks too much.
- Cuts are **action-matched** (run↔run, chase↔chase, fence↔fence, headlock↔headlock).
- I asked for **fewer switches** earlier. 4 movie↔ours pairs is about the max.

## 6. Still to do (what's next)
1. ~~Film the pointing and pitch shots~~ **Done**: IMG_7043 and IMG_7048 are in.
2. Replace or drop the **game title card placeholder** at the end (logo + game theme music).
3. Optional: a real record-scratch SFX, and royalty-free 80s synth instead of the movie audio (YouTube Content ID may mute or block copyrighted audio).
4. Optional: if a line in IMG_7043 or IMG_7048 sounds clipped, adjust `POINT_START/POINT_DUR` or `PITCH_START/PITCH_DUR` at the top of build_intro.py.
5. Then build the rest of the demo video (gameplay demo, tech, ending callback). Idea for the end payoff: return to the freeze, have our guy use a move from the game, then cut to Miyagi's flying kick (movie ~1:06).

## 7. How the build script works (build_intro.py)
- `python3 build_intro.py A` rebuilds intro A from `source/` into `final/` (~30s). B and C build the alternates.
- Requirements: **ffmpeg with zscale/libzimg and libx264**, Python 3, and a bold font (auto-detected; or set `FONT=` and `FONT_MONO=` env vars).
- Key pieces: `shot(out, kind, start, dur)` cuts and grades one shot (`kind` = "O" for the movie, or "run", "4152", "4153", "4154", "4151"). The `if which=="A":` list is the ambush shot order (edit start/duration there). `ending(name)` builds the freeze → the pointing beat (shrink → rewind → still-zoom → side-by-side, all composited over IMG_7043) → the IMG_7048 pitch → the title card. The clip in/out points are the `POINT_*` and `PITCH_*` constants at the top, and `GO_MUTE` sets how much of IMG_7043's opening audio is muted. The virtual background, the person composite and the window slots live in `ending()` (search `storm`). `finish()` concatenates and mixes the audio.
- To change a shot: edit its line in the A list and re-run. 
## 8. My preferences so far
- I liked **intro A** best. The still photo looked odd as a static image. It works now inside the rewind/zoom beat, not as an ambush shot.
- I wanted the fence photo replaced in the ambush with the **real video of us pulling him off the fence**. Done.
- I replaced the violent Miyagi fight clip with **Daniel blocking Miyagi's strikes at real speed** (option E of 5 tried), and asked for a **less tight zoom** on the fence face.
- For the pointing beat I chose the **storm virtual background** (bg_1_storm), with the "go" muted.
- Keep my feedback loop: render, then show me contact sheets/frames so I can review.
