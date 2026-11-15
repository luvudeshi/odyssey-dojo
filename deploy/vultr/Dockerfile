# The hosted game: builds the page, then runs the server, which serves the built page and the room relay on one port.
# Build from the repo root:  docker build -f deploy/vultr/Dockerfile .
# (docker-compose.yml in this folder does that for you.)

# --- build: install, fetch the pose model, build the page ---
# The full image, not slim: the postinstall script fetches the pose model with curl.
FROM node:24-bookworm AS build
WORKDIR /app

# The postinstall script (scripts/vendor-pose.sh) copies the MediaPipe runtime into public/mediapipe and
# downloads the pose model there, so it must be in place before npm ci runs.
COPY package.json package-lock.json ./
COPY scripts/vendor-pose.sh scripts/vendor-pose.sh
RUN npm ci --no-audit --no-fund

# The postinstall only warns when the download fails. A hosted game with no pose model has no camera play, so stop here instead.
RUN test -s public/mediapipe/pose_landmarker_lite.task && test -d public/mediapipe/wasm

COPY . .
RUN npm run build && test -f dist/index.html && test -s dist/mediapipe/pose_landmarker_lite.task

# --- run: the server and what it reads ---
FROM node:24-bookworm-slim AS run
ENV NODE_ENV=production
WORKDIR /app

# The server is TypeScript run by tsx, and it imports a few files from src/, so it needs node_modules, server/ and src/.
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/src ./src
COPY --from=build --chown=node:node /app/dist ./dist

# Replays and caches are written here. docker-compose.yml puts a volume on it.
RUN mkdir -p server/data && chown node:node server/data
VOLUME /app/server/data

USER node
EXPOSE 8787

# Asked from inside the container, so the server sees its own machine and answers.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Not "npm run server": node as the main process gets the stop signal directly.
CMD ["node_modules/.bin/tsx", "server/main.ts"]
