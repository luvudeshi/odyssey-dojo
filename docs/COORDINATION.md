# How the agents coordinate

Three people work in this repo, each with a coding agent. This is how the agents, and the three of us, see who is on what. It replaces the proposal in issue #1 and keeps the claim already made in #2.

**The board is the issue list:** https://github.com/toyeshhm/odyssey-fighter/issues

- One issue per task. The issue says which files you may touch, what done looks like and what it depends on.
- Labels: `lead-only` (toyeshhm's agent only), `open` (anyone), `blocked`, and an area (`combat`, `pose`, `render`, `audio`, `content`, `docs`).
- A `claim` issue (#2) is one person's standing list of folders. It does not replace the task issues: assign yourself to each task you take.

## Rules

1. **Before you start anything:** `git pull --rebase`, then read the open issues. Take a task only if it is unassigned, not `lead-only` (unless you are the lead's agent), and everything it depends on is closed.
2. **Claim it:** assign the issue to your human's account and comment
   `CLAIM: <whose agent>, branch <name>, expect done by <time>`.
   Then look at the issue again. If someone else claimed it first, remove yourself and pick another.
3. **One task in progress per agent**, plus PRs waiting for merge. Touch only the files the issue lists.
4. **Need a change in a file you don't own** (above all `src/core/types.ts`, the engine, pose, and anything under `src/render/`, `src/hud/` or `src/screens/`): do not edit it. Comment `NEEDS: <what and why>` on your issue, add the `blocked` label, and take another task meanwhile.
5. **Blocked for any other reason:** add `blocked` and comment `BLOCKED: <what you tried, what you need, from whom>`. Remove the label when it clears.
6. **Landing work: a branch and a PR, for everyone, every time.** Nobody pushes to `main`, the lead's agent included.
   - Branch from fresh `main`: `git fetch && git checkout -b <issue number>-<short-name> origin/main`.
   - One issue per branch and per PR. Title the PR with the task and put `Closes #N` in the body.
   - Before you open the PR, and again whenever `main` has moved: `make ready`. It fails unless your branch sits on top of the latest `origin/main`, then runs `make check`. A PR that is behind `main` or red does not get merged.
   - The lead (toyeshhm, or his agent on his word) merges, oldest PR first. If yours then conflicts, you rebase it; nobody resolves conflicts in someone else's branch.
7. **Report done:** comment `DONE: <what changed, how to try it, what is not tested>` and close the issue (a merged PR with `Closes #N` closes it for you).
8. **Stale claims:** a claim with no comment or push for 90 minutes can be taken over after a `TAKEOVER: <whose agent>` comment.
9. **Questions for another agent:** comment on the task issue and name who should answer. Do not open a new issue for a question.
10. **Never** commit keys or `.env` files, weaken a test or lint rule to get green, or copy code from another project.

## Keeping merges clean

- **Add files, don't edit shared ones.** Moves, styles, enemies and models are picked up from their folders. A new feature should be new files plus, at most, one line somewhere else.
- **Hot files have one editor: the lead's agent.** `src/core/types.ts`, `src/combat/engine.ts`, `src/App.tsx`, `src/screens/FightScreen.tsx`, `src/render/Scene.tsx`, `src/hud/Hud.tsx`, `src/index.css`, `package.json`, `package-lock.json`, `vite.config.ts`, `Makefile`. If your task needs a line in one of them, write `NEEDS: <the exact line and where>` on your issue and the lead's agent adds it.
- **New npm package:** say which and why on your issue before installing. After a rebase, never hand-merge `package-lock.json`: take `main`'s copy and run `npm install` again.
- **Tests go in new files** named after your feature, not into `tests/combat.test.ts` or `tests/content.test.ts`.
- **Keep PRs small:** under about 400 changed lines, opened within two hours of your claim. Open it as a draft early so others can see which files you are in.
- **Say what you touched:** the PR body lists every file outside the ones your issue names, with one line on why.

## Never idle

An agent always has something it can start right now.

1. Your task is blocked or waiting on a merge: leave it, and take another claimable issue.
2. Nothing claimable in your area: take an [`anytime` issue](https://github.com/toyeshhm/odyssey-fighter/issues?q=is%3Aissue+is%3Aopen+label%3Aanytime). They have no dependencies: tests, move content, quest data, asset research, the pitch, playtesting, reviewing someone's PR (#41).
3. No `anytime` issue left: comment `IDLE: <whose agent>, good at <what>` on #33. The lead's agent answers with a task within 15 minutes, and adds new `anytime` issues whenever fewer than three are unclaimed.
4. While you wait, review the oldest open PR that is not yours (#41).

Waiting for an answer is never a reason to stop: pick the next thing, and say on the issue what you assumed.

## What every agent must keep true

- `make dev` starts the game and a full keyboard fight works with no camera, no network and no server.
- `make check` passes on `main` at all times and needs no server and no keys.
- Nothing after the 1 AM Sunday freeze changes the Polyphemus fight unless it fixes a bug in it.

## The board

https://github.com/users/toyeshhm/projects/2 shows every issue in four columns: Todo, In Progress, Blocked, Done. Closing an issue moves its card to Done. The other moves are yours, right after your `CLAIM:` or `BLOCKED:` comment. Your `gh` needs the board permission once: `gh auth refresh -s project`.

```bash
# move issue N to a column: In Progress = b22618d6, Blocked = 3b8c64c7, Todo = 71c036b4
ITEM=$(gh project item-list 2 --owner toyeshhm --limit 100 --format json --jq '.items[] | select(.content.number == N) | .id')
gh project item-edit --id "$ITEM" --project-id PVT_kwHOCwRNec4BrpBb --field-id PVTSSF_lAHOCwRNec4BrpBbzhp6y5o --single-select-option-id b22618d6
```

If your agent cannot move cards, the issue's assignee, labels and comments are still the truth; the lead's agent keeps the board in step.
