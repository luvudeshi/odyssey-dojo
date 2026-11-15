# Hosting the game on Vultr

This puts the game on a Vultr cloud server at `https://<your domain>`. The kit is in `deploy/vultr/`. One script sets
the instance up. Caddy gets the https certificate by itself, which matters because a browser only gives a page the
camera over https.

`odysseydojo.club` is the domain used in this page. It is the real one.

To serve the page from Vercel and keep this instance as the room server only, see [deploy-vercel.md](deploy-vercel.md).

**Run for real once.** The kit was run on a 1 vCPU / 2 GB instance in Dallas on Ubuntu 24.04. The first build took
about ten minutes. It serves `https://odysseydojo.club` with a certificate Caddy got by itself. `www.` is not served.
The code was copied to the instance, not cloned (see "If you copy the code up instead of cloning" in step 4). See
"What was checked" at the end for what is still untried.

## What works when hosted, and what does not

The game server only trusts its own machine (`server/lib/localOnly.ts`). Every hosted visitor comes in through Caddy,
which marks the request as passed on (`X-Forwarded-For`). So a visitor gets exactly this:

Works for a visitor:

- The game page and all its files, the pose model included. Camera play and keyboard play, alone, in the browser.
- Joining a room and playing in it: everything under `/api/rooms/<code>/` (join, events, poll, send) and
  `/api/rooms/address`.
- Opening a replay page (`/replays/<id>`) that already exists.
- Making a room (`POST /api/rooms`), with `PUBLIC_ROOMS=1` in the instance's `.env` (`docs/rooms-tunnel.md`, "The
  hosted copy"). Only exactly `1` turns it on. Visitors who come through the same Vercel address share 15 new rooms
  a minute, 20 rooms in use and 20 join attempts a minute. On since 15 Nov on the live instance.
- Accounts and the hall of heroes, with a database string in `.env` and `PUBLIC_ACCOUNTS=1`. See "Accounts on the
  hosted copy" below.

Does not work for a visitor (the server answers 403, and the page uses its built-in fallbacks):

- Making a room, when `PUBLIC_ROOMS=1` is not set. "Optional: host a room" below says how the owner makes one then.
- The AI routes: `/api/level`, `/api/speech`, `/api/reveal`, `/api/portrait/...`. The visitor gets the bundled fights
  and lines instead of generated ones.
- Making a replay or uploading its video (`/api/replays`), and the replay QR picture.
- FaceTime (`/api/facetime/...`) and `/api/health`.

So the hosted copy is the offline game plus rooms and accounts. The full AI demo stays on the laptop.

Optional keys in the instance's `.env`:

- `GEMINI_API_KEY`, `ELEVENLABS_API_KEY`: the server reads them, but no visitor can reach the routes that use them, so
  they change nothing on the hosted copy. Leave them empty. That also means nobody on the internet can spend them.
- FaceTime settings (`LIVEKIT_...`, `CHERT_...`): the same. Leave them out.
- Database: accounts and the hall of heroes need `DATABASE_URL` (see `docs/accounts.md`). Without it the game runs and those two are off.

Keys only ever go in the `.env` on the instance. Never put one in git, in a command line or in a chat.

All visitors reach the server from Caddy's one address. So the join limit (20 tries a minute) and the other room
limits are shared by everybody at once. That is fine for a demo.

## 1. Claim the MLH Vultr credit

1. Register at https://mlh.link/vultr-discover . MLH sends a promo code.
2. Sign up for a Vultr account at https://mlh.link/vultr-signup .
3. In the Vultr dashboard go to Billing and enter the promo code as a **gift code**.
4. Check that the credit shows in Billing before you make anything.

## 2. Create the instance

In the Vultr dashboard: Deploy, then Deploy New Server.

- Type: **Cloud Compute, Shared CPU** (Regular Performance is enough).
- Location: **Dallas**.
- Image: **Ubuntu 24.04 LTS x64**.
- Plan: **1 vCPU, 2 GB memory**. The 1 GB plan also works, because the script adds swap, but the build is slow there.
- Turn off auto backups. Add your SSH key if you have one, else Vultr shows a root password on the instance page.
- Hostname: anything, for example `odyssey-dojo`.

Wait until it says Running. Copy its **IPv4 address** from the instance page.

## 3. Point the domain at it

At the registrar (GoDaddy), open the DNS records for the domain and add:

| Type | Name | Value | TTL |
| --- | --- | --- | --- |
| A | `@` | the instance's IPv4 address | the lowest offered |

If there is already an A record for `@` (a "Parked" one), replace it. Remove any domain forwarding.
Only the bare domain is served (`odysseydojo.club`), not `www`.

Check it from your laptop. It must print the instance's address before you go on, or Caddy cannot get a certificate:

```
nslookup odysseydojo.club
```

