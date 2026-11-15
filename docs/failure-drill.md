# Failure drill

Issue #198. On demo day the venue's network may be slow, an AI service may answer late or wrongly, and a key may be missing on the demo laptop. This page says what each server route does in each of those cases, how long it takes, what the player sees, and which test proves it. `docs/offline.md` (issue #156) covers the other case, the network being off altogether.

## The rules, and the tests that hold them

| Rule | Held by |
| --- | --- |
| Every route the player waits on answers in under 5 seconds, whatever the AI service does: it answers when its limit is up (S3, H2), and each limit is 4.8 s or less (P1). The one exception is the generated fight, which the player asks for: 8.5 s, on a screen that says "The Muse is composing..." and moves for the whole wait. | S3, H2, P1 |
| Every server limit ends at least 1 second before the page stops waiting for that route, so the server is never still working when the page has given up. | P1 |
| The game always has something to show: the lot for the god scan, a bundled fight for a generated one, the written line when the voice does not come. | P2, P3, P5, P6, P7 |
| No answer and no log line contains an API key. | S12, R1, R2 |
| No log line contains the webcam snapshot. | H8, R3 |

Two limits are over 5 seconds. The portrait (12 s), because a painting takes that long: nothing waits on it, the god is on screen, with the "Begin the journey" button, before the portrait is asked for (P4, S4). And the generated fight (8.5 s), because a real one takes 3.3 to 5.2 s to write and the old 4.8 s limit sat in the middle of that: see "Measured on the real services".

Test names are listed at the end of this page.

## The limits

`TIMEOUTS` in `server/env.ts` is the only place the server's limits are set. P1 fails if a server limit is moved past its page wait, or past 4.8 s (8.5 s for the generated fight).

| Call | Server gives up after | Page waits | A real answer took |
| --- | --- | --- | --- |
| God scan (`/api/reveal`) | 4.8 s, second attempt started at 2.5 s | 6 s (`REVEAL_BUDGET_MS`, `src/ai/revealGod.ts`) | 0.85 to 1.94 s on the first attempt |
| Generated fight (`/api/level`) | 8.5 s, all of it for the first model | 9.5 s (`LEVEL_TIMEOUT_MS`, `src/ai/client.ts`) | 3.3 to 5.2 s (2.9 to 3.6 s on the first evening) |
| Spoken line (`/api/speech`) | 4.5 s | 9 s (`SPEECH_WAIT_MS`, `src/audio/narration.ts`) | 0.2 to 0.6 s |
| Portrait (`/api/portrait/:id`) | 12 s after the scan answered | 13 s (`PORTRAIT_TIMEOUT_MS`, `src/ai/reveal.ts`) | not measured, see "What is not covered" |

Before this issue the limits were 8 s for the scan (the page waited 6 s, so the server could still be working when the page had given up), 9 s for a fight and 8 s for speech. The fight's limit was 4.8 s until the fight was made ready for a button on the quest map (the button itself is a patch for the lead to apply); it went to 8.5 s then, with the page's wait.

## The god scan's second attempt

One slow answer from the vision model used to send the player to the lot. Now `server/lib/hedge.ts` runs the call like this:

- The first attempt starts. If it answers with a god the game knows, that is the answer (H7 for what happens when both answer).
- If it has not answered after 2.5 s, a second, identical attempt starts beside it. Whichever usable answer comes first is used and the other is cancelled (H1).
- If the first attempt fails, or answers with something that is not a god, the second attempt starts at once instead of waiting for 2.5 s (H4, H5).
- A first attempt that is refused for a bad request, a bad key or no permission (400, 401, 403) is not tried again, because it would be refused again: the route answers "unavailable" at once after one attempt (H9). A busy or over-quota service (429, 500, 503) is still tried again. The Gemini client asks a second model when its first fails, and each model has its own quota, so the error the route sees only tells of the last model asked.
- There are never more than two attempts (H2, H6). If both fail, the route answers "unavailable" at once. If neither has answered 4.8 s after the first began, it answers "unavailable" then (H2).

