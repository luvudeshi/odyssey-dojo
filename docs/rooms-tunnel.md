# Rooms over the internet: the tunnel

A phone browser only gives a page the camera on https. The address a guest gets on the Wi-Fi is http, so a guest there
plays with touch buttons. `scripts/tunnel.mjs` opens a Cloudflare quick tunnel to the game. The guest then gets an https
address and can play with the camera. Touch buttons on the Wi-Fi address stay as the fallback.

**Not shown to work yet.** No real tunnel was run. The script was tested against a stand-in for `cloudflared`. And
Cloudflare says quick tunnels do not carry event streams, which is how a room delivers the other player's messages.
So a guest may join and then never see the fight move. Before the demo, run the script with the real `cloudflared` and
join one room from a phone. See "Known limit" and "Not tested".

Read "What the tunnel exposes" before the demo too.

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
Anyone who has the address can join a room and open the replay pages. Press Ctrl+C here when the demo is over.
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

The host makes the room on the laptop, as before. The guest scans the room QR code, or types the address and the room
code. The page is on https, so the browser asks for the camera and the guest plays with it. A device with no camera
gets the keyboard or the touch buttons as before.

A guest cannot make a room through the tunnel. The server answers 403 there, so the page's "host" side fails for them.
A guest who tries more than 20 room codes in a minute gets 429 for the rest of that minute.

The AI routes do not answer a guest, through the tunnel or on the Wi-Fi. The guest's page uses the offline fallbacks.

## No internet, or no cloudflared

The script prints one line and stops. Nothing changes: the QR code keeps the Wi-Fi address and a phone gets touch
buttons.

- `cloudflared is not installed, so there is no tunnel. ...` with the install page.
- `cloudflared stopped before it gave an address (exit code 1). Is there internet? ...` with cloudflared's last line.
- `cloudflared gave no address in 30 seconds. Is there internet? ...`
- `Nothing answers on http://127.0.0.1:8787. ...` or `The server on port 8787 is up but does not serve the game. ...`
- `Port 5173 is the Vite dev server. Point the tunnel at the game server (port 8787 unless you changed it).`
- `The server on port 8787 does not refuse the AI routes to a request from a tunnel, so no tunnel was opened. ...` The
  server was started before the guard below existed. Restart it.

If the internet drops while the tunnel is up, the script cannot tell. Press Ctrl+C and the QR code goes back to the
Wi-Fi address.

## Stop it

Press Ctrl+C in its terminal. It removes `server/data/tunnel.json` first, then stops `cloudflared` and says the tunnel
is closed. The QR code goes back to the Wi-Fi address on the next request, also while `cloudflared` is still shutting
down. A `cloudflared` that has not stopped after 5 seconds is killed. Closing the terminal or `kill` does the same.

If the script is killed with `kill -9`, `cloudflared` keeps running and the tunnel stays open. Stop it with
`pkill cloudflared`. The server stops handing out the address at once either way.

Stop the tunnel when the demo is over.

## How the server learns the address

While the tunnel is up the script keeps `server/data/tunnel.json` (`{ "url": "https://...", "pid": 1234 }`) and rewrites
it every 5 seconds. `server/data` is ignored by git. `server/lib/address.ts` reads the file each time a link is built,
and uses the address only when all of these hold:

- it is an https address with no path, query, fragment, name or password;
- the process that wrote the file is still running;
- the file was written in the last 20 seconds;
- the file is at most 1024 bytes. A bigger one is not read.

So a file left by a crash, a power cut or a reboot is ignored, also when its process id has been given to another
program. `PUBLIC_BASE_URL` (or `PUBLIC_URL`) in the environment or `.env` wins over the file. Use that for a named
tunnel on your own domain: set it and restart the server.

## What the tunnel exposes

While it is up, anyone who has the address can reach this laptop's game server. The address is random words, but it is
on a QR code on a screen, so treat it as public.

Reachable through the tunnel:

- The game page and its files.
- Inside a room, under `/api/rooms/<code>/`: join it, send and receive its messages. A room has a four-letter code and
  each member a secret token. A message is at most 16 KB and a room ends after 30 minutes without use.
- `/api/rooms/address`, which gives the address the QR code uses. Through the tunnel that is the tunnel's own address.
- Replay pages with their card and video, under `/replays/<id>`, for anyone who knows a replay's 10-character id. The
  id is in the replay QR code on the screen.

Not reachable through the tunnel (the server answers 403):

- `/api/level`, `/api/speech`, `/api/reveal`, `/api/portrait/...` and making a replay. These are the routes that spend
  the Gemini and ElevenLabs keys.