## 4. Run the setup on the instance

From the repo on your laptop, copy the script up and log in (use the instance's address):

```
scp deploy/vultr/setup.sh root@<instance address>:
ssh root@<instance address>
```

On the instance:

```
sh setup.sh
```

The script stops and tells you what to do at most three times. Do what it says, then run `sh setup.sh` again.

1. **The repo is private.** The script makes a key that stays on the instance and prints its public half. A repo admin
   adds it on GitHub: the repo, Settings, Deploy keys, Add deploy key, write access off. The public half is not a
   secret. (If the repo is public this step does not happen.)
2. **The settings file.** The script makes `/opt/odyssey-dojo/deploy/vultr/.env`. Open it and set the domain:

   ```
   nano /opt/odyssey-dojo/deploy/vultr/.env
   ```

   ```
   DOMAIN=odysseydojo.club
   ```

3. Then it builds and starts. The first build took about ten minutes on the 1 vCPU / 2 GB plan.

What the script does: installs Docker from Docker's own apt repository, adds 2 GB of swap on a small instance, puts
the code in `/opt/odyssey-dojo`, opens ports 80 and 443 in `ufw`, and runs `docker compose up -d --build` in
`deploy/vultr/`. It asks for no key and no password.

### If you copy the code up instead of cloning

Use this when the repo is private and has no deploy key. It is how the real run was done, from a Windows laptop.

**The copy must have Unix line endings.** A Windows checkout can have Windows line endings, and then `setup.sh` fails
at once with `set: Illegal option`. So do not `scp` the working folder. Send the files straight from git, from the
repo on the laptop (Git Bash):

```
git fetch origin
git -c core.autocrlf=false archive --format=tar.gz origin/main | ssh root@<instance> 'mkdir -p /opt/odyssey-dojo && tar -xzf - -C /opt/odyssey-dojo'
```

Then on the instance:

1. Run `sh /opt/odyssey-dojo/deploy/vultr/setup.sh` once. It installs Docker and adds the swap, then stops at the
   clone step, because `/opt/odyssey-dojo` is not a git clone. That is fine. Leave it there.
2. Write the settings file `/opt/odyssey-dojo/deploy/vultr/.env` with the one line `DOMAIN=<your domain>`
   (`.env.example` beside it has the names).
3. Build and start:

   ```
   cd /opt/odyssey-dojo/deploy/vultr
   docker compose up -d --build
   ```

To update a copied instance, send the archive again and run `docker compose up -d --build` again. Section 6 is for a
cloned instance.

## 5. Check it

1. Open `https://odysseydojo.club`. The page loads with a padlock. The first visit can take a minute.
2. Start a fight with the camera. The browser asks for the camera, and the fighter follows you.
3. Start a fight with the keyboard and play it to the end.
4. Open `https://odysseydojo.club/api/level`. It must show `{"error":"local_only"}`. If it shows anything else, stop the
   game (`docker compose down`) and tell the team: the guard is not seeing Caddy's header.

If the page does not load, on the instance:

```
cd /opt/odyssey-dojo/deploy/vultr
docker compose ps
docker compose logs caddy
docker compose logs game
```

A certificate error in Caddy's log nearly always means the A record does not point at the instance yet. Fix the
record, wait a few minutes, then `docker compose restart caddy`.

## Optional: host a room on the hosted copy

A visitor cannot make a room, but the owner can, through an SSH tunnel. The server then sees a caller that was not
passed on by a proxy, and lets it make a room. It still refuses the AI routes. **This was not tried.**

On your laptop, leave this running:

```
ssh -N -L 9000:127.0.0.1:8787 root@<instance address>
```

Open `http://localhost:9000` on the laptop and make a room there. The guest opens `https://odysseydojo.club` and joins
with the room code. The room's link and QR code already use the domain.

## 6. Update after a new merge

On the instance:

```
sh /opt/odyssey-dojo/deploy/vultr/setup.sh
```

It pulls `main`, rebuilds and restarts. Replays and certificates are kept, because they live in Docker volumes.

## 7. Tear it down

A stopped instance still costs money. Only destroying it stops the charge.

1. In the Vultr dashboard open the instance, then **Destroy** (the bin icon), and confirm.
2. Check Billing: no instance is listed any more.
3. At the registrar, delete the A record, so the domain does not point at an address someone else may get.
4. If a deploy key was added on GitHub, delete it there.

To stop the game but keep the instance (it is still charged):

```
cd /opt/odyssey-dojo/deploy/vultr
docker compose down
```

## The files

- `deploy/vultr/Dockerfile`: installs, fetches the pose model, builds the page, then runs the server, which serves `dist`.
- `deploy/vultr/Dockerfile.dockerignore`: what the build leaves out. No `.env` ever goes into the image.
- `deploy/vultr/docker-compose.yml`: the game and Caddy, with volumes for `server/data` and for Caddy's certificates.
- `deploy/vultr/Caddyfile`: https on `DOMAIN`, everything handed to the game.
- `deploy/vultr/setup.sh`: the script above.
- `deploy/vultr/.env.example`: the names of the settings.

## What was checked

Checked on a laptop, without Docker:

- `sh -n deploy/vultr/setup.sh`: the script parses.
- One production build (`npm run build`), then the server started the way the image starts it
  (`tsx server/main.ts`). The page, a game file and the pose model were fetched with the headers Caddy adds, and
  answered 200. With the same headers `/api/level`, `/api/health`, `/api/facetime/status` and `POST /api/rooms`
  answered 403, `/api/rooms/address` answered 200 with the domain, and a join to a room that does not exist got past the guard (404).
- The Dockerfile was read against `package.json`: `npm ci` runs the postinstall that fetches the pose model,
  `npm run build` makes `dist`, and `server/main.ts` serves it on port 8787.

Run for real, once, on a Vultr instance (1 vCPU, 2 GB, Dallas, Ubuntu 24.04):

- `setup.sh` as far as Docker and the swap. It then stopped at the clone step, because the code was copied up from a
  Windows laptop and not cloned.
- `docker compose up -d --build` in `deploy/vultr/`. The first build took about ten minutes.
- Caddy got its certificate by itself, and `https://odysseydojo.club` serves the game. `www.` is not served.

Not checked:

- `setup.sh` from start to end on an instance: the clone, the deploy key step, and the update in section 6.
- A browser on the real domain, step by step as in section 5: the camera prompt, a fight, `/api/level` answering
  `local_only`, a room joined through Caddy. Do these before you rely on it.
- The SSH tunnel for hosting a room.
- That the build fits in memory on the 1 GB plan.

## Accounts on the hosted copy

Accounts and the hall of heroes (`docs/accounts.md`) work on the hosted copy once three things are true (`PUBLIC_ACCOUNTS=1` needs the code from PR 384).

1. **Caddy reaches the game as a caller on the same machine.** The game answers the account paths and the hall only to its own machine (a tunnel that runs there). `docker-compose.yml` runs Caddy inside the game's network (`network_mode: "service:game"`) and the Caddyfile hands requests to `127.0.0.1:8787`, so Caddy is such a caller. Every request still carries `X-Forwarded-For`, so the routes that spend keys, room making and health stay closed to visitors. Checked on the live server: `/api/account/status` answers, `/api/level`, `/api/speech`, `/api/health` and `POST /api/rooms` still answer 403.
2. **The database string and the flag are in `.env` on the instance.** Add the three lines to `deploy/vultr/.env` there, by hand over SSH. Never put the string in git, an issue, a PR or a chat.
   ```
   PUBLIC_ACCOUNTS=1
   DATABASE_URL=postgres://USER:PASSWORD@HOST:PORT/DBNAME?sslmode=require
   DATABASE_CA_FILE=/app/certs/tiger-ca.pem
   ```
   Put the CA file (see `docs/accounts.md`, set-up step 3; it is not a secret) at `deploy/vultr/certs/tiger-ca.pem` on the instance. Leave the `DATABASE_CA_FILE` line out to run with the certificate unchecked. Then `docker compose up -d` in `deploy/vultr`.
   Set `PUBLIC_ACCOUNTS=1` even though the account paths already answer in this layout: with it (or `PUBLIC_ROOMS=1`) the server counts a caller by the address Caddy wrote, not by a header the visitor can write. To turn accounts off, take the `DATABASE_URL` line out and restart; removing only the flag does not close the paths.
   On the live instance (15 Nov) the CA file was read from the service itself: `openssl s_client -starttls postgres -showcerts -connect HOST:PORT </dev/null`, keeping the second certificate (subject `CN = ca.timescale.com`).
3. **The Account page shows the sign-in.** That is the lead's lines in `src/screens/Account.tsx` (see `docs/accounts.md`).

State on 15 Nov: 1 and 2 are done on the live instance and `https://odysseydojo.club/api/account/status` answers `{"available":true}`; `/api/heroes` answers an empty hall; no sign-up has been tried there; 3 is not on main yet.

Check: `https://<domain>/api/account/status` must answer `{"available":true}`. `{"available":false}` means the string is missing or the database did not answer; `docker compose logs game` names the reason in one line.

Limits to know:

- Behind Vercel every visitor reaches Caddy from Vercel's addresses, so visitors share the per-address budgets in `server/lib/accountLimits.ts` (40 new accounts and 30 sign-ins a minute an address). That is room enough for a demo hall, not for a crowd.
- There is no email and no password reset. A hero name belongs to whoever takes it first.
