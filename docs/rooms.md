# Playing together: rooms on demo day

Two players, one monster. One laptop hosts and runs the fight; a friend joins from a laptop or a phone.

## Host (the laptop on the projector)

1. Start the built game and the server in one process: `npm run build && npm run server`. It listens on port 8787 and serves the game.
   In development, `npm run dev:all` works too: the QR code uses this laptop's Wi-Fi address with the port the page was opened on (run `vite --host` so a phone can reach it).
2. Open `http://localhost:8787`, press **Multiplayer** on the main menu, then **Open a room** on the host card.
3. The screen shows a four-letter code and a QR code. The QR holds `http://<laptop's Wi-Fi address>:8787/?room=CODE`.
4. When the friend joins, the screen says "A friend has joined." Press **Start**, pick a style and a stop as usual.
5. If the server is not running, the host screen says so in one line and offers **Play alone**.

Set `PUBLIC_BASE_URL` (for example `PUBLIC_BASE_URL=http://192.168.1.20:8787 npm run server`) if the laptop has several network cards and the QR picks the wrong address.

## Guest

Scan the QR code, or open the game, press **Multiplayer**, and type the four letters in any case into the join card. The join card says how this device will play:

| Device | Page | Plays with |
|---|---|---|
| Laptop, `localhost` or `https` | secure | its webcam (or the keyboard, by choice) |
| Laptop on `http://192.168...` | not secure | the keyboard (browsers refuse the camera on plain http) |
| Phone on `http://192.168...` | not secure | big touch buttons |

**The camera limit.** A browser only allows the camera on `https` pages and on `localhost`. The QR link is plain `http` on the Wi-Fi address, so a phone scanning it cannot use its camera. To give a guest a camera, serve the game over https (a tunnel such as `cloudflared tunnel --url http://localhost:8787`, then set `PUBLIC_BASE_URL` to the https address it prints) before opening the room.

## What happens in the fight

