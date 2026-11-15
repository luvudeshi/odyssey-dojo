# Rooms over the internet: the tunnel

A phone browser only gives a page the camera on https. The address a guest gets on the Wi-Fi is http, so a guest there
plays with touch buttons. `scripts/tunnel.mjs` opens a Cloudflare quick tunnel to the game. The guest then gets an https
address and can play with the camera. Touch buttons on the Wi-Fi address stay as the fallback.

Read "What the tunnel exposes" and "Known limit" before the demo. The script was tested against a stand-in for
`cloudflared`, not the real one. See "Not tested".

## Before you start

1. `cloudflared` must be installed: https://developers.cloudflare.com/tunnel/downloads/ . The script does not install it.
2. The server must be running and serving the built game. `npm start` does both. If the server is already up from
   `npm run dev:all`, run `npm run build` once. If the script then says the server does not serve the game, restart the
   server: it only serves `dist` when `dist` was there at its start.
3. The laptop needs internet.

The guest gets the built game from `dist`, not the dev page. Run `npm run build` again after pulling new code.

## Start it

```
node scripts/tunnel.mjs          # the server on port 8787
node scripts/tunnel.mjs 9100     # the server on another port
```

Leave it running in its own terminal. The host keeps playing on the page they already have open.

## What the host sees

```
Tunnel is up: https://four-random-words.trycloudflare.com
The server hands out this address: the room QR code uses it now. It can take a few seconds before it answers.
Anyone who has the address can reach the rooms and the replay pages. Press Ctrl+C here when the demo is over.
Checked through the tunnel: the routes that spend the API keys are refused there.
```

Wait for the last line before you show the QR code. It comes a few seconds after the others. See "What the tunnel
exposes" for what it checks and what the script does when the check fails.

The address is new on every start. The server does not need a restart. The room QR code and the replay QR codes made
from then on open the tunnel address.

The second line is different when the server has no `/api/rooms/address` route (it then says the server reads the
address on its next request), and it is a warning when the server answers with another address. That happens when the
server was started from another folder, or with `PUBLIC_BASE_URL` or `PUBLIC_URL` set.

## What a guest sees

