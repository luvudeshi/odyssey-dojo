#!/bin/sh
# Copies the MediaPipe runtime and pose model into public/ so the game runs with no network.
set -e
mkdir -p public/mediapipe
cp -R node_modules/@mediapipe/tasks-vision/wasm public/mediapipe/
MODEL=public/mediapipe/pose_landmarker_lite.task
[ -f "$MODEL" ] || curl -fsSL -o "$MODEL" \
  https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task