An attempt is not always one request. The Gemini client (`server/ai/gemini.ts`) asks its second model when the first one fails, so an attempt is one or two requests and a scan makes at most four. On a good day it makes one.

Only this call is hedged. Its request is small, and its normal answer (under 2 s) leaves room for a second try inside the page's 6 s. A fight takes about 3 s to generate, so a second attempt could not finish in time; speech answers in half a second and has not needed one.

## Route by failure

"At once" means the route has nothing to wait for. The no-key answers were all measured at under 0.01 s on the real server, and the tests hold them under 2 s, the same room the older server tests leave for a busy machine.

### `POST /api/reveal` (god scan)

| Failure | The server answers | In | The player sees | Proved by |
| --- | --- | --- | --- | --- |
| Key missing | `503 {"error":"unavailable"}` | at once | The god is chosen on the laptop from the pose and the clothing colours, with the marble portrait drawn in the browser. Same screen. | S1, P3 |
| Upstream stalls for 15 s, both attempts | `503 {"error":"unavailable"}` | 4.8 s | "The oracle is reading you" for 4.8 s, then the god chosen on the laptop. | S3, H2, P2 |
| Upstream stalls once | the second attempt's god, `200` | 2.5 s plus the second attempt's own time | The AI's god, a little later than usual. | H1 |
| Upstream fails once | the second attempt's god, `200` | at once | The AI's god. | H4 |
| Upstream refuses the request, the key or the permission (400, 401, 403) | `503 {"error":"unavailable"}` after one attempt | at once | The god chosen on the laptop. | H9, P3 |
| Upstream answers with something that is not a god (a level, an error page, `null`, an unknown god) | the second attempt's god if that one is good, else `503` | at once | The AI's god, or the god chosen on the laptop. | S6, H5, H6 |
| The server itself does not answer | nothing | the page gives up at 6 s | "The oracle is reading you" for 6 s, then the god chosen on the laptop. | P2 |

### `GET /api/portrait/:id` (the AI's portrait)

| Failure | The server answers | In | The player sees | Proved by |
| --- | --- | --- | --- | --- |
| Key missing | With no Gemini key the scan itself is unavailable, so no portrait is asked for. A scan that works with no image model answers `portrait_id: null`. An unknown id is `204`. | at once | The marble portrait drawn in the browser. | S1, S2 |
| Upstream stalls for 15 s | `204`, no picture | 12 s after the scan answered | The god, the reason and the "Begin the journey" button at once, with an empty frame. The marble portrait fills the frame when the wait ends. | S4, P4 |
| Upstream answers with something that is not a picture | `204`, no picture | at once | The marble portrait. | S10, P4 |

### `POST /api/level` (generated fight)

| Failure | The server answers | In | The player sees | Proved by |
| --- | --- | --- | --- | --- |
| Key missing | `200` with a bundled fight that fits the phrase, `source: "fallback"` | at once | The fight card, with the line "The Muse was out of reach, so this one comes from the old songs." | S1, P5 |
| Upstream stalls for 15 s | the same bundled fight, `200` | 8.5 s | "The Muse is composing..." for 8.5 s, with a row of stones lighting up, then the card with that line. | S3 |
| Upstream answers with something that is not a level | the same bundled fight, `200` | at once | The card with that line. | S6 |
| Upstream answers with a level that is partly wrong | the model's level with the bad parts replaced or clamped, `source: "ai"` | at once | The AI's fight. | S7 |
| The server itself stalls or answers with something else | nothing, or the wrong thing | the page gives up at 9.5 s | "The Muse is composing..." for up to 9.5 s, then a bundled fight chosen by the page. | P6 (run with a short wait), P1 (the 9.5 s) |

### `POST /api/speech` (Homer's line on the fight card)

| Failure | The server answers | In | The player sees | Proved by |
| --- | --- | --- | --- | --- |
| Key missing | `503 {"error":"unavailable"}` | at once | The card as written. Nobody reads it aloud. | S1, P7 |
| Upstream stalls for 15 s | `503 {"error":"unavailable"}` | 4.5 s | The same. The next line asks the voice service again instead of waiting on the stalled call (S5). | S3, S5 |
| The server itself does not answer | nothing | the page gives up at 9 s | The same. The card is never held back for the voice. | P7 (run with a short wait), P1 (the 9 s) |
| Upstream answers with something that is not audio (an error page, JSON, nothing) | `503`, and the answer is not cached | at once | The same. The same line is spoken once the service answers properly (S8). | S8 |
| The voice list comes back empty or is not a list | `503`, and the list is not kept | at once | The same. The next line asks for the list again. | S9 |

