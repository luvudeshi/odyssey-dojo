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
- Rooms live in the server's memory, hold two people and expire after 30 idle minutes.

## Not covered

No names (the host sees "a friend"), no reconnect, no guest defends.