- The host runs the fight exactly as in single play, with two players. If both players land the prompted strike together, it does double damage (the host holds a strike up to 400 ms for the other player's).
- The guest draws the state the host sends, about 15 times a second, and sends its strikes back. Only the host defends.
- Guest leaves: the host carries on alone at once.
- Host leaves: the guest sees "The host left the room." and a button back to the start.
- Guest comes back mid-fight (its page closed or reloaded, or it joined late): the host says which fight is on again, with the newest state, as soon as the relay reports the guest, and the guest goes straight in. A guest already in that fight ignores the repeat (each start carries the fight's `id`). A guest that hears states but knows no fight sends `ask`, and the host answers with the start, at most once a second. Once the fight is over, or the host has left it, nothing is said again: a guest who joins then waits for the next one.
- After a fight the guest waits; when the host starts the next one, the guest goes straight in.
- Rooms live in the server's memory and hold two people. A room is removed 30 minutes after its last use: creating it, joining it, a stream or a poll starting, or a message that was let through. The host sends a small "keep" message every 5 minutes while its fight screen is open, so a quiet room lasts as long as the host does.
- A guest's seat is freed 20 seconds after the guest goes (no open stream and no poll for 20 seconds). Coming back with the same token inside that time keeps the seat. `joinRoomAgain` in src/net/transport.ts keeps the token for the tab and tries it first, so a reload can return to its own seat without that wait (the join screen does not call it yet: issue #222). After it the old token is refused and the code takes a new guest, so a guest who leaves, or a stranger who took the seat, does not cost the host a new room. The host's seat is never freed this way.

## How messages travel

The relay numbers every message it delivers to a seat and keeps the newest 256 per seat. A client reads them in one of two ways:

- **Event stream** (`GET /api/rooms/CODE/events`): the first choice. Each event carries its number as the event id.
- **Long poll** (`GET /api/rooms/CODE/poll?token=...&after=N`): answers at once with the messages after number N, or holds the request up to 20 seconds until one arrives, then answers with an empty list. Messages are plain request and response, so it works where a stream does not.

The client (src/net/transport.ts) opens the stream first. If the stream says nothing for 3 seconds (the relay writes a line the moment a stream opens) or reports an error, the link switches to polling and stays on it, asking for everything after the newest number it heard, so nothing is lost or heard twice. **Through a Cloudflare quick tunnel the stream never gets through, so a guest on the tunnel always ends up polling.** The screens do not know the difference.

## Limits

The relay is built to be reachable through a tunnel, so every call is bounded (server/lib/rooms.ts, server/lib/roomLimits.ts):

- 50 rooms at once. One address (an IPv4 address, or an IPv6 /64) may hold 3 and create 6 a minute; a caller at its cap is given the place of a room it left. 10 rooms are kept for the laptop that runs the server.
- A message is at most 16 KB, and a member may send 120 a second (the host sends about 15).
- Create and join bodies are at most 1 KB, and a request must arrive within 30 seconds.
- 20 wrong codes or tokens a minute per address; past that even a right code gets 429 with Retry-After. The tunnel guard also allows 20 joins a minute per visitor (server/lib/localOnly.ts).
- 8 open streams per address, and a stream whose reader falls 1 MB behind is cut off.
- 250 polls a second per address. A normal poll loop makes about one poll per message it is sent, at most 120 a second per member, so only a runaway loop reaches it.
- A client that gets 429 sees "Too many tries from this network. Wait a minute and try again."

Through a tunnel only the room paths answer (join, events, send, poll and the address): see docs/rooms-tunnel.md.

## Checking it: the rooms smoke run

`scripts/rooms-smoke.mjs` plays a room in two pages of headless Chrome and prints one line per step:

```
node scripts/rooms-smoke.mjs
node scripts/rooms-smoke.mjs --no-build --runs=rejoin
node scripts/rooms-smoke.mjs --no-build --poll
```

It builds the game, starts the server on a free port (the same process as `npm run server`, so the built game and the relay are on one port) and opens a host page at 1280x720 on the keyboard and a guest page at phone size (390x844) with touch. Then it makes three runs, each in a new room:

| Run | What it does | What must be true |
|---|---|---|
| `fight` | The host opens a room, the guest types the code, the host starts a fight and plays it to the end; the guest taps its strike button. | The guest sees the fight, shows the host's health after the first hit, and at the end both pages show the same health, score and result. |
| `rejoin` | About 8 seconds in the guest's page closes. A new page opens the room's link and joins again. The host only defends while the guest is away, so the fight is still on. | The host's fight goes on alone, the guest is let back in, sees the fight again, and the end is the same on both pages. |
| `host-leaves` | About 8 seconds in the host's page closes. | The guest is told the host left and its button leads back to the start. |

A run fails, and the script exits 1, on a console error, a page error, a request that failed or answered 4xx or 5xx, a guest who never sees the fight, or health, score or result that differ between the two pages. One answer is expected and not counted: the 409 "room full" a returning guest gets while the relay still holds its old seat (20 seconds, see above); the line for that step says how many times it was refused. When a run fails the server's warnings are printed too.

`--poll` keeps the guest's event stream silent, which is what a guest behind a Cloudflare quick tunnel gets, so the guest's link moves to long polling after 3 seconds. Run it both ways. `--runs=` picks runs, `--cap=` is the longest a fight may take in seconds (default 240), `--no-build` uses the `dist/` that is there, `--port=` puts the server on that port (a free one is picked otherwise).

No real camera is used. **Start** on the host card starts the host's webcam, so the host's page is given Chrome's fake camera (a moving test pattern with nobody in it): the host skips the god scan and takes **Use keyboard instead** at calibration, so it plays on the keyboard. The guest's page is refused the camera and gets the touch buttons, as a phone on plain http does. `--no-host-camera` refuses the host the camera too, as on a laptop with no webcam. It needs Chrome and Playwright. Playwright is not a dependency of this repo: if `node_modules` has none, set `FPS_PLAYWRIGHT` to a playwright-core folder. `FPS_CHANNEL` and `FPS_GL` work as in `scripts/smoke.mjs`.

**Where it stands (14 Nov, `f8b1891`):** `fight` and `host-leaves` pass with the guest on the stream and with the guest polling. `rejoin` fails both ways: the guest is let back in after about 20 seconds but its page stays on "You are in. Waiting for the host to start." (#222).

**After the main menu (14 Nov, late, `5f81bdb` and again at `c865fa8`):** the script now goes main menu, **Account**, **Host a room** (the guest: **Account**, **Join a room**), and a stop on the map starts the fight with no intro screen. Opening the room and joining it pass in all three runs. Every run then fails at "host sees the guest and starts a fight": after **Start** the host's page, which has no camera, lands on the Account screen and never shows the style screen for good, so no fight begins. The camera fails ("Permission denied"), the game answers a failed camera by going back to the main menu, and since the main menu landed that also applies on the style screen; the Account panel is still open, so that is what shows. Before the main menu the host stayed on the style screen and played on the keyboard. The cause is in `src/App.tsx` and `src/screens/flow.ts`, not in the script. A host whose camera starts was not tried.

**After the Multiplayer screen (15 Nov, `@@HASH@@`):** rooms moved out of Account (PR 296). The script now goes main menu, **Multiplayer**, **Open a room** on the host card; the guest goes main menu, **Multiplayer** and types the code into the join card. The host's page gets Chrome's fake camera. All three runs pass with the guest on the stream: `fight` (won, both pages 100% and 0%, the same score), `rejoin` (refused 9 times with the 409, let back in after 19.4 seconds, sees the fight again, same result at the end) and `host-leaves` (the guest is told "The host left the room." and lands on the Multiplayer screen). `--poll` was not run again.

A host with no camera still cannot start a shared fight. With `--no-host-camera` the `fight` run fails at "host sees the guest and starts a fight": 0.4 seconds after **Start** the host's page is back on the Multiplayer screen with no room open, and the guest stays on "Waiting for the host to start". **Start** moves to the style screen and starts the camera (`src/App.tsx:138`); the camera fails and the game goes back to the main menu (`src/App.tsx:105`), which from the style screen also drops the room (`src/screens/flow.ts:64`). The Multiplayer panel is still open, so that is the screen that shows. The cause is in the game, not in the script.

What it does not show: two machines, a real phone, a real network or a tunnel, a camera on either side, or sound.

## Not covered

No names (the host sees "a friend"), no guest defends. A stream that drops and reconnects by itself loses what was sent meanwhile; only a link that has moved to polling catches up.
