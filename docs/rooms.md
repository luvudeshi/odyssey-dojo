# Playing together: rooms on demo day

Two players, one monster. One laptop hosts and runs the fight; a friend joins from a laptop or a phone.

## Host (the laptop on the projector)

1. Start the built game and the server in one process: `npm run build && npm run server`. It listens on port 8787 and serves the game.
   In development, `npm run dev:all` works too: the QR code uses this laptop's Wi-Fi address with the port the page was opened on (run `vite --host` so a phone can reach it).
2. Open `http://localhost:8787`, press **Fight together**, then **Host a room**.
3. The screen shows a four-letter code and a QR code. The QR holds `http://<laptop's Wi-Fi address>:8787/?room=CODE`.
4. When the friend joins, the screen says "A friend has joined." Press **Start**, pick a style and a stop as usual.
5. If the server is not running, the host screen says so in one line and offers **Play alone**.

Set `PUBLIC_BASE_URL` (for example `PUBLIC_BASE_URL=http://192.168.1.20:8787 npm run server`) if the laptop has several network cards and the QR picks the wrong address.

## Guest

Scan the QR code, or open the game and press **Fight together**, **Join a room**, and type the four letters in any case. The join screen says how this device will play:

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
- After a fight the guest waits; when the host starts the next one, the guest goes straight in.
- Rooms live in the server's memory and hold two people. A room is removed 30 minutes after its last use: creating it, joining it, a stream or a poll starting, or a message that was let through. The host sends a small "keep" message every 5 minutes while its fight screen is open, so a quiet room lasts as long as the host does.
- A guest's seat is freed 20 seconds after the guest goes (no open stream and no poll for 20 seconds). Coming back with the same token inside that time keeps the seat. After it the old token is refused and the code takes a new guest, so a guest who leaves, or a stranger who took the seat, does not cost the host a new room. The host's seat is never freed this way.

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

## Not covered

No names (the host sees "a friend"), no guest defends. A stream that drops and reconnects by itself loses what was sent meanwhile; only a link that has moved to polling catches up.