### `GET /api/health`

| Failure | The server answers | In | The player sees | Proved by |
| --- | --- | --- | --- | --- |
| Key missing | `200 {"ok":true,"gemini":false,"portraits":false,"speech":false,"sound":false}` | at once | Nothing: the game does not read it. It is for the person setting up the laptop. | S1 |
| Upstream stalled | `200`, as usual | at once, while the three AI routes are held up | Nothing. | S3 |
| Wrong upstream answer | Not affected: it calls no service. It says whether a key is present, not whether the key works. | | | S12 (no key in the answer) |

### `POST /api/replays`, `PUT /api/replays/:id/video`, `GET /replays/:id` (replay sharing)

These call no AI service and need no key. What they depend on is the laptop's disk.

| Failure | The server answers | In | The player sees | Proved by |
| --- | --- | --- | --- | --- |
| Key missing | `200` with the page address and QR code, as usual | at once | Not affected. | S1 |
| AI upstream stalled | `200`, as usual | at once | Not affected. | S3 |
| A request that is not what the route asks for (bad meta, a card that is not a PNG, an unknown id) | `400` or `404` | at once | Nothing yet: no screen calls the replay share on `main` today. `uploadReplay` in `src/replay/upload.ts` returns null and never throws or hangs (`tests/replay/upload.test.ts`, "null when the server is down, slow, refuses or answers with something else, and the video is not sent"). | S11 |

### `/api/rooms` (create, join, send, poll, events) and `GET /api/rooms/address`

These call no AI service and need no key.

| Failure | The server answers | In | The player sees | Proved by |
| --- | --- | --- | --- | --- |
| Key missing | create, join, send, poll and address all `200` | at once | Not affected. | S1 |
| AI upstream stalled | the same | at once | Not affected. | S3 |
| A request that is not what the route asks for (unknown code, a wrong token on a real room, a body that is not a message, a port that is not a number) | `404`, `401`, `400`, or the address with the bad port ignored | at once | A one-line message on the room screen, such as "No room has that code. Check the letters, or ask your friend for a new one." or "Cannot reach the game server. Is it running?" with a "Play alone" button (`tests/net/rooms.test.ts`, "a relay that cannot be reached is an answer, not an exception"). | S11 |

A poll with nothing to deliver is held for up to 20 seconds on purpose (`POLL_HOLD_MS`); that is how long polling works, not a failure.

## Keys and snapshots in the log

Every error an AI route logs goes through `server/lib/redact.ts` first. It replaces any key the server holds with `[key]`, cuts out any long run of base64 (a snapshot) as `[data]`, and only then shortens the text to 300 characters, so a key cannot be cut in half and half left behind (R2). The routes' answers are fixed text (`unavailable`, `bad_request`) or the model's repaired output, never an error message. S12 makes every upstream call fail with an error that spells out both keys and then reads every answer and every log line.

## Measured on the real services

14 November 2026, this branch's server on a spare port, a made-up test-pattern JPEG (640 by 480, nobody in it).

