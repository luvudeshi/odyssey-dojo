# Webcam smoke test

The webcam path (MediaPipe pose, move detection, calibration, the "step back" pause) had never run before this test. This
drives the real app in headless Chrome with a fake camera fed from a video of one person, so the path is exercised end to
end without a human in front of it. It proves the plumbing works. It does not prove the game feels right on a real body.

Run on 2026-11-14, Mac, Chrome with GPU (Metal), machine under heavy load from other jobs.

## Source video and licence

Pexels video 7299359, "Elderly man doing jumping jacks outside":
https://www.pexels.com/video/elderly-man-doing-jumping-jacks-outside-7299359/
Licensed under the Pexels licence (free to use, no attribution required). The video is not committed. The raw frame is
16:9 with the man small, which put his shoulders below the app's minimum width (0.1 of the picture) and calibration never
finished, so it was cropped to 4:3 around him, like a webcam picture.

## Commands

```
ffmpeg -i in.mp4 -vf "crop=720:540:0:200,scale=640:480,fps=30" -pix_fmt yuv420p smoke.y4m
npx vite --port 5581 --strictPort
node scripts/webcam-smoke.mjs smoke.y4m out/run --seconds 45 --block-external     # needs playwright-core
node scripts/webcam-smoke.mjs smoke.y4m out/deny --deny                            # camera refused
```

Chrome flags the script sets: `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream
--use-file-for-fake-video-capture=smoke.y4m`. The file loops, and starts when the camera opens. The script clicks through
title, style, the first stop and the intro with `?debug&stop=polyphemus`, then records a timeline every 100 ms
(screen, fps, held defends, struck move, HP) and a screenshot every 3 s. The driver is not part of `make check`.

## Answers

| Question | Result |
|---|---|
| Does the camera start? | Yes. The fake camera opens and the preview thumbnail shows it (`webcam-fight-preview.png`). |
| Does the pose model load, from where? | From the app: `/mediapipe/wasm` and `/mediapipe/pose_landmarker_lite.task`, served by Vite. Every request in the run went to localhost. |
| Does it work offline? | Yes. With `--block-external` (every non-localhost request aborted) the fight ran the same: nothing blocked, nothing failed. The only attempt to reach the internet is a MediaPipe telemetry request (odml.pa.googleapis.com) in runs without the block; it is harmless and is dropped when offline. |
| Do landmarks arrive, and how fast? | Yes. The model ran 27.8 times a second over the fight, 30.1 per second during calibration. That matches the 30 fps camera (see the bug below). |
| Does calibration finish? | Yes, in 2.8 s of stillness (3 s countdown) once the shoulders are in range. |
| Does the "step back" pause trigger? | Yes. When the man walks out of frame the game dims to "Step back, I can't see you" with a black preview (`webcam-pause.png`) and resumes about 5 s after he comes back. Never longer than the 10 s calibration give-up. |
| Are defends and strikes detected? | Yes. Over the run: strikes thunderbolt, hammer_fist and cross; defends jump and duck. A jumping-jack video is not a fight, so these show the detectors fire, not that they fire at the right moment (the man's raised arms read as a jump defend often). Thresholds were not tuned to this video, on purpose. |
| What FPS does the fight hold? | 58.7 average, 60 on the pause screen. Dips to about 10 fps only for the first moments after the model loads (a one-off pause while the 5 s model load finishes on a loaded Mac). |
| Camera denied? | Falls back to the keyboard with a notice (`webcam-denied.png`). |

## The bug found and fixed

`src/pose/tracker.ts` decided a camera picture was new by comparing `video.currentTime`. For a live camera that value
advances with the clock, so it changed on every animation frame: the model ran about 55 to 60 times a second on a camera
that sends 30, feeding every picture to the move detectors twice. Measured in the test page: `currentTime` changed 60 times
a second, `requestVideoFrameCallback` fired 30. The tracker now uses `requestVideoFrameCallback` (new file
`src/pose/freshFrame.ts`, test `tests/freshFrame.test.ts`) and keeps the old comparison only for browsers without it.
Model runs went from about 55 to 60 per second to 27.8 per second, which also halves the pose cost per second. The fix is
about timing, not thresholds, so it does not depend on this video.

## Not fixed

- No camera preview during calibration, so the player cannot see whether they are in frame while the countdown runs.
- If the model fails to load after the camera opened, the camera stream is not stopped. Needs a real failing load to test.
- Jumping jacks (arms up and legs apart) read as a jump defend; thresholds left as they are.
- Headless fake camera is a flat picture with no depth change, so the toward-camera strikes were not exercised.
- Only Chrome was tried. Safari and Firefox were not, and `requestVideoFrameCallback` support there is only by the fallback.

## Checklist for the real-body test tonight

1. Open `http://localhost:5173/?debug` (the dev server's own port), choose "Fight with your body (webcam)", allow the camera.
2. Stand 2 to 3 m back so head, shoulders, hips and both wrists are in the picture, lit from the front, not backlit.
3. Hold still, arms down, for the 3 s countdown. If it takes longer than 10 s the game drops to the keyboard: step back
   or in until your shoulders fill about a quarter of the picture width, then retry.
4. Expect no preview during calibration. The preview shows bottom left once the fight starts.
5. Step out of frame: the screen must dim with "Step back, I can't see you". Step back in: it must resume within a few seconds.
6. Throw one of each strike and each defend. With `?debug`, `window.__battle.held` and `struckMove` in the console show
   what the game saw. Note any move that is missed or fires when you did not do it.
7. Check the fps stays near 60 and the fight does not stutter. Then refuse the camera once to see the keyboard fallback.
