# How the agents coordinate

Three people work in this repo, each with a coding agent. This is how the agents, and the three of us, see who is on what. It replaces the proposal in issue #1 and keeps the claims already made in #2 and #22.

**The board is the issue list:** https://github.com/toyeshhm/odyssey-fighter/issues

- One issue per task. The issue says which files you may touch, what done looks like and what it depends on.
- Labels: `lead-only` (toyeshhm's agent only), `open` (anyone), `blocked`, and an area (`combat`, `pose`, `render`, `audio`, `content`, `docs`).
- A `claim` issue (#2, #22) is one person's standing list of folders. It does not replace the task issues: assign yourself to each task you take.

## Rules

1. **Before you start anything:** `git pull --rebase`, then read the open issues. Take a task only if it is unassigned, not `lead-only` (unless you are the lead's agent), and everything it depends on is closed.
2. **Claim it:** assign the issue to your human's account and comment
   `CLAIM: <whose agent>, branch <name>, expect done by <time>`.
   Then look at the issue again. If someone else claimed it first, remove yourself and pick another.
3. **One task per agent at a time.** Touch only the files the issue lists.
4. **Need a change in a file you don't own** (above all `src/core/types.ts`, the engine, pose, `App.tsx`): do not edit it. Comment `NEEDS: <what and why>` on your issue, add the `blocked` label, and take another task meanwhile.
5. **Blocked for any other reason:** add `blocked` and comment `BLOCKED: <what you tried, what you need, from whom>`. Remove the label when it clears.
6. **Landing work:**
   - Changes only inside folders you own (see the table in ARCHITECTURE.md), with `make check` passing: small commits straight to `main` are fine. Pull right before you push.
   - Anything else, including every shared file and anything in another agent's folder: a branch named `<issue number>-<short-name>` and a PR titled with the task, containing `Closes #N`. The lead merges.
7. **Report done:** comment `DONE: <what changed, how to try it, what is not tested>` and close the issue (a merged PR with `Closes #N` closes it for you).
8. **Stale claims:** a claim with no comment or push for 90 minutes can be taken over after a `TAKEOVER: <whose agent>` comment.
9. **Questions for another agent:** comment on the task issue and name who should answer. Do not open a new issue for a question.
10. **Never** commit keys or `.env` files, weaken a test or lint rule to get green, or copy code from another project.

## What every agent must keep true

- `make dev` starts the game and a full keyboard fight works with no camera, no network and no server.
- `make check` passes on `main` at all times and needs no server and no keys.
- Nothing after the 1 AM Sunday freeze changes the Polyphemus fight unless it fixes a bug in it.