- **God scan, 17 calls: all 17 came back with a god.** 13 were answered by the first attempt in 0.85 to 1.94 s. In 4 of the first 10 calls, sent a second apart, the first attempt had no answer after 2.5 s; the second attempt answered and the route took 3.00, 3.01, 3.31 and 3.98 s. One of those first attempts later failed with `503 ... currently experiencing high demand`. Without the second attempt those four would have waited on the slow call.
- **Generated fight, 11 calls: 10 came back from the model** in 2.94 to 3.62 s. One had no answer at 4.8 s and came back as the bundled fight in 4.81 s.
- **Generated fight again, later the same evening, 16 calls with 16 different phrases: all 16 came back from the model**, but slower. 8 on the server with the 4.8 s limit took 3.30, 3.79, 4.45, 4.59, 4.65, 4.78, 4.78 and 5.21 s (timed from the caller, so the last one was decided just inside the limit). 8 on a server with the 8.5 s limit took 3.90, 3.90, 4.34, 4.37, 4.78, 4.79, 4.86 and 4.91 s: the last two would have been bundled fights under the old limit. 9 of the 16 took over 4.5 s. That is why the limit is now 8.5 s.
- **Spoken line, 3 calls:** 0.24, 0.48 and 0.56 s, the first one including the voice list.
- **Portrait, 17 scans: none was painted.** Both image models refused in about 0.1 s each with `429 ... limit: 0 requests per day on Free Tier`. Nothing breaks: the one portrait request made answered `204` in 0.12 s, which is the answer that makes the page use the marble portrait. See below.
- **No keys (server started with no env file):** health `200` with every service `false`, scan `503`, fight `200` with `source: "fallback"`, speech `503`, portrait `204`, room create `200`, room address `200`, replay create `200`. Each took under 0.01 s.

## What is not covered, and gaps not fixed here

1. **The AI portrait does not work with the key on this laptop.** The key's project is on Gemini's free tier, which has no quota for either image model. Every scan gets the marble portrait. Turning on billing for that project is the only fix; nothing in the code is wrong. `GET /api/health` still says `"portraits": true`, because it only knows a key is present. The same project's free tier also carries the scan's own quota, so its limits (at the address in the error text) are worth a look before demo day.
2. **A generated fight may now take up to 8.5 s, and a stalled model is not rescued.** The limit was 4.8 s, which left about 1.2 s of room on the first evening and none on the second: real fights took 3.3 to 5.2 s. It is 8.5 s now (`levelMs`), the page waits 9.5 s (`LEVEL_TIMEOUT_MS`), and S3 and P1 hold those two numbers. The first model gets the whole 8.5 s (`attemptMs` in `server/routes/level.ts`), because a second model started at 5 s could not write a fight in what is left. So the second model is only reached when the first fails fast, never when it stalls: a stall ends in the bundled fight at 8.5 s. The god scan and the preflight check still give each model 5 s.
3. **The room screens can wait for ever on a server that accepts a request and never answers.** `post` in `src/net/transport.ts` and `fetchLanBase` in `src/screens/roomNet.ts` pass no time limit to `fetch`. Neither file is in this issue's list. The server's own room routes answer in under a millisecond, so this only shows if the server process is stuck or a tunnel holds the request. The two lines are in issue #226.
4. **The measurements are from one evening, one network and a small picture.** The scans above sent a 17 KB test pattern. A real webcam frame is several times bigger, and earlier real webcam scans took up to 2.3 s, close to the 2.5 s at which the second attempt starts. On a slow venue network most scans could cross 2.5 s, and then most would send two requests; an answer that takes 4.8 to 6 s is now lost to the lot, where the old code would still have used it. On demo morning a person should run about five real scans at the venue and count the `reveal_second_attempt` lines in the server's log. If most scans show one, raise `revealHedgeMs` in `server/env.ts` and the bounds in the tests that pin it (H3 and P1) together, in one small change.
5. **A real stall was not reproduced against the real services.** The stalls and wrong answers in the tests come from made-up clients that ignore their abort signal. The real clients (`server/ai/gemini.ts`, `server/ai/elevenlabs.ts`) are not covered by any test, and the new `gemini_model_failed` log line in `gemini.ts` was only seen in the real run above.
6. **A request body that is not JSON gets a `500` from an AI route**, at once (`server/tests/roomsRoute.test.ts` pins this). The page never sends one, and it falls back on any answer that is not `200`.
7. **The page keeps a spoken line that came back `200` but is not audio**, and plays nothing for it. The server now refuses to send such a line (S8), so this needs something between the two to go wrong.
8. **Only the generated fight was looked at on screen.** Its waiting screen, its card and the bundled-fight card with its line were seen in headless Chrome at 1440 by 900 with the quest-map button patched in on a test copy, once against the real service and once with `/api/level` blocked. The god scan's text in the tables was read from `src/ai/ui/RevealScreen.tsx`, not seen in a browser.

