# Hosting the page on Vercel, with the Vultr server behind it for rooms

Today one Vultr instance serves everything at `https://odysseydojo.club`: the page, its files and the room relay
([deploy-vultr.md](deploy-vultr.md)). This page describes a split:

- **Vercel** serves the page and its files (the build in `dist/`) on the bare domain, `odysseydojo.club`.
- **The Vultr instance** stays up as the room server on `api.odysseydojo.club`.
- The page keeps calling `/api/...` and `/replays/...` on its own address. Vercel passes those calls on to the Vultr
  instance. The rule is in [`vercel.json`](../vercel.json).

**Nothing was deployed.** No Vercel account was used and the live server was not touched. What was run on a laptop is
under "What was checked" at the end.

`api.odysseydojo.club` in `vercel.json` is a placeholder for the room server's name. If the name is different, change
it there, in both rewrite lines, before deploying.

## The design, and why

There were two ways to do it.

**A. Vercel passes the calls on (chosen).** `vercel.json` rewrites `/api/:path*` and `/replays/:path*` to the Vultr
instance. The page is not changed at all: it still asks its own address, so there is one origin, no CORS, and room
links keep working (a room link is the page's own address plus `?room=CODE`).

**B. The page calls the Vultr instance directly.** The build would get the server's address as a setting, and every
caller in the page would use it. More than ten files call the server today (`src/net/`, `src/screens/`, `src/account/`,
`src/ai/`, `src/replay/`, `src/facetime/`, `src/audio/`), most of them owned by the lead, and the server would need CORS
headers and a preflight answer on every route. That is a much larger change, in files this task may not touch.

A is the least change that works, so it is what `vercel.json` does. B is the way to go later if the limits below start
to hurt; "If rooms get busy" at the end says when.

### What Vercel's docs say

- **A rewrite may point at another server.** "Rewrites to external origins" are a documented use, with this very
  shape: `/api/:path*` to `https://api.example.com/:path*`.
  https://vercel.com/docs/routing/rewrites
- **Files come first.** The filesystem is looked at before rewrites are applied, so a path that is a file is never
  rewritten. The page's own files are served by Vercel and only `/api/` and `/replays/` are passed on.
  https://vercel.com/docs/project-configuration/vercel-json
- **Time limit: 120 seconds, on every plan, Hobby included.** The limits page lists the Proxied Request Timeout as
  120 seconds for Hobby, Pro and Enterprise. It covers rewrites and routes that point at an outside server.
  https://vercel.com/docs/limits
- **The 120 seconds is a wait for data, not a cap on the whole answer.** The changelog entry that raised it says the
  CDN waits up to 120 seconds for the backend to start sending, and that after the first byte the backend can run
  longer than two minutes as long as it keeps sending data at least once every 120 seconds.
  https://vercel.com/changelog/cdn-origin-timeout-increased-to-two-minutes
- **Headers the room server receives.** Vercel forwards `x-real-ip`, `x-forwarded-for` (both the visitor's public
  address), `x-forwarded-host` and `x-forwarded-proto` to an external origin. It overwrites a visitor's own
  `X-Forwarded-For`. It also sends `x-vercel-id`.
  https://vercel.com/docs/routing/rewrites and https://vercel.com/docs/headers/request-headers
- **Caching.** For projects made on or after 6 April 2026, Vercel keeps answers from an external origin in its cache
  when the origin's headers allow it. `vercel.json` turns that off for `/api/` and `/replays/` with the documented
  header `x-vercel-enable-rewrite-caching: 0`, so no room answer is ever served from a cache.
  https://vercel.com/docs/routing/rewrites

### What the docs do not say

- They do **not** name server-sent events or event streams for external rewrites. Nothing says a stream is passed on
  as it arrives, and nothing says it is held back. The only statement is the changelog one above.
- They give no cap on how long one stream may stay open in total.

### Why rooms work either way

The room relay was built for a proxy that may or may not pass a stream on:

- The event stream sends a comment line every 15 seconds (`HEARTBEAT_MS` in `server/routes/rooms.ts`). That is well
  inside the 120 seconds, so by the changelog's rule the stream stays open.
- If the stream says nothing in its first 3 seconds, or breaks, the page moves to long polling for good
  (`src/net/transport.ts`). A poll is held for at most 20 seconds (`POLL_HOLD_MS`), also well inside 120 seconds.
  This fallback was written for Cloudflare quick tunnels, which hold a stream back.
- Sends are short POSTs.

So if Vercel passes the stream on, rooms use it. If it does not, rooms use polling. Both were played through a local
stand-in for Vercel (see "What was checked"). Which of the two a real Vercel project gives is the first thing to look
at after deploying (step 6).

## What a visitor gets

| | Today (all on Vultr) | Page on Vercel, room server as it is | Page on Vercel, room server with the guard change and `PUBLIC_ROOMS=1` |
| --- | --- | --- | --- |
| The page, camera play, keyboard play | yes | yes, from Vercel | yes, from Vercel |
| Join a room and play in it | yes | yes | yes |
| Make a room | no (403) | no (403) | **yes** |
| AI fights, generated speech, god scan by AI, FaceTime | no (403), built-in fallbacks | the same | the same |
| Make or upload a replay | no (403) | the same | the same |
| Open a replay page that exists | yes | yes | yes |
| Accounts and the hall of heroes | no | no | no |

Why the middle column is no better than today for rooms: the room server refuses `POST /api/rooms` from any request
that was passed on by a proxy (`server/lib/localOnly.ts`). Caddy marks every request that way, and so does Vercel. So
the split by itself moves the page to Vercel and changes nothing else. Hosting a room needs the guard change below.

Accounts and the hall of heroes are refused on the hosted copy for a different reason: the guard answers them only
from the server's own machine, and inside Docker Caddy is another address. This was read from the code, not tried.
It is the same today and is not part of this change.

## The guard change (not in this PR)

`server/lib/localOnly.ts` belongs to luvudeshi, so the change is a tested diff for him, not part of this PR. It adds
one setting, `PUBLIC_ROOMS=1`, off by default:

- **Off** (not set, empty, `0`, anything but `1`): the server behaves exactly as today.
- **On**: a request that was passed on may also make a room. Nothing else opens: AI, speech, the god scan, FaceTime,
  replay upload and health stay refused.
- The limits a stranger meets, all reused from `server/lib/roomLimits.ts` and `server/lib/rooms.ts`:
  - 6 new rooms a minute and 3 rooms at once per caller; a fourth takes the place of an empty one the caller left.
  - 30 new rooms a minute for all outside callers together (new, only with the setting on).
  - 40 rooms alive at once for outside callers (50, less the 10 kept for the server's own machine); then 503.
  - A room is removed 30 minutes after its last use.
- With the setting on, a caller is counted by the last entry of `X-Forwarded-For`, which is the one Caddy writes.
  Without that every visitor would share one budget, because every request reaches the server from Caddy's one address.

**One limit to know.** Behind Vercel, the address Caddy sees is Vercel's, not the visitor's. Visitors who arrive
through the same Vercel address share the "6 a minute, 3 at once" budget. For a demo that is fine. Two ways past it
are under "If rooms get busy".

## Steps

A short gap is unavoidable: between step 2 and step 5 the bare domain has no site. Have the Vercel project ready
(steps 3 and 4) before you start step 2, and the gap is a few minutes.

### 1. Add the `api` name

At the registrar, add a record. Leave the existing `@` record alone for now.

| Type | Name | Value |
| --- | --- | --- |
| A | `api` | the Vultr instance's IPv4 address |

Check it: `nslookup api.odysseydojo.club` must print the instance's address.

### 2. Make the Vultr instance the room server

On the instance:

```
nano /opt/odyssey-dojo/deploy/vultr/.env
```

Change the domain to the api name. Caddy then gets a certificate for it by itself.

```
DOMAIN=api.odysseydojo.club
```

Once the guard change is merged, also add this line, so visitors can make rooms:

```
PUBLIC_ROOMS=1
```

Then restart. On an instance that was cloned:

```
sh /opt/odyssey-dojo/deploy/vultr/setup.sh
```

On an instance the code was copied to (how the real one was set up, see "If you copy the code up instead of cloning"
in [deploy-vultr.md](deploy-vultr.md)): send the new archive first if the code changed, then

```
cd /opt/odyssey-dojo/deploy/vultr
docker compose up -d --build
```

Check `https://api.odysseydojo.club/api/level` in a browser. It must show `{"error":"local_only"}`.

Nothing else in `deploy/vultr/` changes. The instance still builds and serves the page too, on the api name. That
copy is harmless and is a way back if Vercel is ever down: point `@` at the instance again and set `DOMAIN` back.

### 3. Make the Vercel project

A free (Hobby) account is enough. Sign up at https://vercel.com/signup . There are two ways to deploy. Both read
`vercel.json`, so there is nothing to fill in: framework Vite, install `npm ci`, build `npm run build`, output `dist`.

**The repo's owner imports it.** The repo is private and belongs to a personal GitHub account, so only its owner can
connect it. At https://vercel.com/new pick the repo and press Deploy. After that every merge to `main` deploys by
itself. (Vercel's rule that only the owner's commits deploy on Hobby is for GitHub organizations. The docs say it
does not apply to collaborators on a personal account. https://vercel.com/docs/git )

**Anyone with the code deploys from a laptop.** This works for a teammate who does not own the repo. From a clean,
up to date `main`:

```
npx vercel@latest login
npx vercel@latest link
npx vercel@latest deploy --prod
```

The CLI uploads the source and Vercel builds it. A Hobby account may upload 100 MB of source from the CLI
(https://vercel.com/docs/limits ). The whole repo is about 198 MB, mostly `docs/` screenshots, so
[`.vercelignore`](../.vercelignore) leaves out everything the page build does not read; what is left is about 37 MB.
It also leaves out `.env` files, which hold keys. Deploying this way has to be repeated by hand after each merge.

Either way, the build fails on purpose if the pose model was not fetched (`npm ci` runs `scripts/vendor-pose.sh`,
which downloads it). A page with no pose model has no camera play.

### 4. Try it on the Vercel address first

Vercel gives the project an address ending in `.vercel.app`. Open it. The page must load, and
`https://<that address>/api/level` must show `{"error":"local_only"}`: that answer comes from the Vultr instance,
through the rewrite.

### 5. Point the bare domain at Vercel

In the Vercel project: Settings, Domains, Add Existing, `odysseydojo.club`. Vercel then shows the record to set.
(https://vercel.com/docs/domains/working-with-domains/add-a-domain )

At the registrar, change the `@` record from the instance's address to the value Vercel shows:

| Type | Name | Value |
| --- | --- | --- |
| A | `@` | the address Vercel shows for this project |
| A | `api` | the Vultr instance's IPv4 address (from step 1, unchanged) |

Use the value Vercel shows, not one copied from somewhere else. Wait until the Domains page says the domain is
configured. Vercel gets the https certificate by itself.

### 6. Check it

1. `https://odysseydojo.club` loads with a padlock. In the browser's network tab the page's answer has `server: Vercel`.
2. A keyboard fight plays to the end, and a camera fight starts.
3. `https://odysseydojo.club/api/level` shows `{"error":"local_only"}`.
4. Join a room. With `PUBLIC_ROOMS=1` and the guard change: on one device open Multiplayer and "Open a room", on a
   second device open the link or type the code, press Start, and play. Both screens must show the same health and score.
5. In the network tab of either device, look at the room calls. One long `events` request means the stream gets
   through. Many `poll` requests mean Vercel holds the stream back and the page fell back to polling. Both are fine;
   write down which it was, here, because the docs do not say.

## Limits and costs

- **Requests.** Hobby includes 1,000,000 CDN requests and 10 GB of Fast Origin Transfer a month. Past a limit, the
  docs say that in most cases the feature is off until 30 days have gone by (https://vercel.com/docs/plans/hobby ). Every room call
  that goes through Vercel is one request. The host sends its state about 15 times a second and each of the guest's
  moves is a send. In the local run, one fight of two and a half minutes with a guest pressing keys all the time made
  about 5,100 calls. So a month's allowance is a few hundred room fights. A solo fight makes no calls at all.
- **Time.** 120 seconds without data ends a passed-on request. The relay never waits that long (see above).
- **File sizes.** The build is 70 MB in 209 files. The largest are the two MediaPipe wasm files (14.7 MB each), the
  pose model (5.8 MB) and the menu music (3.2 MB). Vercel's limits page gives no size limit for one static file, and
  says the number of files a build puts out has no upper limit, so nothing is over a documented limit.
  The only documented size limit that applies is the 100 MB of source from the CLI, handled by `.vercelignore`.
- **Caching.** Files under `/assets/` have a hash in their name, so `vercel.json` lets browsers keep them for a year.
  Everything else (models, sound, the pose model, `index.html`) keeps Vercel's default and is checked on each visit,
  because those names do not change when the file does.
- **No fallback to `index.html`.** The game has one page and no paths of its own (a room link is `/?room=CODE`), so
  `vercel.json` has no catch-all rewrite. An unknown path is a 404, as it should be.

## If rooms get busy

- **Send the room calls straight to the Vultr instance (design B).** This takes Vercel out of every room call: no
  request allowance, one hop less, and Caddy sees each visitor's own address, so the per-caller limits are per visitor.
  It needs a server address setting in the page, used by the callers in `src/net/` and `src/screens/roomNet.ts`, and
  CORS on the room routes. The stream alone could go direct first, as a smaller step.
- **Let the room server trust Vercel's `x-forwarded-for`.** Vercel documents a way to put a secret header on every
  passed-on request (a `routes` transform with an environment variable), so the origin can tell Vercel's requests
  from others (https://vercel.com/docs/routing/rewrites ). With that the server could count each visitor by the
  address Vercel reports. Not built.

## What was checked

On a laptop, with no outside account and nothing deployed:

- One production build (`npm run build`): 70 MB, 209 files, every file under `dist/assets/` has a hash in its name.
- `vercel.json` parses, and its rewrites and headers were read by a small local stand-in for Vercel: a static server
  for `dist/` that serves files first, then passes `/api/` and `/replays/` on to a local game server and adds
  `X-Forwarded-For`, `X-Real-Ip`, `X-Forwarded-Host`, `X-Forwarded-Proto` and `x-vercel-id`, as Vercel's docs describe.
  The game server ran on another port with the guard change applied and `PUBLIC_ROOMS=1`.
- Through the stand-in: the page, a hashed file (with the one-year cache header) and the pose model answered 200.
  `POST /api/rooms` answered 200. `/api/level`, `/api/speech`, `/api/reveal`, `/api/health`, `/api/facetime/status`
  and `POST /api/replays` answered 403. `/api/rooms/address` answered 200. An unknown path answered 404.
- Two pages of headless Chrome, a host and a guest, both through the stand-in: the host opened a room, the guest
  joined by the room link, the host started, and both pages showed the same monster health, player health, score and
  prompt at every look for the 60 seconds until the players were struck down. All room calls answered 200. The
  messages came over the event stream.
- The same again with the stand-in holding every event stream back: both pages moved to polling by themselves and
  still showed the same fight.
- The guard change: its own tests (8) and the existing guard and room tests (34 more) pass with it applied.

Not checked:

- A real Vercel project: the build there (that `npm ci` fetches the pose model on Vercel's build machine), the
  rewrite to a real outside server, and whether Vercel passes an event stream on as it arrives.
- Caddy between Vercel and the game server. The stand-in talked to the game server directly.
- DNS, certificates, and the gap while the domain moves.
- The request count of a real fight between two people; the figure above is from a script pressing keys.
- `scripts/rooms-smoke.mjs` was not used for the run: on `main` it stops at "guest joins by typing the code" even
  straight against the server, so the two pages were driven by a short script written for this check.
