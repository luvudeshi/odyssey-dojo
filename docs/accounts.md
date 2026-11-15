# Accounts on Tiger Data

A player can make an account with a hero name and a password. Their progress, achievements, volume settings and character are then saved to the account and come back on another browser. Playing without an account works as before: everything stays in the browser and no network is needed.

The database is Tiger Data, the sponsor's hosted Postgres. The server reaches it with one connection string, `DATABASE_URL`.

## Where this stands

- Built: the six routes, the rules, the limits, the database code, the browser's sync and merge, the sign-in form.
- **It runs against the real Tiger Data service** (free plan, PostgreSQL 18.6). The driver is `pg` 8.23.1, pinned in `package.json` with the lockfile. The 15 database tests pass there, and the two-browser walk under "What was run against the real database" was done on it.
- The sign-in form is not on the Account page yet. `src/screens/Account.tsx` is the lead's file; the two lines are in the PR. Until they land nothing imports the sync, so the game makes no account request at all.
- The "Hall of heroes" list is not built yet.

## Set it up on the demo laptop

Today the demo laptop runs the server with no keys at all. With nothing done, accounts are off and the Account page says so.

1. **Make a Tiger Data service** (free plan, no card) at the Tiger Data console. Copy its connection string. It looks like `postgres://USER:PASSWORD@HOST:PORT/DBNAME?sslmode=require`. For the demo laptop, luvudeshi sends his string to Toyeshh directly.
2. **Put the string in `.env`** at the repo root, alone on one line: `DATABASE_URL=postgres://...`. Never commit `.env`. Never paste the string in an issue, a PR, a chat or a test.
3. **Install the driver:** `npm ci`. It is `pg` 8.23.1, in `package.json`.
4. **Restart the server** (`npm run server`). The first line it logs has `"accounts":true`, which only means the variable is set.
5. **Check it:** `curl http://localhost:8787/api/account/status` answers `{"available":true}`. The three tables are made at that first request, which took half a second here. The log says `accounts_ready`.
6. **Make the demo's hero names first**, on the laptop itself, before the tunnel is opened. There is no email and no reset, so a name belongs to whoever takes it first.

If it answers `{"available":false}`, the server log says why, in one line:

| Log line | Meaning |
| --- | --- |
| `accounts_unavailable` `bad_url` | `DATABASE_URL` is not a `postgres://` address. |
| `accounts_unavailable` `not_encrypted` | The address has no `sslmode=require` (or `verify-ca`, `verify-full`) and is not on this machine. Nothing after the address may be on its line in `.env`. |
| `accounts_unavailable` `bad_ca_file` | `DATABASE_CA_FILE` names a file that cannot be read. Accounts stay off rather than run unchecked. |
| `accounts_unavailable` `no_answer` | The database did not answer. The `code` beside it says why (below). |
| `accounts_tables_failed` | It answered, but the tables could not be made. |
| `accounts_query_failed` | A later statement failed. Three in a row turn accounts off for 5 seconds, then it is tried again. |
| `accounts_connection_lost` | The database closed a connection nobody was using. The next request opens a new one. |

**A log line holds a short code, never what the driver said and never a part of the connection string.** Postgres can repeat a value it was sent in its message, and Node names the address it tried, so the message is not logged at all. The codes you are most likely to see:

| Code | Meaning |
| --- | --- |
| `timeout` | No answer within the limit (2.5 s to connect, 3 s a query). |
| `ECONNREFUSED`, `ENOTFOUND` | Nothing listens at that address, or the host name does not exist. Check the string. |
| `28P01` | Wrong password or user. |
| `3D000` | No such database. |
| `53300` | The service has no free connection left. |
| `57014` | The database stopped a statement at its own 2 s limit. |
| `SELF_SIGNED_CERT_IN_CHAIN` | Certificate checking is on and the service signs its own certificate (see "Encryption"). |
| `connection_closed`, `error` | The connection ended, or something with no code. |

After a failed start the server tries the database again at most every 15 seconds, so one that comes back is found without a restart.

To take accounts off again: remove the line from `.env` and restart.

