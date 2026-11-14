# For coding agents

Before you change anything in this repo, read these two files and follow them:

1. [docs/COORDINATION.md](docs/COORDINATION.md): how to claim a task, report on it and land work. Claim an issue before you start.
2. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): the plan, the feature list, who owns which folder.

Always work on a branch and open a PR; never push to `main`. Run `make ready` before you open the PR. If you have nothing to do, the Never idle section of COORDINATION.md says what to pick up. Never edit `src/core/types.ts`, `src/combat/`, `src/pose/`, `src/input/`, `src/render/`, `src/hud/`, `src/screens/` or `src/App.tsx` unless you are the lead's (toyeshhm's) agent.