This is what the room screens (PR #150) are written to do. It was not tried on a phone.

The guest scans the room QR code, or types the address and the room code. The page is on https, so the browser asks for
the camera and the guest plays with it. A device with no camera gets the keyboard or the touch buttons as before.

The AI routes do not answer a guest, through the tunnel or on the Wi-Fi. The guest's page uses the offline fallbacks.

## No internet, or no cloudflared

The script prints one line and stops. Nothing changes: the QR code keeps the Wi-Fi address and a phone gets touch
buttons.

- `cloudflared is not installed, so there is no tunnel. ...` with the install page.
- `cloudflared stopped before it gave an address (exit code 1). Is there internet? ...` with cloudflared's last line.
- `cloudflared gave no address in 30 seconds. Is there internet? ...`
- `Nothing answers on http://127.0.0.1:8787. ...` or `The server on port 8787 is up but does not serve the game. ...`
- `The server on port 8787 does not refuse the AI routes to a request from a tunnel, so no tunnel was opened. ...` The
  server was started before the guard below existed. Restart it.

If the internet drops while the tunnel is up, the script cannot tell. Press Ctrl+C and the QR code goes back to the
Wi-Fi address.

## Stop it

Press Ctrl+C in its terminal. It stops `cloudflared`, removes `server/data/tunnel.json` and says the tunnel is closed.
The QR code goes back to the Wi-Fi address on the next request. Closing the terminal does the same.

If the script is killed with `kill -9`, `cloudflared` keeps running and the tunnel stays open. Stop it with
`pkill cloudflared`. The server stops handing out the address at once either way.

Stop the tunnel when the demo is over.

## How the server learns the address

While the tunnel is up the script keeps `server/data/tunnel.json` (`{ "url": "https://...", "pid": 1234 }`) and rewrites
it every 5 seconds. `server/data` is ignored by git. `server/lib/address.ts` reads the file each time a link is built,
and uses the address only when all of these hold:

- it is an https address with no path, query, fragment, name or password;
- the process that wrote the file is still running;
- the file was written in the last 20 seconds.

So a file left by a crash, a power cut or a reboot is ignored, also when its process id has been given to another
program. `PUBLIC_BASE_URL` (or `PUBLIC_URL`) in the environment or `.env` wins over the file. Use that for a named
tunnel on your own domain: set it and restart the server.

## What the tunnel exposes

While it is up, anyone who has the address can reach this laptop's game server. The address is random words, but it is
on a QR code on a screen, so treat it as public.

Reachable through the tunnel:

- The game page and its files.
- The room relay under `/api/rooms`: make a room, join one, send and receive its messages. A room has a four-letter
  code and each member a secret token. There are at most 50 rooms, a message is at most 16 KB, and a room ends after 30
  minutes without use. Someone could fill all 50 rooms; new rooms then fail until the old ones end or the server restarts.
- Replay pages, their card and video, and their QR code, for anyone who knows a replay's 10-character id. So is the
  video upload for an existing id (up to 64 MB). The server keeps at most 200 replays.
- `/api/health`, which says which AI services have a key. It does not give the keys.

Not reachable through the tunnel:

- Every other `/api/` route. `/api/level`, `/api/speech`, `/api/reveal`, `/api/portrait/...` and making a replay answer
  403. These are the routes that spend the Gemini and ElevenLabs keys.

How that is enforced: a request from the tunnel reaches the server from this machine, so the socket address alone would
let it in. `cloudflared` puts `Cf-Connecting-Ip`, `Cf-Ray` and `X-Forwarded-For` on every request it passes on. The
guard in `server/lib/localOnly.ts` refuses the spending routes for any request that carries a `Cf-...` or
`X-Forwarded-...` header, or `Forwarded`, `X-Real-Ip`, `True-Client-Ip`, `Cdn-Loop` or `Via`, in any letter case and
with any value. A browser on the laptop sends none of these, and neither does the Vite dev proxy as configured.

That `cloudflared` adds these headers comes from Cloudflare's documentation, not from a run here. So the script checks
twice:

1. Before it opens a tunnel it sends the server one request marked this way, and goes on only if the answer is 403. A
   server started before the guard existed gets no tunnel.
2. Once the tunnel is up it asks for `/api/level` through the tunnel's own address, every 3 seconds for up to about a
   minute. The guard's 403 gives the "Checked through the tunnel" line. If the server instead answers as it would answer
   this machine, the script says so and closes the tunnel. If the tunnel never answers, the script says the guard was
   not checked and leaves the tunnel up.

In that last case, or to see it yourself, open `https://four-random-words.trycloudflare.com/api/level` on a phone. It
must show `{"error":"local_only"}`. If it shows anything else, stop the tunnel.

Two things would weaken this, so do not do them:

- Do not point the tunnel at the Vite dev server (port 5173). That would put the source tree on the internet. The guard
  itself still holds there: the dev proxy passes the tunnel's headers on, and the spending routes answer 403.
- Do not turn on `xfwd` in the proxy rules in `vite.config.ts`. Local play through `npm run dev:all` would then get 403
  from the AI routes.

`server/tests/devProxy.test.ts` runs the real Vite proxy against the server for all three cases.

## Known limit: Cloudflare says quick tunnels do not carry event streams

Cloudflare's quick tunnel page lists these limits: no uptime guarantee, at most 200 requests in flight, and "Quick
Tunnels do not support Server-Sent Events (SSE)."

The room relay sends the other player's messages over an event stream (`GET /api/rooms/:code/events`). If the tunnel
holds that stream back, the guest joins the room but never sees the fight move. This was not tested, because no real
tunnel was run. Check it with one phone before relying on it. If the guest does not get messages, there are two ways out:

- give the relay a second way to deliver messages that is not an event stream (a change in `server/routes/rooms.ts` and
  `src/net/transport.ts`, outside this task);
- or use a named tunnel on a Cloudflare account and set `PUBLIC_URL` to its https address.

## Not tested

- A real `cloudflared` and a real tunnel. The tests in `server/tests/tunnel.test.ts` run the script against a stand-in
  program that prints the lines `cloudflared` prints, copied from its source and from a published sample of its output.
- A phone opening the address, the camera prompt, and a fight through the tunnel.
- Whether room messages arrive through a quick tunnel (see above).
- What `cloudflared` prints with no internet. The stand-in prints the error its source code builds.
- That a real `cloudflared` puts `Cf-Connecting-Ip`, `Cf-Ray` and `X-Forwarded-For` on what it passes on. The script's
  check through the tunnel was run against a stand-in for the tunnel's public end, with and without those headers.
- Windows.

Tested: the guard against the real server with `curl` and with raw requests; the script against a server that was
already running, which handed out the address and dropped it again when the script stopped; the Vite dev proxy against
the guard.