## The tests

Run them with `npx vitest run server/tests/failureDrill.test.ts server/tests/revealHedge.test.ts server/tests/hedge.test.ts server/tests/redact.test.ts tests/ai/failureDrill.test.ts`. They need no server and no keys. S3, H1 and H2 run on the real limits: S3 takes about nine seconds, the other two about five.

`server/tests/failureDrill.test.ts`

- S1: key missing: every route answers at once, the AI routes with their fallback and the rest as if nothing were wrong
- S2: key for the scan but not for speech, and the other way round: each service falls back by itself
- S3: upstream stalled for 15 s, on the real limits: level, scan and speech each answer with their fallback when their limit is up, the scan and speech in under five seconds and the level in under nine, and the other routes answer meanwhile
- S4: a stalled portrait: the god is answered at once, and the portrait request ends with no picture when the painting's time is up
- S5: a stalled voice service is not waited on again: once it answers, the next line is spoken
- S6: upstream answers with the wrong thing: a level that is not a level gives the bundled fight, a god that is not a god gives unavailable
- S7: a level the model got partly wrong is still an AI level, repaired into the safe ranges
- S8: speech that is not audio is refused and not kept: the same line is spoken once the service answers properly
- S9: a voice list that comes back empty or as something else is not kept: the next line asks again
- S10: a portrait that is not a picture is no portrait, and the god is not held back for it
- S11: a request that is not what a route asks for is refused at once with a 400, a 401 or a 404, and never held
- S12: no answer and no log line carries a key, even when the upstream error spells both keys out

`server/tests/revealHedge.test.ts`

- H1: first attempt slow, second fast: the second's answer comes back about 2.5 s plus its own time after the scan began
- H2: both attempts stall for 15 s: unavailable when the limit is up, and never a third attempt
- H3: the real limits leave the second attempt as long as a real scan takes, and end before the page stops waiting
- H4: a first attempt that fails fast is tried again at once, and the second answer is used
- H5: an answer that is not a god counts as a failed attempt: the second attempt's god is used
- H6: two attempts that fail, in any mix of error and junk, are unavailable at once with exactly two calls
- H7: when both attempts answer, the first one in is used and one portrait is painted, for that god
- H8: the snapshot never appears in a log line, whichever way the two attempts go
- H9: a first attempt refused for a bad request, a bad key or no permission is not tried again: one call, unavailable at once

`server/tests/redact.test.ts`

- R1: a key is cut out wherever it stands, however often, and the rest of the error stays readable
- R2: a key that falls across the place where a long error is cut does not leave half of itself behind
- R3: a snapshot echoed in an error is cut out, and a short word is not
- R4: with no keys held nothing is replaced, and something that is not an error says nothing about itself

`tests/ai/failureDrill.test.ts` (the page's side)

- P1: every server limit ends at least a second before the page stops waiting, and all but the portrait and the generated fight end in under five seconds
- P2: god scan, server stalled for 15 s: the lot is cast when the page's six seconds are up, not a moment later
- P3: god scan, no key or a wrong answer: the lot is cast at once, with the portrait drawn in the browser
- P4: the god is on screen before the portrait: a portrait that stalls, fails or is not a picture never delays it, and the marble one takes its place
- P5: generated fight, no key: the server's own bundled fight is shown and marked as one
- P6: generated fight, server stalled or answering wrongly: a bundled fight that fits the phrase, inside the wait
- P7: spoken line, no key, a stalled server or a wrong answer: no voice, no error, and the line is asked for again next time

`server/tests/hedge.test.ts` has twelve more tests of the second-attempt helper by itself.

A note on the timing tests: S3, H1 and H2 check that the answer comes no earlier than the limit and no later than 1 s after it. The second is room for a busy machine running the whole test suite; on a quiet one the answer comes within a few milliseconds of the limit (4.81 s measured for the fight above). The "under five seconds" in the rules rests on the scan's and the speech's limits being 4.8 s or less, which P1 and S3 check as numbers, beside the 8.5 s for the generated fight.