## Encryption to the database

The connection is always encrypted, but for a Postgres on this machine with no `sslmode` (a test database).

- **`sslmode=require` (what Tiger Data's string says): encrypted, and the certificate is not checked.** A free Tiger Data service presents a certificate it signed itself (their docs: free services get no CA-signed one), so there is nothing to check it against. This is what `psql` does for `require`. The password and the saves cannot be read on the way. What it does not stop: a machine that sits between this server and the database and pretends to be the database.
- **`DATABASE_CA_FILE=/path/to/ca.pem` in `.env`, or `sslmode=verify-ca` or `verify-full` in the string: the certificate is checked in full**, the chain against that file (or against the CAs Node trusts when no file is named) and the host name. `sslrootcert=` in the string is read as the CA file too. Use this on a paid service, which has a CA-signed certificate.
- A CA file that cannot be read leaves accounts off (`bad_ca_file`). Checking is never dropped silently.
- Checked on the real service: `require` opens; `verify-ca`, `verify-full` and `require` with a public CA list are all refused with `SELF_SIGNED_CERT_IN_CHAIN` and accounts stay off.

The `pg` driver reads `sslmode=require` as "check the certificate", refuses the free service and prints a warning about `sslmode` at every start. So the server never hands it the connection string: `server/lib/db.ts` reads the string and gives the driver the host, user, password and database one by one, with the encryption decided as above. The string's other parameters are not passed on.

The limits on the connection: 4 connections at most (a free service has no pooler; it allows about 90), 2.5 s to connect, 3 s a query, and the database itself stops a statement after 2 s. A connection nobody used for 30 s is closed, so the first request after a pause opens a new one (about 0.3 s more, see the timings below). The database sees this server as `odyssey-dojo` in `pg_stat_activity`.

## What the Account page shows

The sign-in form is one line and one button in the Hero card. The name and password are asked in a dialog.

| State | The Hero card says |
| --- | --- |
| No database, the database is down, or the server cannot be reached | "Saved in this browser only. Accounts are not available here." |
| Signed out | "Saved in this browser only." and the button "Sign in or create account". |
| The dialog | Hero name, Password, "Sign in", "Create account", "Back". Under them, what went wrong, in plain words. |
| Signed in | "Signed in as *name*." then "Saved to your account.", "Saving..." or "Not sent yet. Kept in this browser.", and "Sign out". |

- Signed out, the game asks the server nothing until the Account page opens. Then it asks once whether accounts are on.
- Signed in, the save is fetched when the game starts and each time the Account page opens. It is sent 1.5 seconds after a fight or a change.
- "Not sent yet" is sent again on the next change, when the Account page opens, and when the game next starts. Nothing keeps knocking on a server that is down.
- Signing out keeps the progress in the browser.
- A sign-in page opened on another device over the Wi-Fi (plain HTTP) says accounts are not available. Use the tunnel address (HTTPS) from a phone.

## What is stored

Three tables, made with `create table if not exists`:

- `accounts`: an id, the hero name, the name's key (unique), the password hash and its salt, when it was made.
- `sessions`: the SHA-256 of a session token, the account, when it was made, when it runs out.
- `saves`: one JSON document per account, and when it was written.

Never stored: the password, the session token, an email or anything else about the person.

- **Password:** 8 to 200 characters. Hashed with Node's `scrypt` (N = 2^17, r = 8, p = 1, a 16-byte random salt per account) and compared with `timingSafeEqual`.
- **Token:** 32 random bytes. The browser gets it once, at sign-up or sign-in, keeps it in `localStorage` under `odyssey-dojo.session`, and sends it as `Authorization: Bearer <token>`. There is no cookie. A session lasts 30 days. An account keeps 5 sessions; one more ends the oldest.
- **Save:** `{ version: 1, profile, settings, character, achievements? }`. The profile and the settings are whole objects, stored and given back as they came. The server checks size and shape only: 32 KB in all, 200 keys an object, 200 entries a list, 3 levels deep, 200 characters a text, numbers within a million million. So a field added to the profile later needs no change on the server and is never dropped. The browser reads the profile back through `parseProfile` and the settings through `parseSettings`. The server never acts on what is in a save.

To delete an account by hand: `delete from accounts where name_key = lower('The Name');`. Its sessions and its save go with it.

## How two browsers stay the same

- **Progress is joined, never replaced.** Lists (cleared stops, styles, achievements) hold what both sides have. Counts (fights, wins, blocks, best score, move counts) take the larger. A field is joined by its kind, so a new profile field is joined too.
- **Every send is a fetch first.** The account's save is read, joined with the browser's, and only then written. A browser that was not looking cannot put an old save over a win made elsewhere.
- **Only what was changed here wins.** A browser that renamed the hero or moved a slider sends that. A browser that only won a fight does not also send its old name and volume.
- **Machine settings stay on the machine.** Only the three volumes and the key hints go with the account. Camera or keyboard, graphics quality and the mirror do not, so a second browser on the keyboard cannot turn the demo laptop's camera off.
- **A shared laptop.** When one player signs out and a different one signs in, the second starts from their own account and does not inherit the first one's stops. This only happens when the first account had everything and nothing was played since. Otherwise the progress in the browser is joined in, as it always was, so nothing is ever lost.
- **Two tabs.** A tab follows a sign-in or sign-out made in another tab, and never writes its old session back.

Limits of this, worth knowing:

- Two browsers that both play before either fetches again each add to their own old count. The larger wins, so "fights" can come out one short. Stops, styles and achievements are never lost.
- The hero name on a merge is the one saved in the account. It is the sign-in name only until the player renames the hero.

## What Tiger Data does for the game

Read this if you have 30 seconds. Tiger Data is the game's memory in two ways.

1. **Accounts.** A hero name, a password and one saved game per player, in plain Postgres tables. Sign in on any browser and the road home is where you left it.
2. **The hall of heroes.** Every finished fight of a signed-in player is one row in a time series. The Account page shows the best scores tonight and of all time, how many fights were fought this hour, a line of the last six hours and which monster fell most. All of it comes from **one statement, one round trip, about 45 ms** on a free service, and the database is asked at most once in five seconds however many people look.

What is used, and why each earns its place:

| Tiger Data feature | What it does here |
| --- | --- |
| **Hypertable** `fights`, one chunk a day | "Tonight" is the last 24 hours. The planner opens the last day's chunk and no other, however many nights of fights are behind it. |
| **Columnstore** on chunks older than a day, grouped by account | Old fights are kept small. TimescaleDB 2.32 sets this policy itself when the hypertable is made. |
| **Continuous aggregate** `fights_hourly`, real-time | Per hero and hour: fights, wins, best score, and the stop, style and god of that best fight. "All time" reads these few rows per hero, not every fight ever fought. Real-time means a fight of this minute is in the list at once, before the next refresh. |
| **Refresh policy**, every 30 minutes | Writes down the hours that are over. No start offset, so hours missed while a free service slept are caught up. |
| **`time_bucket_gapfill`** | Fights per ten minutes for the activity line, with the empty buckets filled in by the database. |
| **`last(value, time)`** and **`last(value, score)`** | The newest hero name of an account, and where its best score was made, in one pass with no join and no second query. |

The table (`server/lib/heroes.ts`):

```sql
create table if not exists fights (
  at timestamptz not null,
  account_id uuid not null references accounts (id) on delete cascade,
  hero text not null, stop_id text not null, won boolean not null, score integer not null,
  style_id text not null, god_id text, seconds real, best_combo integer
) with (tsdb.hypertable, tsdb.partition_column = 'at', tsdb.chunk_interval = '1 day',
        tsdb.segmentby = 'account_id', tsdb.orderby = 'at desc');
```

The continuous aggregate behind "all time":

```sql
create materialized view if not exists fights_hourly
with (timescaledb.continuous, timescaledb.materialized_only = false) as
select time_bucket(interval '1 hour', at) as bucket, account_id,
  count(*) as fights, count(*) filter (where won) as wins, max(score) as best, min(at) as first_at,
  last(hero, at) as hero, last(stop_id, score) as best_stop, last(style_id, score) as best_style, last(god_id, score) as best_god
from fights group by bucket, account_id
with no data;

select add_continuous_aggregate_policy('fights_hourly', start_offset => null::interval,
  end_offset => interval '1 hour', schedule_interval => interval '30 minutes', if_not_exists => true);
```

Two of the parts of the one statement that reads the hall (`$1` is now, `$2` a day ago, `$4` and `$5` the ends of the activity line):

```sql
-- Tonight: the best score of each hero, and where it was made.
select account_id, last(hero, at) as hero, max(score) as best,
  last(stop_id, score) as stop, last(style_id, score) as style, last(god_id, score) as god, min(at) as since
from fights where at > $2 and at <= $1
group by account_id order by best desc, since asc limit 10;

-- The activity line: 36 buckets of ten minutes, the empty ones as zero.
select time_bucket_gapfill(interval '10 minutes', at, $4, $5) as bucket, coalesce(count(*), 0) as fights
from fights where at >= $4 and at < $5 group by bucket;
```

What this is not: at tonight's size (a few hundred fights) plain Postgres would answer as fast. The design is what keeps the same two lists and the same line one statement when the table holds every fight of every night.

## The hall of heroes

- **When a fight is written.** A signed-in player finishes a fight (won or lost) on the road. The browser sends it in the background once, after the profile has it. The result screen never waits for it and never shows an error from it. Signed out, a fight sends nothing.
- **What is written.** When (the server's clock), whose (the account of the session), the hero name on the player's screen, the stop, won or lost, the score, the fighting style, the god the scan found (if any), how many seconds the fight took and the best combo.
- **What the hall shows.** The best score of each hero in the last 24 hours and of all time, ten each: a podium for the first three, a list to ten, the reader's own row marked "You". Under it: fights this hour (or in all), fights per ten minutes over six hours, and the stop beaten most tonight. It is read when the Account page opens and every ten seconds while that page is in front. With accounts off there is no hall and the page is as it was.
- **A tie** goes to the hero who fought first.

Two routes (`server/routes/heroes.ts`):

| Route | Answers |
| --- | --- |
| `POST /api/account/fights` (Bearer) `{ fight: { stop, won, score, style, god?, seconds?, bestCombo?, hero? } }` | 201 `{ recorded: true }`, 400 `{ error: "invalid", field }`, 401 `signed_out`, 413 `too_big`, 429 `slow_down`, 503 `unavailable` |
| `GET /api/heroes` (no sign-in needed; a Bearer only marks the reader's row) | 200 `{ at, tonight, allTime, lastHour, fightsEver, stops, activity }`, 429, 503 |

- A row of `tonight` and `allTime` is `{ hero, score, stop, style, god, you }`. There is no id of any account in the answer.
- `activity` is `{ minutes: 10, until, fights: [36 numbers] }`, oldest first. `stops` is `{ stop, fights, wins }` for the last 24 hours.
- Both paths answer the tunnel and the laptop only, like the account paths (`server/lib/localOnly.ts`).

**Scores are the browser's own word.** The fight runs in the browser, so the server cannot check a score. It is a game, not a bank. What bounds a made-up one:

| A stranger tries to | Bound |
| --- | --- |
| Put a made-up score on the list | They can, up to 30,000 (a long clean win at the last stop is under 10,000). It takes an account, and an account is one row on each list. Remove one with `delete from accounts where name_key = lower('The Name');`: its fights and its row go with it. |
| Write a fight as another player | The account comes from the session and nowhere else. A body cannot name one. |
| Show another hero's name | They can: the hero name is what the player calls the hero, cleaned like an account name (3 to 20 characters, nothing unseen). Two rows may show the same name. |
| Fill the table with fights | 4 a minute and 90 an hour an account, whoever sends them. 120 a minute for all strangers together, counting only fights that were written: 172,800 rows a day at the very most. A body is 1 KB at most and is not read before the session is known. |
| Keep the database busy by reading the hall | The hall is answered from memory. The database is asked once in 5 seconds, by one statement, which takes one of the two places strangers have. 300 reads a minute an address. |
| Keep it busy with made-up sessions | 30 unknown sessions a minute an address are looked up; past that the hall is given without a mark and a fight is refused. |
| Learn who is who | Hero names and scores only. No id, no time of a single fight, no account name beside the hero name. |

Things to know:

- **A database without TimescaleDB has no hall.** The server logs `heroes_unavailable` `no_timescaledb` once, both routes answer 503, accounts work as before. A local Postgres for tests is such a database.
- **The hypertable and the aggregate are made at the first fight or the first reading of the hall**, after the account tables. The log says `heroes_ready`.
- **A change to the columns of `fights` or `fights_hourly` needs the old ones dropped by hand** (`drop materialized view fights_hourly; drop table fights;`). `create ... if not exists` does not alter what is there.
- **The time of a fight is the laptop's clock**, like every time in the account tables. A laptop clock more than an hour behind would keep a fight out of "all time" until the next refresh (30 minutes at most).
- `delete from fights where ...` by hand leaves the hours already written down in `fights_hourly` until `call refresh_continuous_aggregate('fights_hourly', null, null);`. Deleting the account needs nothing more.
- Only fights on the road are sent (what `recordFight` is given). The guest of a room and the Training Dojo send nothing.
- The god is sent only when `src/App.tsx` passes it to `recordFight` (one line, the lead's file, in the PR). Without it the god is empty and everything else works.

Not checked for the hall:

- The real `fights` and `fights_hourly` (no prefix) have not been made yet. The tests and the pictures used tables under a prefix of their own, since dropped. The first start of the server with this code makes the real ones.
- Nothing that takes a day or more: a chunk moving to the columnstore, a fight deleted out of a chunk that is already there, the refresh policy over many hours. The policy was seen to run once, right after it was made.
- The tunnel. The two paths were called with a tunnel's headers on a loopback socket, not through a real one.
- A camera fight and the god in a row: the keyboard fight that was played in headless Chrome has no god.
- Two real browser profiles looking at one hall.
- Where the hall sits on the Account page is the lead's call. The pictures were taken with one line added to `src/screens/Account.tsx`, not committed.

## The routes

| Route | Answers |
| --- | --- |
| `GET /api/account/status` | 200 `{ available }`. Never fails, and answers within 4 seconds. |
| `POST /api/account/signup` `{ name, password }` | 201 `{ token, name }`, 400 `{ error: "invalid", field }`, 409 `name_taken`, 429 `slow_down`, 503 `unavailable` |
| `POST /api/account/signin` `{ name, password }` | 200 `{ token, name }`, 401 `wrong_name_or_password`, 429, 503 |
| `POST /api/account/signout` (Bearer) | 204, also for a token nobody has and for no token. 429 or 503 when the session could not be ended. |
| `GET /api/account/save` (Bearer) | 200 `{ save, updatedAt }` (both null before the first save), 401 `signed_out`, 429, 503 |
| `PUT /api/account/save` (Bearer) `{ save }` | 200 `{ updatedAt }`, 400 `{ error: "invalid", field }`, 401, 413 `too_big`, 429, 503 |

Details that are easy to miss:

- The name is cleaned the way the profile name is (control characters dropped, cut to 20). Characters nobody can see (zero-width space, soft hyphen, the marks that turn text right to left) are dropped too. Then the spaces at its ends go. It must be 3 characters or more. The answer carries the name as stored.
- Two names are the same account without regard to case, to how an accent was typed, or to the number of spaces between words. Letters of two alphabets that look alike (a Latin and a Cyrillic "O") are still two names.
- A sign-in that fails gets one answer whatever the reason: an unknown name, a wrong password, a body that is not a name and a password. An unknown name costs the server the same password hash as a wrong password.
- With accounts off, every route but status answers 503 before it reads a body.
- A 429 or 503 on sign-out means the session is still in the database. The browser forgets its token anyway.

## What a stranger can do, and what bounds it

The public tunnel reaches `/api`. `server/lib/localOnly.ts` opens exactly these five paths to it and nothing else under `/api/account/`. **Another device on the Wi-Fi is refused (403)**: the server speaks plain HTTP there, and a password must not cross the venue's network in the clear. Through the tunnel it travels inside HTTPS. The numbers are in `server/lib/accountLimits.ts` and `server/lib/accounts.ts`.

Two rules keep one stranger from locking the others out:

- **A budget is only spent by a request that costs something.** An empty or malformed request is refused on a cheap count of its own (60 sign-up and sign-in requests a minute an address). A typo, a taken name or a request with no token uses up nobody's budget.
- **Nothing is shared by all strangers except the count of accounts really made.** What many addresses can do at once is held by two gates, not by a count: one password hash at a time, and two strangers' database calls at a time.

| A stranger tries to | Bound |
| --- | --- |
| Find out which names exist | Sign-in never says. Sign-up does say when a name is taken (it has to). A name is a hero name, not a person. |
| Guess a password | 30 sign-ins a minute an address. On one name: 10 wrong passwords in 10 minutes from one address, 100 from all addresses together (14,400 a day at most). A right password is not counted. |
| Lock a player out of their name | Ten wrong tries hold only the address they came from. Holding a name for everybody takes 100 wrong tries every 10 minutes from ten addresses or more. The laptop is never held. |
| Burn the CPU with password hashes | One hash at a time, at most 8 waiting, the rest get 429. So one core at most. A hash is about 0.2 s and needs 128 MB while it runs. |
| Fill the database with accounts | Only an account that was made is counted: 40 in 10 minutes an address, 120 for all strangers, 1,900 at most. The last 100 places are kept for the laptop. Past that sign-up answers 503. |
| Fill it with saves | One save per account, 32 KB at most as sent, so 64 MB at the very most. |
| Fill it with sessions | 5 per account. Sessions that ran out are removed at the next sign-in. |
| Keep the database busy | Strangers' database calls run two at a time, 16 may wait, the rest get 429. A token is counted before the database is asked: 30 unknown tokens a minute an address. A known token is remembered for 5 minutes and counted for its account: 120 requests and 60 writes a minute. Status asks the database at most once in 5 seconds. |
| Turn accounts off for everybody | One failed or slow query does not. Three in a row with none working between them do, for 5 seconds. The pool has 4 connections and strangers use 2, so the laptop always finds one free. A statement cannot run longer than 2 s: the database stops it. |
| Send a huge body | Sign-up and sign-in read 2 KB, a save 32 KB. A body that says it is longer is refused unread. A save body is not read at all before the token is known. |
| Use another player's save | No route takes an account id. A request reaches the row of the session it carries and no other. |
| Run SQL | Every value goes to the database apart from the statement text. |
| Use a signed-in browser from another site | There is no cookie to ride on. The token is a header that only this game's page sends. |
| Read a password off the Wi-Fi | The account paths answer the tunnel (HTTPS) and the laptop itself only. |

Things to know about these limits:

- **The laptop that runs the server is never counted or refused** (but for the 60 writes a minute to one account). A request that carries any proxy or tunnel header is never taken for the laptop.
- **A venue's Wi-Fi is one address through the tunnel.** Everybody behind it shares the per-address numbers. They are set with a hall in mind.
- **Somebody with many addresses can still stop strangers from signing up**, by making 120 real accounts every 10 minutes until the 1,900 are used. Nothing without an email or a captcha stops that. The laptop keeps its 100 places, so make the demo accounts there.
- **A session that ran out, or was ended to make room for a sixth, can stay good for 5 minutes more** on a token the server has just seen. Signing out ends it at once.
- **Do not start Vite with `--host` while accounts are on.** In `npm run dev:all` a request through Vite's proxy looks like the laptop's own: it would skip every limit and carry the password over plain HTTP. The tunnel goes straight to the server, so its visitors are counted.

## When the database is down

- `GET /api/account/status` answers `{"available":false}`. Every other route answers 503 at once, before reading a body.
- A signed-out player sees "Accounts are not available here." and plays as before.
- A signed-in player keeps playing from the browser. The card says "Not sent yet. Kept in this browser." and the save goes when the database is back.
- Nothing throws into the game and the offline check is not touched: `npm run preflight -- --offline` passes with no `DATABASE_URL`.
- No error text from the database reaches the browser. The log gets one line with a short code.
- **A database that stops answering while the server runs** (tried with the real service behind a forwarder that swallowed every byte): each request still got its 503 within 3 s, the fourth and later ones at once, `/api/health` answered in 1 ms throughout, and the server kept running. Accounts came back by themselves 6 s after the database did, with the save as it was.
- A `DATABASE_URL` that points at a port nothing listens on: status answers `false` in a few milliseconds. At a port that takes the connection and says nothing: in 2.5 s, then at once for the next 15 s.

## Tests

No database is needed for these:

```
npx vitest run server/tests/accountRules.test.ts server/tests/accounts.test.ts server/tests/accountLimits.test.ts server/tests/db.test.ts server/tests/accountRoute.test.ts server/tests/localOnly.test.ts tests/accountName.test.ts tests/accountContract.test.ts tests/accountClient.test.ts tests/accountMerge.test.ts tests/accountSave.test.ts tests/accountSync.test.ts
```

They cover the name, password and save rules, the hashing and the tokens, every limit and what is given back, every way the database can fail to open, the routes with accounts off, the order in which the routes count and ask, who may reach the routes, the merge, the sync and the client.

What stands in for what, so nobody takes it for the real thing:

- `server/tests/db.test.ts` uses made-up drivers that fail in each way. One of them answers `select 1`, to check what the driver is handed.
- `server/tests/accounts.test.ts` uses a `Db` that keeps nothing and answers with fixed rows or fails, to check what accounts do with an answer or a failure.
- `server/tests/accountRoute.test.ts` uses an `Accounts` object with fixed answers, to check the order in which the routes count, refuse and ask. It stores no account and no save.
- The browser tests (`tests/account*.test.ts`) use a made-up `fetch` that answers the six routes from memory (`tests/helpers/accountKit.ts`). It checks nothing a real server would.

None of these is a database, and none proves a statement. **The database tests talk to a real Postgres:**

```
TEST_DATABASE_URL='postgres://...' npx vitest run server/tests/accountsDb.test.ts
```

- Use a Tiger Data string, or a Postgres on this machine (`postgres://USER@localhost:5432/DBNAME`; a local address needs no `sslmode`).
- To run them on the service in `.env` without the string ever being on a command line or in the shell's history:
  ```
  node --env-file=.env -e "process.env.TEST_DATABASE_URL = process.env.DATABASE_URL; require('node:child_process').spawnSync('npx', ['vitest', 'run', 'server/tests/accountsDb.test.ts'], { stdio: 'inherit', shell: process.platform === 'win32' })"
  ```
- Each run makes its own three tables under a random prefix and drops them at the end, so it can share a database with the game and with another run. Three runs in a row and two runs at once left no table and no index behind, and the real tables were not touched.
- A run takes about 21 s against Tiger Data from here: 15 tests, most of the time is password hashes.
- **Without `TEST_DATABASE_URL` these 15 tests are skipped**, as the owner allowed.

## What was run against the real database

All of it on the Tiger Data service, from luvudeshi's Mac, on the built game (`vite build`, served by `vite preview`, with the server beside it).

- **The 15 database tests:** pass, three runs in a row (21.1 s, 21.0 s, 21.9 s) and two at once.
- **Two browser profiles in headless Chrome, keyboard play.** In the first: create an account, move the music volume from 70 to 35, win a fight at Polyphemus, see "Saved to your account.", sign out. In the second, with nothing stored: sign in with the name in capitals. The hero name, 1 fight, 1 win, the best score, 6 of 23 achievements, the cleared stop and the volume 35 were there, and that browser kept its own "Play with: Keyboard". A second win there, then sign-in again on the first: 2 fights and 2 wins on both.
- **Refusals, as the player reads them:** a wrong password ("Wrong name or password."), a taken name ("That hero name is taken. Pick another, or sign in."), and from a visitor through the tunnel ten wrong tries answered 401 and the eleventh 429 ("Too many tries. Wait a minute, then try again."). The right password from that address then waited too; the laptop's own browser still got in.
- **Sign-in through the tunnel's headers** (`Cf-Connecting-Ip`, `Cf-Ray`, `X-Forwarded-For` on every request): works, and is counted as a stranger.
- **No request to `/api/account` before the Account page is opened**, signed out, with the database on, off and silent. A whole fight sends none either.
- **The built game holds no part of the connection string:** built with the string in the environment, then searched for the host, the user, the password, the database name, "postgres", "DATABASE_URL" and "sslmode". None is in it.

How long things take from this Mac (the database is a 40 ms round trip away):

| What | Connection open | After 30 s with no request |
| --- | --- | --- |
| Sign-in (one password hash, three statements) | 0.34 s | 0.63 s |
| A save written | 0.04 s | 0.35 s |
| A save read | 0.04 s | about 0.33 s |
| Sign-out | 0.04 s | |
| The first status after a start (connect, make the tables) | 0.5 s | |

A fight is longer than 30 s, so the save after a fight is the slow case: a third of a second, in the background.

One thing this run found that is not in our files: after a sign-in brings cleared stops into a browser, the map does not mark them until the page is loaded again, because `src/App.tsx` reads the profile's cleared stops once at start. Every stop can be played either way. The file is the lead's, so the fix is not in this branch. It is one line, tried here and not committed: on the `QuestMap` in `src/App.tsx`, `cleared={[...new Set([...flow.cleared, ...profile.cleared])]}` in place of `cleared={flow.cleared}`. With it the second browser's map showed the tick at once.

**The hall of heroes** has its own three files:

```
npx vitest run server/tests/heroes.test.ts tests/accountHeroes.test.ts
TEST_DATABASE_URL='postgres://...' npx vitest run server/tests/heroesDb.test.ts
```

- `server/tests/heroes.test.ts` (20 tests, no database): what a fight must look like, the limits, who may reach the two paths, the order in which the routes count and ask, and the hall's own code. Its stand-ins: an `Accounts` and a `Heroes` object with fixed answers, and a made-up statement function that answers from a list. None is a database.
- `tests/accountHeroes.test.ts` (9 tests, a made-up `fetch`): no request when signed out, one request a fight when signed in, what is sent, the fight's clock, and the hall as the browser reads it.
- `server/tests/heroesDb.test.ts` (10 tests) talks to a real Tiger Data service. Each run makes its own tables, hypertable and continuous aggregate under a random prefix and drops them at the end. It needs TimescaleDB, so a plain local Postgres will not do. **Without `TEST_DATABASE_URL` these 10 are skipped.**
- **These 10 have been run against the real Tiger Data service** (PostgreSQL 18.6, TimescaleDB 2.32.0): 10 passed. They cover: the hypertable, the aggregate and its policy as the service lists them; a fight written with the session's account; nobody writing as somebody else; the ten best in order with a tie; tonight against all time, before and after a refresh of the aggregate; the 36 buckets of the activity line; the limit of four a minute; an account deleted.

## Not done, not checked

- A real person on a real phone through the real tunnel. The tunnel was stood in for by its headers.
- The camera. Every fight in the walk was played on the keyboard.
- A service with a CA-signed certificate, or a CA file that matches: checking was only seen to refuse the free service's self-signed certificate.
- More than a few players at once against the free service. The limits are tested one request at a time.
- The demo laptop (Windows). Everything above ran on a Mac.
- Tiger Data pausing a free service that nobody uses: not seen, and not looked up. If it does, the first request after a pause answers "not available" and the next try 15 s later finds it.
- `scripts/check-dist.mjs` does not look for `DATABASE_URL` or its value in the built game: the name does not say "secret" and a URL does not look like a key. The lead owns that file. `tests/accountClient.test.ts` scans `src/` for it, and the built game was searched by hand (above).
- The scrypt settings are not stored with the hash. Changing them later needs a column.
- There is no way to change a password or to end all sessions of an account.