- Making a room (`POST /api/rooms`). Only the laptop and devices on the Wi-Fi can. So a stranger cannot fill the 50
  rooms and lock the host out.
- Uploading a replay video, the replay QR code picture and `/api/health`. The laptop's own page uses these; a guest's
  page and the replay page do not.
- Every other path under `/api/`.

Join attempts are counted. One address gets 20 a minute, then 429 until the minute is over. Through the tunnel the
address is the visitor's, from `Cf-Connecting-Ip`. A device on the Wi-Fi is counted by its own address. A browser on
the laptop is not counted. There are 279,841 room codes, so at this rate trying them all takes one address more than a
week. Guests behind one router, such as a venue's Wi-Fi, share one address through the tunnel and so share the 20.

What is still open to a stranger with the address:

- Take the guest seat of a room whose code they see or guess. The seat is not given back when a guest leaves
  (`server/lib/rooms.ts`), so the host has to make a new room. This is not fixed here.
- Many addresses together can still try codes faster than one.
- Watch a replay whose id they know.

How that is enforced: a request from the tunnel reaches the server from this machine, so the socket address alone would
let it in. `cloudflared` puts `Cf-Connecting-Ip`, `Cf-Ray` and `X-Forwarded-For` on every request it passes on. The
guard in `server/lib/localOnly.ts` treats any request that carries a `Cf-...` or `X-Forwarded-...` header, or
`Forwarded`, `X-Real-Ip`, `True-Client-Ip`, `Cdn-Loop` or `Via`, in any letter case and with any value, as passed on.
A request that was passed on gets the room paths above and nothing else under `/api/`. A browser on the laptop sends
none of these headers, and neither does the Vite dev proxy as configured.

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

- Do not point the tunnel at the Vite dev server (port 5173). The script refuses a Vite port. Vite also blocks a host
  name it does not know, so a guest would get "Blocked request" instead of the game, unless `server.allowedHosts` is
  opened in `vite.config.ts`. Do not open it: that would put the source tree on the internet. The guard itself still
  holds there: the dev proxy passes the tunnel's headers on, and the spending routes answer 403.
- Do not turn on `xfwd` in the proxy rules in `vite.config.ts`. Local play through `npm run dev:all` would then get 403
  from the AI routes.

`server/tests/devProxy.test.ts` runs the real Vite proxy against the server for all three cases.

## The hosted copy: `PUBLIC_ROOMS=1`

Everything above is about the laptop. The public copy is different: the game server runs on its own machine behind a
proxy (`docs/deploy-vultr.md`), so every visitor's request was passed on, and nobody there could make a room. Set
`PUBLIC_ROOMS=1` in that server's environment and restart it, and a request that was passed on may make a room too.
The diff is from tagrawal029's agent (issue #33).

**Only on a server that every caller reaches through its own proxy. Never on the laptop.** With the flag on, the
counting key is a header (see below). Where a caller can reach the server with no proxy in between, as on the venue
Wi-Fi, the caller writes that header itself.

The flag is on only when the value is exactly `1` (spaces around it are fine). Unset, empty, `0`, `true`, `yes`: off,
and the server behaves exactly as before. It is read on every request, so a `.env` line works as well as a real
variable.

What it changes:

- `POST /api/rooms` answers a request that was passed on. Nothing else opens. `/api/level`, `/api/speech`,
  `/api/reveal`, `/api/portrait/...`, `/api/replays`, the replay video upload and QR picture, `/api/facetime/...` and
  `/api/health` still answer 403 `local_only` to it. The account paths and `/api/heroes` answer exactly as with the
  flag off: this machine and a tunnel on it, and 403 from any other address. Behind a proxy on another address, as
  on the hosted copy, that means accounts stay off there.
- A caller is counted by the last entry of `X-Forwarded-For` when that entry is an address. This is for every room
  limit in `server/lib/roomLimits.ts`: rooms made, wrong codes, polls and open streams. The server's own proxy writes
  that entry, so a caller cannot choose it. Entries before it are not read. Without the flag all visitors behind the
  proxy count as one caller, the proxy's address.
- All callers but this machine also share one budget for making rooms.

The caps, with the flag on:

| What | Cap | Answer past it |
| --- | --- | --- |
| Rooms one caller makes | 6 a minute | 429, `Retry-After` up to 60 |
| Live rooms one caller holds | 3. A new one takes the place of one of its rooms that nobody is connected to | 429 when somebody is connected to all three, `Retry-After` up to 1800 |
| Rooms all outside callers make together | 30 a minute | 429, `Retry-After` up to 60 |
| Live rooms of all outside callers | 40 (50, less 10 kept for the machine that runs the server) | 503 `too_many_rooms` |
| A room nobody uses | removed after 30 minutes | |

Known weak spots:

- **Visitors who share an address share a budget.** The public page is on Vercel, which passes `/api/` on to the room
  server. The room server's proxy then sees Vercel's address, not the visitor's. So visitors who come through the same
  Vercel address are one caller: 6 rooms a minute between them, and 3 rooms with people in them. The fourth host gets
  429 until one of the three is left empty. The header Vercel puts the visitor's address in cannot be used: anybody
  who calls the room server's own name can write it.
- **The join count did not change.** The guard still counts joins by the socket address (20 a minute, see above). On
  the hosted copy that address is the proxy's, so all visitors together get 20 join attempts a minute, right ones
  included, with the flag on or off. One stranger can use them up.
- **Somebody with 14 addresses can hold all 40 rooms**, 3 each, and keep them by calling each one now and then. It
  takes two minutes. New hosts get 503 meanwhile.
- **A server reachable with no proxy in between must not set the flag.** A caller there writes `X-Forwarded-For`
  itself and gets a fresh budget with every address it makes up, for rooms and for wrong codes. Only the two shared
  caps still hold.

Checked over HTTP against the real server on this laptop, with no keys, from a loopback socket and from another
address (the laptop's own Wi-Fi address, standing in for the proxy):

- Flag unset, empty, `0`, `true`: a passed-on `POST /api/rooms` is 403; a plain one from this machine is 200.
- Flag `1`: the passed-on create is 200 and a second passed-on caller joins the room (200). The 18 closed paths
  (AI, speech, reveal, portrait, replays, FaceTime, health, look-alike room paths) are 403 from both sockets. The
  account paths and `/api/heroes` gave the same answers as with the flag unset, path by path.
- One caller: 6 creates are 200, the 7th is 429, also with other addresses written in front of its own. Three rooms
  with the host connected, then a 4th create: 429 with `Retry-After: 1800`.
- All callers: 30 creates from 30 addresses are 200, the 31st and 32nd are 429, this machine still gets 200. A minute
  later 10 more are 200, the 41st outside room is 503, this machine still gets 200.
- 22 joins of a wrong code from 22 visitor addresses through one proxy socket: 20 were 404, 2 were 429
  `too_many_joins`, and so was a right join after them.

`server/tests/publicRooms.test.ts` holds the same rules. Not checked: the real Caddy and the real Vercel, so what
they write in `X-Forwarded-For` comes from their documentation, and a room made and fought through the public site.

## Known limit: Cloudflare says quick tunnels do not carry event streams

Cloudflare's quick tunnel page lists these limits: no uptime guarantee, at most 200 requests in flight, and "Quick
Tunnels do not support Server-Sent Events (SSE)."

The room relay sends the other player's messages over an event stream (`GET /api/rooms/:code/events`), and it also
answers a long poll (`GET /api/rooms/:code/poll?token=...&after=N`, see docs/rooms.md). The client opens the stream
first and, when the stream says nothing for 3 seconds, polls instead, so a guest behind a quick tunnel still gets the
fight. The poll path is tested against the real relay; it was not tested through a real tunnel, because none was run.
Check it with one phone before the demo: start the script, join a room from the phone, and see that both sides move.
If it still fails, use a named tunnel on a Cloudflare account and set `PUBLIC_URL` to its https address.

## Not tested

- A real `cloudflared` and a real tunnel. The tests in `server/tests/tunnel.test.ts` run the script against a stand-in
  program that prints the lines `cloudflared` prints, copied from its source and from a published sample of its output.
- A phone opening the address, the camera prompt, and a fight through the tunnel.
- Whether room messages arrive through a quick tunnel (see above).
- What `cloudflared` prints with no internet. The stand-in prints the error its source code builds.
- That a real `cloudflared` puts `Cf-Connecting-Ip`, `Cf-Ray` and `X-Forwarded-For` on what it passes on. The script's
  check through the tunnel was run against a stand-in for the tunnel's public end, with and without those headers.
- Windows.

Tested: the guard and the join count against the real server with `curl` and with raw requests; the script against a
server that was already running, which handed out the address and dropped it again when the script stopped, also with
a stand-in that ignores the stop signal; the script against a real Vite dev server, which it refused; the Vite dev
proxy against the guard.
