# Accounts and the Hall of heroes on Tiger Data

A player can make an account with a hero name and a password. Their progress, achievements, volume settings and character are then saved to the account and come back on another browser. Every fight of a signed-in player also goes into the Hall of heroes, a list of the best scores. Playing without an account works as before: everything stays in the browser and no network is needed.

The database is Tiger Data, the sponsor's hosted Postgres with TimescaleDB. The server reaches it with one connection string, `DATABASE_URL`.

In a hurry: "Set it up on the demo laptop" is next. For the hosted copy see "On a public server". A sponsor judge wants "What Tiger Data does for the game".

## Where this stands

- Built: the six account routes and the two of the hall, the rules, the limits, the database code, the browser's sync and merge, the sign-in dialog and the board of the hall.
- **It runs against the real Tiger Data service** (free plan, PostgreSQL 18.6, TimescaleDB 2.32.0). The driver is `pg` 8.23.1, pinned in `package.json` with the lockfile. The 28 database tests pass there, with the database's certificate checked, and the two-browser run under "What was run against the real database" was done on it.
- **Neither the sign-in nor the hall is on the Account page until the lead adds three lines** to `src/screens/Account.tsx` (his file): two imports and `<AccountSignIn><HallOfHeroes /></AccountSignIn>` after the count of trophies. Until then nothing imports the sync or the hall, so the game makes no account request at all and sends no fight.
- **On the public site** the account paths answer once that server has `PUBLIC_ACCOUNTS=1` and the database string: see "On a public server". The limits were made over for the open internet at the same time; the numbers below are the new ones.
- The service luvudeshi made already holds the five real objects: `accounts`, `sessions`, `saves`, the hypertable `fights` and the continuous aggregate `fights_hourly`. They are empty.

## Set it up on the demo laptop

Today the demo laptop runs the server with no keys at all. With nothing done, accounts are off, the Account page says so, and the game plays as before.

1. **Get the code and the driver.** `git pull`, then `npm install` in the repo root. That installs `pg` 8.23.1, the one new package.
2. **Put one line in `.env`** at the repo root (make the file if there is none). luvudeshi sends the string to Toyeshh privately. The whole line, with nothing after it:
   ```
   DATABASE_URL=postgres://USER:PASSWORD@HOST:PORT/DBNAME?sslmode=require
   ```
   Never commit `.env`. Never paste the string in an issue, a PR, a chat or a test. A string of your own works too: make a free service at the Tiger Data console and copy its connection string. The tables are made by the server at its first request.
3. **Put the service's CA certificate beside it, so the server checks who it is talking to.** luvudeshi sends the file `tiger-ca.pem` with the string (it is not a secret). Save it as `server/data/tiger-ca.pem` (ignored by git) and add a second line to `.env`:
   ```
   DATABASE_CA_FILE=server/data/tiger-ca.pem
   ```
   Without this line the connection is encrypted but anything that answers at the database's address is given the password (see "Encryption to the database"). The file is made once, on a network you trust (not the venue's Wi-Fi), from a repo root whose `.env` has the string. It needs `openssl` (Git Bash has it on Windows) and says `1 CA certificate(s) saved`:
   ```
   node --env-file=.env -e "const fs=require('node:fs');let u;try{u=new URL(process.env.DATABASE_URL)}catch{console.error('DATABASE_URL is not a URL');process.exit(1)}const o=require('node:child_process').spawnSync('openssl',['s_client','-starttls','postgres','-showcerts','-connect',u.host],{input:''}).stdout.toString();const c=o.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g)||[];fs.mkdirSync('server/data',{recursive:true});fs.writeFileSync('server/data/tiger-ca.pem',c.slice(1).join('\n')+'\n');console.log(c.length-1,'CA certificate(s) saved')"
   ```
4. **Restart the server** the way you start it (`npm run dev:all`, `npm start` or `npm run server`). The first line it logs has `"accounts":true`, which only means the variable is set.
5. **Check it.** In a second terminal (`curl.exe` in Windows PowerShell):
   ```
   curl http://localhost:8787/api/account/status
   ```
   It must answer `{"available":true}`. The first answer takes about half a second and the log says `accounts_ready`. Then `curl http://localhost:8787/api/heroes` answers a JSON object that starts with `{"at":` and the log says `heroes_ready`.

   Or run `npm run preflight`: its `accounts` line says `ON` when the database answers from this laptop (and whether its certificate was checked), or `OFF` with the reason: `no_database_url`, `bad_ca_file`, `no_answer` and the code. It also says when the running server was started before `.env` was filled in. Accounts off is a WARN, never a FAIL.
6. **Look at the Account page** (with the lead's three lines in). In the middle, under the name and the three coins: "Your account", "Saved in this browser only. Sign in or create an account to keep it.", a bright **Sign in** button and a **Hall of heroes** button beside it. If none of that is there, the server has no database: see the table below.
7. **Make the demo's hero names first**, on the laptop itself, before the tunnel is opened. Sign in, win one fight, open the Hall of heroes: the hero is on the podium. There is no email and no reset, so a name belongs to whoever takes it first.

If it answers `{"available":false}`, the server log says why, in one line:

| Log line | Meaning |
| --- | --- |
| `accounts_unavailable` `bad_url` | `DATABASE_URL` is not a `postgres://` address. |
| `accounts_unavailable` `not_encrypted` | The address has no `sslmode=require` (or `verify-ca`, `verify-full`) and is not on this machine. Nothing after the address may be on its line in `.env`. |
| `accounts_unavailable` `bad_ca_file` | `DATABASE_CA_FILE` names a file that cannot be read. Accounts stay off rather than run unchecked. |
| `accounts_unavailable` `no_answer` | The database did not answer. The `code` beside it says why (below). |
| `accounts_tables_failed` | It answered, but the tables could not be made. |
| `accounts_query_failed` | A later statement failed. Three in a row turn accounts off for 5 seconds, then it is tried again. A statement of the hall of heroes is logged the same way but is never one of the three: a hall that fails leaves sign-in on. |
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
| `SELF_SIGNED_CERT_IN_CHAIN` | Certificate checking is on (`verify-ca` or `verify-full`) with no CA file. Tiger Data signs with a CA of its own, which Node does not know: set `DATABASE_CA_FILE` (see "Encryption"). |
| `connection_closed`, `error` | The connection ended, or something with no code. |

After a failed start the server tries the database again at most every 15 seconds, so one that comes back is found without a restart.

To take accounts off again: remove the line from `.env` and restart.

## Encryption to the database

The connection is always encrypted, but for a Postgres on this machine with no `sslmode` (a test database).

- **`sslmode=require` with no CA file: encrypted, and the certificate is not checked.** This is what `psql` does for `require`. The password and the saves cannot be read by somebody who only listens. What it does not stop: a machine that sits between this server and the database (the venue's Wi-Fi) and pretends to be the database. The driver gives such a machine the database password when it asks for it. **So set `DATABASE_CA_FILE` (step 3 of the set-up).**
- **A free Tiger Data service can be checked.** It presents two certificates: one for its own host name, and the CA of Tiger Data's own that signed it. That CA is not in Node's list (hence `SELF_SIGNED_CERT_IN_CHAIN` without a file), but saved to a file it is what `DATABASE_CA_FILE` needs.
- **`DATABASE_CA_FILE=/path/to/ca.pem` in `.env`, or `sslmode=verify-ca` or `verify-full` in the string: the certificate is checked in full**, the chain against that file (or against the CAs Node trusts when no file is named) and the host name. `sslrootcert=` in the string is read as the CA file too. Use this on a paid service, which has a CA-signed certificate.
- A CA file that cannot be read leaves accounts off (`bad_ca_file`). Checking is never dropped silently.
- Checked on the real service: `require` opens; `verify-ca`, `verify-full` and `require` with a public CA list are all refused with `SELF_SIGNED_CERT_IN_CHAIN` and accounts stay off. With the service's own CA in `DATABASE_CA_FILE`, `require` and `verify-full` both open, chain and host name checked.
- If Tiger Data replaces that CA, accounts go off with `no_answer` and a certificate code. Make the file again (step 3 of the set-up), or take the line out of `.env` to run unchecked.

The `pg` driver reads `sslmode=require` as "check the certificate", refuses the free service and prints a warning about `sslmode` at every start. So the server never hands it the connection string: `server/lib/db.ts` reads the string and gives the driver the host, user, password and database one by one, with the encryption decided as above. The string's other parameters are not passed on. What the string leaves blank, the driver takes from the machine's `PG*` variables, and `PGOPTIONS` always. A Tiger Data string has every part, so only `PGOPTIONS` is left: keep it unset on the laptop.

The limits on the connection: 4 connections at most (a free service has no pooler; it allows about 90), 2.5 s to connect, 3 s a query, and the database itself stops a statement after 2 s. A connection nobody used for 30 s is closed, so the first request after a pause opens a new one (about 0.3 s more, see the timings below). The database sees this server as `odyssey-dojo` in `pg_stat_activity`.

## What the Account page shows

The Account page is one scene in the Storm and bronze look. The account part is one block in the middle, under the name and the three coins and above the panel of the next deed: the words "Your account", two lines that say where the progress is kept, and a row of two buttons. The name and password are asked in a dialog.

| State | The block says | Its buttons |
| --- | --- | --- |
| No database, the database is down, or the server cannot be reached | Nothing: the block is not drawn and the page is as it is without accounts | none |
| Signed out | "Saved in this browser only. Sign in or create an account to keep it." | "Sign in" (the bright one) and "Hall of heroes" |
| The dialog | Hero name, Password, "Sign in", "Create account", "Back". Under them, what went wrong, in plain words. | |
| Signed in | "Signed in as *name*." then "Saved to your account.", "Saving..." or "Not sent yet. Kept in this browser." | "Sign out" and "Hall of heroes" |

The **Hall of heroes** button is in the block's row, beside "Sign in". It opens the board in a dialog (see "The hall of heroes"). It is there whenever the server has accounts, signed in or not.

- Signed out, the game asks the server nothing until the Account page opens. Then it asks once whether accounts are on, and when they are, once for the hall. With accounts off the hall is never asked for.
- Signed in, the save is fetched when the game starts and each time the Account page opens. It is sent 1.5 seconds after a fight or a change.
- "Not sent yet" is sent again on the next change, when the Account page opens, and when the game next starts. Nothing keeps knocking on a server that is down.
- Signing out keeps the progress in the browser.
- A sign-in page opened on another device over the Wi-Fi (plain HTTP) says accounts are not available. Use the tunnel address (HTTPS) from a phone.

## What is stored

Three tables for the accounts, made with `create table if not exists`:

- `accounts`: an id, the hero name, the name's key (unique), the password hash and its salt, when it was made.
- `sessions`: the SHA-256 of a session token, the account, when it was made, when it runs out.
- `saves`: one JSON document per account, and when it was written.

And two for the hall (see "The hall of heroes"):

- `fights`: one row a finished fight of a signed-in player: when, the account, the hero name, the stop, won or lost, the score, the style, the god, the seconds, the best combo.
- `fights_hourly`: worked out from `fights` by the database, per hero and hour.

Never stored: the password, the session token, an email or anything else about the person.

- **Password:** 8 to 200 characters. Hashed with Node's `scrypt` (N = 2^17, r = 8, p = 1, a 16-byte random salt per account) and compared with `timingSafeEqual`.
- **Token:** 32 random bytes. The browser gets it once, at sign-up or sign-in, keeps it in `localStorage` under `odyssey-dojo.session`, and sends it as `Authorization: Bearer <token>`. There is no cookie. A session lasts 30 days. An account keeps 5 sessions; one more ends the oldest.
- **Save:** `{ version: 1, profile, settings, character, achievements? }`. The profile and the settings are whole objects, stored and given back as they came. The server checks size and shape only: 32 KB in all, 200 keys an object, 200 entries a list, 3 levels deep, 200 characters a text, numbers within a million million. So a field added to the profile later needs no change on the server and is never dropped. The browser reads the profile back through `parseProfile` and the settings through `parseSettings`. The server never acts on what is in a save.

To delete an account by hand: `delete from accounts where name_key = lower('The Name');`. Its sessions, its save and its fights go with it. `The Name` is the name it signs in with, which is not always the name on the hall of heroes (see "Taking a row off the hall").

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
2. **The hall of heroes.** Every finished fight of a signed-in player is one row in a time series. The board on the Account page shows the best scores tonight and of all time, how many fights were fought this hour, a line of the last six hours and which monster fell most. All of it comes from **one statement, one round trip**: about 40 ms at tonight's size and about 95 ms with 20,000 fights of 300 heroes behind it, on a free service that is a 38 ms round trip away. The database is asked at most once in five seconds however many people look.

What is used, and why each earns its place:

| Tiger Data feature | What it does here |
| --- | --- |
| **Hypertable** `fights`, one chunk a day | "Tonight" is the last 24 hours, which always cross one midnight. The planner opens two day-chunks (today's and yesterday's) and no other, however many nights of fights are behind it: 2 of 31 in a test with 30 days of fights. |
| **Columnstore** on chunks older than a day, ordered by time | Old fights are kept smaller: 29 day-chunks holding 20,000 fights went from 4.1 MB to 2.8 MB. They are not grouped by account. We had that first, and measured it: a hero has two or three fights a day, a batch of two or three rows costs more than the rows, and the same chunks grew to 9.4 MB. TimescaleDB 2.32 sets the policy itself when the hypertable is made. |
| **Continuous aggregate** `fights_hourly`, real-time | Per hero and hour: fights, wins, best score, and the stop, style and god of that best fight. "All time" reads one row per hero and hour played, already added up, and not every fight. The more a hero fights in an hour, the more it saves: in a test of 20,000 fights spread evenly over 30 days it was 18,939 rows, hardly fewer. What it always saves is the work: with the hours written down the statement takes 95 ms, and 0.9 s or more when it has to add up every fight itself. Real-time means a fight of this minute is in the list at once, before the next refresh. |
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
        tsdb.segmentby = '', tsdb.orderby = 'at desc');
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

What was measured, on the real service (free plan, PostgreSQL 18.6, TimescaleDB 2.32.0) in a schema of its own that was dropped afterwards. The load was 20,000 made-up fights of 300 heroes over 30 days; times are the median of 20 from a Mac:

| What | Measured |
| --- | --- |
| `select 1`, the round trip alone | 38 ms |
| The hall statement with 300 fights of 20 heroes (tonight's size) | 40 ms |
| The hall statement with 20,000 fights of 300 heroes, after the refresh policy ran | 93 to 95 ms (fastest 56, slowest 109) |
| The same before any refresh has covered the load | 0.9 s, and 1.2 to 1.8 s in a second measurement, close to the 2 s limit of a statement |
| One fight written | 38 ms (42 ms when it starts a new day's chunk) |
| Chunks "tonight" reads | 2 of 31 |
| Rows "all time" reads | 18,939 hourly rows in 4 chunks of the aggregate, plus the fights since the last refresh (38 rows in 1 chunk) |
| 29 day-chunks before the columnstore | 4,112 kB |
| The same in the columnstore, ordered by time (what the code sets) | 2,784 kB |
| The same in the columnstore, grouped by account (what the code set first) | 9,384 kB |

- The "before any refresh" state needs a bulk load. In the game the refresh policy runs every 30 minutes, so what is not yet written down is the fights of the last two hours at most.
- The sizes were measured twice, by two people. The second measurement: 14 chunks grouped by account went from 1,960 kB to 4,464 kB, and the 15 beside them ordered by time went from 2,152 kB to 1,440 kB.
- The lists were compared with a plain check (the same top ten worked out from the raw rows) in every state: nothing refreshed, after the refresh, with 29 chunks in the columnstore, and under each columnstore setting. They matched.

What this is not: at tonight's size (a few hundred fights) plain Postgres would answer as fast. The design is what keeps the same two lists and the same line one statement when the table holds every fight of every night.

## The hall of heroes

- **When a fight is written.** A signed-in player finishes a fight (won or lost) on the road. The browser sends it in the background once, after the profile has it. The result screen never waits for it and never shows an error from it. Signed out, a fight sends nothing.
- **What is written.** When (the server's clock), whose (the account of the session), the hero name on the player's screen, the stop, won or lost, the score, the fighting style, the god the scan found (if any), how many seconds the fight took and the best combo.
- **What the hall shows.** The best score of each hero in the last 24 hours and of all time, ten each: a podium for the first three, a list to ten, the reader's own row marked "You". Under it: fights this hour (or in all), fights per ten minutes over six hours, and the stop beaten most tonight. It is read once when the Account page opens (to learn whether there is a hall), again when the board is opened, and every ten seconds while the board is open and the tab is in front. Closing the board reads nothing. With accounts off there is no hall, no button, and nothing is asked.
- **A tie** goes to the hero who fought first.

Two routes (`server/routes/heroes.ts`):

| Route | Answers |
| --- | --- |
| `POST /api/account/fights` (Bearer) `{ fight: { stop, won, score, style, god?, seconds?, bestCombo?, hero? } }` | 201 `{ recorded: true }`, 400 `{ error: "invalid", field }`, 401 `signed_out`, 413 `too_big`, 429 `slow_down`, 503 `unavailable` |
| `GET /api/heroes` (no sign-in needed; a Bearer only marks the reader's row) | 200 `{ at, tonight, allTime, lastHour, fightsEver, stops, activity }`, 429, 503 |

- A row of `tonight` and `allTime` is `{ hero, score, stop, style, god, you }`. There is no id of any account in the answer.
- `activity` is `{ minutes: 10, until, fights: [36 numbers] }`, oldest first. `stops` is `{ stop, fights, wins }` for the last 24 hours.
- Both paths answer the tunnel and the laptop only, like the account paths (`server/lib/localOnly.ts`), and a public server's visitors with `PUBLIC_ACCOUNTS=1`.

**Scores are the browser's own word.** The fight runs in the browser, so the server cannot check a score. It is a game, not a bank. What bounds a made-up one:

| A stranger tries to | Bound |
| --- | --- |
| Put a made-up score on the list | They can, up to 30,000 (a long clean win at the last stop is under 10,000). It takes an account, and an account is one row on each list. To remove one, see "Taking a row off the hall" below. |
| Write a fight as another player | The account comes from the session and nowhere else. A body cannot name one. |
| Show another hero's name | They can: the hero name is what the player calls the hero, cleaned like an account name (3 to 20 characters, nothing unseen). Two rows may show the same name. |
| Fill the table with fights | 4 a minute and 90 an hour an account, whoever sends them. 120 a minute for all strangers together, counting only fights that were written: 172,800 rows a day at the very most. A body is 1 KB at most and is not read before the session is known. |
| Use up everybody's fights for the minute | Only with `PUBLIC_ACCOUNTS=1`; without it the 120 are one count, as they always were. With it the 120 are two counts. An account's first fight of its minute has 90 places, and an account takes one of them a minute and no more. Its second to fourth fights share 30. Thirty accounts sending four a minute take all of one count of 120; with two counts they take 30 of the first count and all of the second, and 60 players still record the fight they just finished. Taking the first count takes ninety accounts, and accounts are capped. |
| Keep the database busy by reading the hall | The hall is answered from memory. The database is asked once in 5 seconds, by one statement, which takes one of the two places strangers have. A reading that failed is remembered for those 5 seconds too. 300 reads a minute an address (1,200 with `PUBLIC_ACCOUNTS=1`: 200 open boards behind one address). |
| Turn sign-in off by reading a hall that fails | They cannot. A statement of the hall that fails is not one of the "three in a row" that turn accounts off: sign-in, saves and fights go on, and only the hall answers 503. |
| Keep it busy with made-up sessions | 30 unknown sessions a minute an address (120 with `PUBLIC_ACCOUNTS=1`) are looked up, counted together with the account routes (one count, not one each); past that the hall is given without a mark and a fight is refused. |
| Learn who is who | Hero names and scores only. No id, no time of a single fight, no account name beside the hero name. |

**Taking a row off the hall.** The name on a row is the hero name the browser sent with the fight. It need not be the name of any account, and two accounts can show the same one. So `delete from accounts where name_key = lower('The Name On The Row')` can delete nothing, or the wrong account. Find the account through the fights table, then delete it by its id:

```sql
-- 1. The accounts that fought under the name on the row, best score first. The score on the row tells which one it is.
select f.account_id, a.name as account, max(f.score) as best, count(*) as fights
from fights f join accounts a on a.id = f.account_id
where f.hero = 'The Name On The Row'
group by f.account_id, a.name order by best desc;

-- 2. That one account, by the id from step 1. Its sessions, its save and its fights go with it.
delete from accounts where id = 'the account_id from step 1';
```

- The row is gone from both lists at the next reading (5 seconds at most).
- The count of fights in all still includes the deleted account's fights until the next refresh of the aggregate (30 minutes at most). Seen in a test: 20,021 shown against 19,521 real after an account with 500 fights was deleted, and right again after the refresh ran.
- Both statements are run by `server/tests/heroesDb.test.ts` on its own tables: a fight sent under a name no account has, traced to its account, deleted, gone from both lists.

Things to know:

- **A database without TimescaleDB has no hall.** The server logs `heroes_unavailable` `no_timescaledb` once, both routes answer 503, accounts work as before. A local Postgres for tests is such a database.
- **The hypertable and the aggregate are made at the first fight or the first reading of the hall**, after the account tables. The log says `heroes_ready`.
- **A change to the columns of `fights` or `fights_hourly` needs the old ones dropped by hand** (`drop materialized view fights_hourly; drop table fights;`). `create ... if not exists` does not alter what is there.
- **The columnstore setting is the one thing start-up does alter.** A `fights` table made before the setting was measured is grouped by account. At its first use of the hall the server asks the database for the setting (one statement, about 40 ms). Only when the table is still grouped does it run `alter table fights set (timescaledb.segmentby = '', timescaledb.orderby = 'at desc');` (38 ms, safe to run again) and log `heroes_columnstore_set`. If that fails the log says `heroes_columnstore_not_set`, the hall works all the same, and the next start tries again. Chunks already in the columnstore keep the layout they were written with; the real table had none.
- **A hall that fails does not take accounts with it.** Its statements go through the accounts' connection but are not counted among the failures that turn accounts off, and a reading that failed is not tried again for 5 seconds. With accounts off the hall is off too.
- **The time of a fight is the laptop's clock**, like every time in the account tables. A laptop clock more than an hour behind would keep a fight out of "all time" until the next refresh (30 minutes at most).
- `delete from fights where ...` by hand leaves the hours already written down in `fights_hourly` until `call refresh_continuous_aggregate('fights_hourly', null, null);`. Deleting the account takes its row off both lists at once; the count of fights in all still includes its fights until the next refresh (30 minutes at most).
- Only fights on the road are sent (what `recordFight` is given). The guest of a room and the Training Dojo send nothing.
- The god is sent only when `src/App.tsx` passes it to `recordFight` (one line, the lead's file, in the PR). Without it the god is empty and everything else works.
- The board needs the sign-in part on the same page: `HallOfHeroes` learns from the account's state whether the server has accounts, and `AccountSignIn` is what asks for that state when the page opens. On the Account screen the hall's button is put inside the sign-in part, so the two stand in one row: `<AccountSignIn><HallOfHeroes /></AccountSignIn>`.

Not checked for the hall:

- Nothing that takes a day or more on its own schedule: the columnstore job moving a chunk when it is a day old, the refresh policy over many hours. Both jobs were run by hand (`run_job`) in a test schema: with 29 chunks in the columnstore the lists were right and as fast (94 ms), deleting an account took its 501 fights out of chunks already there (46 ms), and the refresh after it corrected the counts. On the real tables the refresh policy was seen to run once, right after it was made.
- The real tunnel. The two paths were called with a tunnel's headers on a loopback socket, not through a real one.
- A camera fight and the god in a row: every fight played here was on the keyboard, which has no god.
- More than two heroes on the real board. The board with ten rows was looked at with a made-up answer in the browser, not with ten real accounts.
- Where the button and the board sit on the Account page is the lead's call. The pictures were taken with the four lines added to `src/screens/Account.tsx`, not committed.

## The routes

| Route | Answers |
| --- | --- |
| `GET /api/account/status` | 200 `{ available }`. Never fails, and answers within 4 seconds. |
| `POST /api/account/signup` `{ name, password }` | 201 `{ token, name }`, 400 `{ error: "invalid", field }`, 409 `name_taken`, 429 `slow_down`, 503 `unavailable`; with `PUBLIC_ACCOUNTS=1` also 429 or 503 `{ error: "signups_closed", message }` |
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
- `signups_closed` means strangers have made as many accounts as they may for now (429, with `Retry-After`), or the database holds as many as it may (503). It is the same answer for a name that is taken as for a new one. Sign-in is not closed by it. The browser says "No new accounts can be made right now. If you have one, sign in. Your progress is kept in this browser."

## What a stranger can do, and what bounds it

The public tunnel reaches `/api`. `server/lib/localOnly.ts` opens exactly these five paths to it, the two of the hall (`POST /api/account/fights`, `GET /api/heroes`), and nothing else under `/api/account/`. **Another device on the Wi-Fi is refused (403)**: the server speaks plain HTTP there, and a password must not cross the venue's network in the clear. Through the tunnel it travels inside HTTPS. The numbers are in `server/lib/accountLimits.ts` and `server/lib/accounts.ts`.

**This section is the server without `PUBLIC_ACCOUNTS=1`: the laptop and its tunnel.** Every number, window and answer in it is what it was before that setting existed, and the tests that hold them are the files `main` has, unchanged. With the setting on other numbers apply: "With the setting on: what a stranger can do" under "On a public server".

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
| Keep the database busy | Strangers' database calls run two at a time, 16 may wait, the rest get 429. A token is counted before the database is asked: 30 unknown tokens a minute an address, the hall's two routes included. A known token is remembered for 5 minutes and counted for its account: 120 requests and 60 writes a minute. Status asks the database at most once in 5 seconds. |
| Turn accounts off for everybody | One failed or slow query does not. Three in a row with none working between them do, for 5 seconds. A statement of the hall, which anybody may cause, is never one of the three. The pool has 4 connections and strangers use 2, so the laptop always finds one free. A statement cannot run longer than 2 s: the database stops it. |
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

## On a public server

This is for the hosted copy (`docs/deploy-vultr.md`): the page on one host, `/api` passed on to the game server, and the game server behind its own HTTPS proxy. The owner of the database decided accounts should work there too, and accepts that the connection string then sits in that server's `.env`.

**Three lines in the game server's `.env`** (on the Vultr instance: `deploy/vultr/.env`), then restart it (`docker compose up -d` in `deploy/vultr`):

```
PUBLIC_ACCOUNTS=1
DATABASE_URL=postgres://USER:PASSWORD@HOST:PORT/DBNAME?sslmode=require
DATABASE_CA_FILE=<where the CA file is inside the server's container>
```

- **The string goes to the server's operator privately**, from luvudeshi, and from there by hand over SSH into the file. Never through GitHub: not in an issue, a PR, a comment, a commit, a workflow log. Not in a group chat either. Whoever can log in to the instance can read it, and it is the owner role of the whole database.
- **The CA file is not a secret.** Copy the laptop's `server/data/tiger-ca.pem` up, or fetch it with this one command wherever the string is in the environment. It needs only Node, so it also runs inside the server's container, which has no `openssl`. It writes the certificate to standard output and says `1 CA certificate(s) written`:
  ```
  node -e "const net=require('node:net'),tls=require('node:tls');let u;try{u=new URL(process.env.DATABASE_URL)}catch{console.error('DATABASE_URL is not a URL');process.exit(1)}const s=net.connect(Number(u.port||5432),u.hostname,()=>s.write(Buffer.from([0,0,0,8,4,210,22,47])));s.once('data',(d)=>{if(d[0]-83){console.error('the database did not offer TLS');process.exit(1)}const t=tls.connect({socket:s,servername:u.hostname,rejectUnauthorized:false},()=>{const out=[];const seen=new Set();let c=t.getPeerCertificate(true).issuerCertificate;while(c&&seen.has(c.fingerprint256)===false){seen.add(c.fingerprint256);out.push('-----BEGIN CERTIFICATE-----\n'+c.raw.toString('base64').match(/.{1,64}/g).join('\n')+'\n-----END CERTIFICATE-----\n');c=c.issuerCertificate}process.stdout.write(out.join(''));console.error(out.length,'CA certificate(s) written');t.end()})});s.on('error',(e)=>{console.error('no answer:',e.code);process.exit(1)})"
  ```
  On the laptop: `node --env-file=.env -e "..." > server/data/tiger-ca.pem`. On the instance, once the first two lines are in `.env` and the server was restarted: `docker compose exec -T game node -e "..." > tiger-ca.pem`, then put the file where the compose file mounts it (`docs/deploy-vultr.md` says where) and add the third line. Run from the laptop against the real service, the command wrote the same certificate as the `openssl` command of the laptop set-up. It was not run on the instance. Fetching the file this way trusts the network it is fetched over, once.
- Without the third line the connection is encrypted but the database's certificate is not checked ("Encryption to the database"). A file that cannot be read leaves accounts off (`bad_ca_file`); the server tries again every 15 seconds, so they come on by themselves once the file is there.
- **Check:** `https://<the page>/api/account/status` answers `{"available":true}`, and `https://<the page>/api/level` still answers `{"error":"local_only"}`.

The setting is on only when the value is `1` (spaces around it do not count). Unset, empty, `0`, `01`, `true`, `yes`: off. Like `PUBLIC_ROOMS` it is read from the real environment, `.env` and `.env.local`, at start, so a change needs a restart. **Never set it on the laptop**: where a caller can reach the server with no proxy in between, the caller writes the header it counts by.

### What it changes

1. **Who is answered.** The account paths and `/api/heroes` also answer a request that was passed on by a proxy to a socket that is not this machine's. That is the hosted copy with its proxy in a container of its own. Nothing else opens: `/api/level`, `/api/speech`, `/api/reveal`, `/api/portrait/...`, `/api/replays`, FaceTime, `/api/health` and making a room (that one is `PUBLIC_ROOMS`) answer 403 as before, and so does a request with no proxy header from another address (plain HTTP).
2. **Who is counted.** A caller is the last entry of `X-Forwarded-For`, which the server's own proxy wrote. Entries in front of it and `Cf-Connecting-Ip` are not read: a caller writes those. `PUBLIC_ROOMS=1` alone does not do this for the account routes and the hall: without `PUBLIC_ACCOUNTS=1` they count a caller as they always have (`publicAccounts.test.ts`, "PUBLIC_ROOMS=1 alone").

The second point matters whichever way the proxy reaches the game. When the proxy shares the game's network (PR 371 does that, and it is live), the game sees it at `127.0.0.1`, as it sees a tunnel on the laptop. The account paths then answer with or without the setting. But without it the server takes the proxy for a tunnel: every visitor is one caller, and a visitor who sends `Cf-Connecting-Ip` is counted as whoever that header says, a new caller with every made-up value. **So set it on the hosted copy in either layout.**

With the setting off nothing about who is answered, how a caller is named or what a caller may do changed, whatever `PUBLIC_ROOMS` is. So a hosted copy that runs with `PUBLIC_ROOMS=1` and without this setting keeps what it has today: a visitor's own `Cf-Connecting-Ip` buys a fresh count, and all other visitors are one caller. Setting `PUBLIC_ACCOUNTS=1` is what closes that. The request table under "What was checked" below is the proof.

### With the setting on: what a stranger can do

Everything under this heading holds only with `PUBLIC_ACCOUNTS=1`. Without it the numbers, the windows, what is counted together and the answers are the ones in "What a stranger can do, and what bounds it" above. The numbers here are the `PUBLIC_` ones in `server/lib/accountLimits.ts` and `server/lib/heroLimits.ts`, with the hour and the day of sign-ups (`server/lib/accounts.ts`).

What the setting changes, one line each (without it, with it):

| What | Without | With |
| --- | --- | --- |
| Sign-up and sign-in requests from one address, a minute | 60, one count for both | 240 each, counted apart |
| Sign-ins with a name and a password from one address, a minute | 30 | 60 |
| Wrong passwords on one name from one address | 10 in ten minutes (1,440 a day) | 5 in one minute (7,200 a day) |
| Wrong passwords on one name from all addresses | 100 in ten minutes (14,400 a day) | 10 in one minute (14,400 a day) |
| How long a held name stays held after the wrong passwords stop | ten minutes at most | one minute at most |
| Accounts made through one address in ten minutes | 40 | 60 |
| Accounts made by all strangers | 120 in ten minutes, answered 429 `slow_down` | 120 in ten minutes, 200 in an hour, 600 in a day, answered 429 `signups_closed`; the hour and the day are asked of the database |
| The database is full | 503 `unavailable` | 503 `signups_closed` |
| Unknown sessions from one address, a minute | 30 | 120 |
| A sign-up or sign-in and the strangers' two places at the database | holds one for all of its work, the hash too | holds one for each statement, not for the hash |
| A count that is full of keys | forgets everything at 10,000 | drops the keys counted least, holds 10,000 |
| Fights written by all strangers, a minute | one count of 120 | 90 for an account's first of its minute, 30 for its further ones |
| Readings of the hall from one address, a minute | 300 | 1,200 |
| Who a caller is | the tunnel's `Cf-Connecting-Ip`, else the socket | the last `X-Forwarded-For` entry; `Cf-Connecting-Ip` is not read |

**A locked-out owner** (somebody keeps sending wrong passwords for their name): a browser that is not signed in yet gets 429 `slow_down` with `Retry-After` of 60 at most and reads "Too many tries. Wait a minute, then try again." It ends one minute after the wrong passwords stop. A browser that is already signed in notices nothing.

Three rules keep one stranger from locking the others out:

- **A budget is only spent by a request that costs something.** An empty or malformed request is refused on a cheap count of its own (240 sign-up requests a minute an address, and 240 sign-in requests, counted apart). A typo, a taken name or a request with no token uses up nobody's budget.
- **Nothing is shared by all strangers except the count of accounts really made** and of fights really written. What many addresses can do at once is held by two gates, not by a count: one password hash at a time, and two strangers' database calls at a time.
- **A count never forgets what it counted often to make room for what it counted once.** Each count holds 10,000 keys. One more drops the keys counted least, the oldest first. Without the setting a full count forgets everything, as it always did, so made-up names can wipe the wrong passwords held against a real one.

| A stranger tries to | Bound |
| --- | --- |
| Find out which names exist | Sign-in never says. Sign-up does say when a name is taken (it has to), but not while sign-up is closed: then a taken name and a new one get the same answer. A name is a hero name, not a person. |
| Guess a password | 60 sign-ins a minute an address. On one name: 5 wrong passwords a minute from one address, 10 from all addresses together (14,400 a day at most, the same as without the setting and never more; 7,200 of them can come from one address, where without the setting one address has 1,440). A right password is not counted. |
| Lock a player out of their name | Five wrong tries hold only the address they came from, and for a minute at most: the hold ends a minute after its first wrong try, whatever is sent meanwhile. Holding a name for everybody takes 10 wrong tries every minute from two addresses or more, and ends the same way. Whoever wants to keep an owner out has to keep sending. A browser that is already signed in is never touched: its session does not pass through sign-in. The laptop is never held. On a public server "an address" can be everybody: see there. |
| Burn the CPU with password hashes | One hash at a time, at most 8 waiting, the rest get 429. So one core at most. A hash is about 0.2 s and needs 128 MB while it runs. |
| Hold the database with slow sign-ins | A sign-up or a sign-in takes one of the strangers' two places for each statement and gives it back while its password is hashed. Without the setting the hash runs inside the place, as it always did, so two sign-ins waiting for their hash hold both. |
| Fill the database with accounts | Only an account that was made is counted. One address: 60 in 10 minutes. All strangers together: 120 in 10 minutes, 200 in an hour, 600 in a day, 1,900 in all. The last 100 places are kept for the laptop. The hour, the day and the total are asked of the database before each sign-up, so a restart, or a second server on the same database, does not start them again. Past the ten minutes, the hour or the day sign-up answers 429 `signups_closed`; with the database full, 503 `signups_closed`. Sign-in goes on. |
| Fill it with saves | One save per account, 32 KB at most as sent, so 64 MB at the very most, and under 20 MB for the accounts of one day. |
| Fill it with sessions | 5 per account. Sessions that ran out are removed at the next sign-in. |
| Keep the database busy | Strangers' database calls run two at a time, 16 may wait, the rest get 429. A token is counted before the database is asked: 120 unknown tokens a minute an address, the hall's two routes included. A known token is remembered for 5 minutes and counted for its account: 120 requests and 60 writes a minute. Status asks the database at most once in 5 seconds. |
| Turn accounts off for everybody | One failed or slow query does not. Three in a row with none working between them do, for 5 seconds. A statement of the hall, which anybody may cause, is never one of the three. The pool has 4 connections and strangers use 2, so the laptop always finds one free. A statement cannot run longer than 2 s: the database stops it. |
| Send a huge body | Sign-up and sign-in read 2 KB, a save 32 KB. A body that says it is longer is refused unread. A save body is not read at all before the token is known. |
| Use another player's save | No route takes an account id. A request reaches the row of the session it carries and no other. |
| Run SQL | Every value goes to the database apart from the statement text. |
| Use a signed-in browser from another site | There is no cookie to ride on. The token is a header that only this game's page sends. |
| Read a password off the Wi-Fi | The account paths answer the tunnel (HTTPS), a public server's own proxy (HTTPS) and the laptop itself only. |

Why these numbers:

- **200 accounts an hour** is a judge and a full room signing up in the same hour, with room to spare. 120 in ten minutes lets the room do it all at once.
- **600 a day** means the 1,900 places last more than three days of somebody doing nothing else, and a day of new accounts is under 20 MB of saves. The owner has time to see it and delete them.
- **60 in ten minutes for one address** lets a room behind one address in, and keeps one address from taking a whole ten minutes for itself.
- **240 requests, 60 sign-ins, 120 unknown sessions a minute for one address** have room for a hall behind one address. Past each the answer is 429 for a minute at most. None of them protects the database; the gates and the caps for all callers do.
- **One minute for wrong passwords** in place of ten, and ten wrong ones in it from all addresses together in place of a hundred in ten minutes: the daily number of guesses at one name stays 14,400, and no hold outlasts the wrong tries by more than a minute (without the setting, ten).
- **90 and 30 fights a minute** in place of one count of 120: a player finishes one fight a minute at most, nearly always. 120 together, as without the setting. The hall is read 1,200 times a minute an address in place of 300.
- **1 hash at a time and 8 waiting**: nine hashes are under two seconds on the demo laptop and under five on a slow shared core, inside the 8 seconds the browser waits.

Things to know about these limits:

- **The laptop that runs the server is never counted or refused** (but for the 60 writes a minute to one account), and its own browser is not held by the hour or the day of sign-ups. A request that carries any proxy or tunnel header is never taken for the laptop: a visitor through the laptop's tunnel is counted and held like any other visitor.
- **A venue's Wi-Fi is one address through the tunnel.** Everybody behind it shares the per-address numbers. They are set with a hall in mind.
- **Somebody can still stop strangers from signing up**, by making 200 real accounts in an hour, or 600 in a day. One address is enough for that. Sign-up is then closed until the hour or the day is over, and sign-in goes on. Nothing without an email or a captcha stops that. The laptop keeps its 100 places, so make the demo accounts there.
- **The hour and the day count every account in the database**, the laptop's own and another server's too. The count in memory is exact for one server; the count in the database is asked before the hash, so sign-ups that are under way at the same moment can pass it together: nine too many at the very most (the nine that can be at the hash at once), and only when the database holds accounts this server did not count itself (after a restart, or made by another server).
- **The counts in memory are each server's own.** A laptop and a public server on one database each have their ten minutes, their per-address and their per-name counts. A restart empties them.
- **A session that ran out, or was ended to make room for a sixth, can stay good for 5 minutes more** on a token the server has just seen. Signing out ends it at once.
- **Do not start Vite with `--host` while accounts are on.** In `npm run dev:all` a request through Vite's proxy looks like the laptop's own: it would skip every limit and carry the password over plain HTTP. The tunnel goes straight to the server, so its visitors are counted.

### Who "one caller" is behind Vercel and Caddy

| How the request comes | The caller the server counts | Can a stranger choose it? |
| --- | --- | --- |
| Browser, the page on Vercel, Vercel passes `/api` on, Caddy, game | Vercel's address | No. But everybody who uses the page is that caller too |
| Stranger calls the game server's own name, Caddy, game | The stranger's own address | Only by having many addresses |

- Caddy puts the address it took the request from in `X-Forwarded-For` and drops what the caller wrote there (its documented default with no `trusted_proxies`; not run here).
- Vercel also sends the visitor's address, in `X-Real-Ip` and `X-Vercel-Forwarded-For`. The server does not read them: anybody who calls the game server's own name can write them.
- **So the visitors of the page share a handful of callers, perhaps one, and a stranger who wants a caller of their own has one.** How many addresses Vercel uses for one hall was not measured. Plan for one.

That is why no per-address number is tight, and why nothing that protects the database rests on an address.

### The caps, and what a visitor sees

With the setting on. Without it the caps are the ones under "What a stranger can do, and what bounds it".

| Cap | Number | Answer past it | What the visitor sees |
| --- | --- | --- | --- |
| Accounts made by all visitors together | 120 in ten minutes, 200 in an hour, 600 in a day | 429 `signups_closed`, `Retry-After` until the ten minutes, the hour or the day is over | "No new accounts can be made right now. If you have one, sign in. Your progress is kept in this browser." Signing in works. |
| Accounts in the database | 1,900 for visitors (2,000 less 100 kept for the laptop) | 503 `signups_closed` | The same words. |
| Accounts made through one address | 60 in ten minutes | 429 `slow_down` | "Too many tries. Wait a minute, then try again." |
| Sign-up requests, and sign-in requests, from one address | 240 a minute each, counted apart | 429 `slow_down` | The same. Sign-ups never use up sign-ins. |
| Sign-ins with a name and a password from one address | 60 a minute | 429 `slow_down` | The same. |
| Wrong passwords on one name | 5 a minute from one address, 10 a minute from all (14,400 a day, as without the setting) | 429 `slow_down`, `Retry-After` 60 at most | The same, also for the right password, until a minute after the first wrong one. A browser that is already signed in notices nothing. |
| Password hashes | one at a time, 8 waiting, for sign-up and sign-in of all callers together | 429 `slow_down`, `Retry-After` 1 | Nothing at first: the page sends it again by itself, twice at most, a second or so apart (`BUSY_RETRIES` in `src/account/client.ts`). Still no place after that: the same words. |
| Database calls for visitors | two at a time, 16 waiting | 429 `slow_down`, `Retry-After` 1 | Signing in: sent again by itself as above, then the same words. A save: "Not sent yet. Kept in this browser.", and it is sent again later. |
| Sessions the database does not know, from one address | 120 a minute | 429 `slow_down` | A signed-in browser the server saw in the last five minutes notices nothing. Another one reads "Not sent yet. Kept in this browser." |
| Requests and saves of one account | 120 and 60 a minute | 429 `slow_down` | "Not sent yet. Kept in this browser." |
| Fights written by all visitors | 90 a minute for an account's first of its minute, 30 for its further ones | 429 `slow_down` | Nothing. The fight is not in the hall. |
| Readings of the hall from one address | 1,200 a minute | 429 `slow_down` | The board keeps what it showed. |

A page built before this change does not know `signups_closed`: it shows "Too many tries. Wait a minute, then try again." for the 429 and "Accounts are not available right now. Your progress is kept in this browser." for the 503.

### Turning it off

- **Accounts off altogether:** take the `DATABASE_URL` line out of the server's `.env` and restart. Status answers `{"available":false}`, every other account route 503, and the page plays from the browser as before. Nothing in the database is touched. This works in every layout.
- **Only the setting:** take `PUBLIC_ACCOUNTS=1` out and restart. With the proxy in a container of its own the account paths answer 403 again. With the proxy inside the game's network they still answer, as for a tunnel, and callers are counted the weaker way described above. There, take the database line out.
- To clear accounts somebody made in bulk, delete them by hand as "What is stored" says. The accounts of the last day, newest first: `select name, created_at from accounts where created_at > now() - interval '1 day' order by created_at desc;`

### What is not protected

- **Visitors of the page share one caller, and one of them can use up what that caller may do.** 240 sign-up requests, 240 sign-in requests, 60 sign-ins or 120 unknown sessions a minute, and everybody else who comes through the page waits for the rest of that minute. Five wrong passwords a minute on one name through the page keep that name from signing in on a new browser for as long as somebody keeps sending them, and for a minute at most after they stop. The fix is not in the server: either the page calls the game server's own name, or Vercel sends a secret header so the server may believe the visitor's address it passes on (both are described in PR 351, `docs/deploy-vercel.md`, "If rooms get busy"). Neither is built.
- **Sign-up can be closed by anybody** who makes 200 accounts in an hour or 600 in a day; one address can make 200 in about half an hour. No email, no captcha. Sign-in goes on. The laptop's own browser is not held by the hour or the day. Visitors through the laptop's tunnel are, because the count is the database's and the hosted copy shares it. So make demo accounts ahead of time, or on the laptop itself ("Before a demo" below).
- **A weak password can be guessed**: 14,400 guesses a day at one name at most, the same as without the setting. There is no reset and no way to change a password.
- **One core can be kept busy hashing, and the line for it is one line.** One hash runs at a time, so it is one core at most. On an instance with one core the room relay shares it. Not measured there. Sign-ups and sign-ins of all callers wait in the same line of eight, and on the hosted copy nobody is the laptop, so nobody skips it: a handful of addresses that keep it full make everybody else's sign-in come back with "Too many tries" until they stop. A browser that is signed in already is not in that line.
- **Hero names are whatever a visitor typed**, shown to everybody in the hall. The page shows them as text (there is no place in `src/` that puts HTML in the page), and two accounts cannot have the same name, but a fight is recorded under the name the browser sends. The session sits in the browser's `localStorage` for 30 days: a script that ever ran on the page could read it.
- **Saves can be rewritten** 60 times a minute an account, at most two at a time for all visitors. That is churn the database has to clean up, not growth.
- **Scores are the browser's word**, as on the laptop ("The hall of heroes").
- **The string sits in the server's `.env`**, and the server connects as the owner role ("Not done, not checked").
- **Each server counts for itself.** The laptop and the hosted copy share the database, the hour, the day and the total, and nothing else. A restart empties a server's counts.
- **A server reachable with no proxy in between must not set the flag**: a caller there writes `X-Forwarded-For` itself and is a new caller with every address it makes up. The caps for all callers together, the count per name and the gates still hold.
- The other weak spots of the hosted copy are in `docs/rooms-tunnel.md`, "The hosted copy".

### Before a demo

Two reviewers attacked the setting over HTTP before it went out. Their answer to "turn it on for the demo?" was yes, as a second way in beside the laptop, and with these four things done. None of them is done by the code.

1. **Make the accounts the demo needs ahead of time**, on the laptop itself (its own browser is never refused). Then the demo only signs in, and a closed sign-up (200 an hour, 600 a day, for everybody) cannot stop it.
2. **Sign in ahead of time too.** A browser that is signed in keeps working whatever happens to sign-in: it uses its session, for 30 days.
3. **Do not have a hall sign in in the same second.** One password is checked at a time and eight wait; the tenth is told to come back in a second. The page does that by itself, twice. Twenty in one second is still too many: some will read "Too many tries" and have to press the button again.
4. **Keep the laptop as the demo's account path.** Through the page everybody is one caller, and so is everybody on one Wi-Fi even if the page called the game server by its own name. One person there who sends 60 sign-ins a minute holds sign-in shut for all who are not signed in yet, for as long as they keep going. Twenty wrong passwords a minute on one hero name, from anywhere, hold that name out of new browsers the same way. The laptop's own browser is never held by either.

### What was checked

**These runs are from before the numbers were split by the setting, and were not made again.** Then the numbers below applied with the setting off too, and the wrong passwords on one name from all callers were 20 a minute; they are 10 now, so "forty sign-ins in one instant" would end differently. `PUBLIC_ROOMS=1` alone then changed who an account caller is; it no longer does. What holds the numbers now is the tests: without the setting `accountLimits.test.ts`, `accountRoute.test.ts`, `accounts.test.ts` and `heroes.test.ts`, which are byte for byte the files `main` has, and with it the four `publicAccounts*.test.ts` files beside `publicAccounts.test.ts`.

On the laptop, against the real server from this branch on port 8801. "Another address" is the laptop's own Wi-Fi address, standing in for a proxy's socket; the proxy chain is stood in for by its headers (`X-Forwarded-For`, `X-Forwarded-Proto`, `X-Forwarded-Host`, `X-Real-Ip`, `X-Vercel-Forwarded-For`, `X-Vercel-Id`).

- **The setting off is the code as it was.** 122 requests (the 32 registered routes and 90 path and method tricks) from 12 kinds of caller, 1,464 answers, compared between the branch this one started from (PR 373, which was itself compared with `main`) and this one: 0 differ with neither setting, and 0 differ with `PUBLIC_ROOMS=1` on both (status, the headers that matter, the body). No database in these runs.
- **The setting on changes 84 of the 1,464**, every one an account path or `/api/heroes` (in any spelling), from another address, with a proxy header: 403 before, the route's own answer after. Nothing from a loopback socket changed, nothing without a proxy header, and no other path. The same 84 with `PUBLIC_ROOMS=1` beside it.
- **With the real database and the setting off:** from another address with the chain's headers, status, the hall and sign-up answer 403 `local_only`.
- **With the real database and the setting on, as a visitor:** status 200 `{"available":true}`; sign up 201; sign in with the name in capitals 200; save 200; the save read back 200 and equal to what was sent; a fight 201; the hall 200 with the hero's row marked "You", and unmarked with no session; sign out 204, and that session then 401.
- **Closed, same caller:** `/api/level`, `/api/speech`, `/api/reveal`, `/api/portrait/x`, `/api/replays`, `/api/facetime/status`, `/api/facetime/waiting`, `/api/health`, `POST /api/rooms`, `/api/account/other`: all 403. Status and the hall from another address with no proxy header: 403.
- **Caps:** five wrong passwords from one caller 401, the sixth 429 with `Retry-After: 59`, the same with other addresses written in front and in `Cf-Connecting-Ip`; the owner through another address 200; a browser already signed in read its save through the held address, 200. 250 empty sign-ups from one caller: 240 x 400 and 10 x 429, and a sign-in from that caller right after was answered. Forty sign-ins in one instant from forty callers: 11 x 401, 29 x 429, the slowest 2.2 s, and the owner signed in right after.
- **The proxy on a loopback socket** (the live layout since PR 371), the setting on, the real database: seven wrong passwords on one name with a new `Cf-Connecting-Ip` each time and one `X-Forwarded-For`: 5 x 401, then 2 x 429. Status 200, `/api/level` 403.
- **The 28 database tests** (`accountsDb` 16, `heroesDb` 12): pass, once, in 24.5 s, the connection checked against the CA file. No test table was left.
- The two accounts the run made (names starting `Zztest`), their sessions, saves and the one fight were deleted by name afterwards. None is left, and the real tables are empty.

- **The two reviewers' own runs**, each with a server of its own and the real database. 152 requests from 12 kinds of caller, 1,824 answers, compared with `main`: 0 differ with the setting off, with and without the database, and with `PUBLIC_ROOMS=1` on both; 152 differ with the setting on, all on the account paths and `/api/heroes`, all from another address with a proxy header. 37 starts with other values of the setting (`0`, `01`, `true`, `yes`, `1;`, a lower-case name and so on): on only for `1`. Eleven ways of breaking the database settings (no CA file, another CA, a dead address, a string that is no URL): every answer was `available:false` or 503, one log line each with a short code, and no part of the string in any log or answer. What they found that is still true is under "What is not protected" and "Before a demo"; what was fixed: the commands of this page no longer print the string when it is no URL, and the page sends a sign-in again by itself when the server had no place for it.

Not run for real: Caddy, Docker and Vercel, so what they put in `X-Forwarded-For` is from their documentation. The caps on accounts made (ten minutes, hour, day, total) were not reached on the real tables: that would take 120 real accounts. They are held by `server/tests/publicAccountsLimits.test.ts` and `server/tests/publicAccountsRoute.test.ts` on a clock the test moves, and by `server/tests/accountsDb.test.ts` on the real service in tables of its own. A browser on the public site: the sign-in is not on the Account page yet.

## When the database is down

- `GET /api/account/status` answers `{"available":false}`. Every other route answers 503 at once, before reading a body.
- A signed-out player sees no account block on the Account page (no sign-in, no Hall of heroes) and plays as before.
- A signed-in player keeps playing from the browser. The block says "Not sent yet. Kept in this browser." and the save goes when the database is back.
- Nothing throws into the game and the offline check is not touched: `npm run preflight -- --offline` passes with no `DATABASE_URL`. Its `accounts` line is a SKIP there; without `--offline` it is a WARN that says `OFF` and why.
- No error text from the database reaches the browser. The log gets one line with a short code.
- **A database that stops answering while the server runs** (tried with the real service behind a forwarder that swallowed every byte): each request still got its 503 within 3 s, the fourth and later ones at once, `/api/health` answered in 1 ms throughout, and the server kept running. Accounts came back by themselves 6 s after the database did, with the save as it was.
- A `DATABASE_URL` that points at a port nothing listens on: status answers `false` in a few milliseconds. At a port that takes the connection and says nothing: in 2.5 s, then at once for the next 15 s.

## Tests

No database is needed for these:

```
npx vitest run server/tests/accountRules.test.ts server/tests/accounts.test.ts server/tests/accountLimits.test.ts server/tests/db.test.ts server/tests/accountRoute.test.ts server/tests/localOnly.test.ts server/tests/publicAccounts.test.ts tests/accountName.test.ts tests/accountContract.test.ts tests/accountClient.test.ts tests/accountMerge.test.ts tests/accountSave.test.ts tests/accountSync.test.ts
```

They cover the name, password and save rules, the hashing and the tokens, every limit and what is given back, every way the database can fail to open, the routes with accounts off, the order in which the routes count and ask, who may reach the routes, the merge, the sync and the client.

What stands in for what, so nobody takes it for the real thing:

- `server/tests/db.test.ts` uses made-up drivers that fail in each way. One of them answers `select 1`, to check what the driver is handed.
- `server/tests/accounts.test.ts` uses a `Db` that keeps nothing and answers with fixed rows or fails, to check what accounts do with an answer or a failure.
- `server/tests/accountRoute.test.ts` uses an `Accounts` object with fixed answers, to check the order in which the routes count, refuse and ask. It stores no account and no save.
- The browser tests (`tests/account*.test.ts`) use a made-up `fetch` that answers the six routes from memory (`tests/helpers/accountKit.ts`). It checks nothing a real server would.

- `server/tests/publicAccounts.test.ts` runs the real app with its real guard over HTTP. A test cannot open a connection from another machine, so the one thing it stands in for is the socket's address: a request can be given the address of a proxy's container or of another device. It holds the setting: the grid of callers with it off and on, the walk of a visitor through the proxy, what stays closed, and who is counted. Its last test runs the three commands of this page that read `DATABASE_URL` with a string that is no URL, and sees that none prints any part of it (Node's own error would print all of it).

None of these is a database, and none proves a statement.

Where each limit of "What a stranger can do" is held:

| Limit | Test |
| --- | --- |
| Without the setting every number, window and answer is as before | `accountLimits.test.ts`, `accountRoute.test.ts`, `accounts.test.ts`, `heroes.test.ts`: the files `main` has, not a byte changed |
| The hash holds no place at the database | `publicAccountsStore.test.ts` ("a password hash holds no place"), `publicAccountsRoute.test.ts` ("sign-ins that wait for their password hash") |
| A flood of sign-ins or sign-ups: two places, one hash, two short lines, the rest 429 | `publicAccountsRoute.test.ts` ("a flood of sign-ins") |
| A full count drops what it counted least | `publicAccountsLimits.test.ts` ("made-up names cannot wipe") |
| One stranger cannot use up everybody's fights | `publicAccountsHeroes.test.ts` ("one stranger with thirty accounts") |
| Accounts in ten minutes, an hour, a day, in all | `publicAccountsLimits.test.ts`, `publicAccountsRoute.test.ts` ("when strangers have made their accounts"), `publicAccountsStore.test.ts` ("the database says how many"), and `accountsDb.test.ts` on a real database |
| Wrong passwords hold a name for a minute at most | `publicAccountsLimits.test.ts` ("five wrong passwords", "ten wrong passwords": 14,400 a day at one name, as without the setting), `publicAccounts.test.ts` ("a caller is the address the proxy took the request from") |
| Who a caller is behind a proxy | `publicAccountsLimits.test.ts` ("who is counted"), `publicAccounts.test.ts` ("PUBLIC_ROOMS=1 alone", "with the proxy inside the server's own network") |

The hall of heroes has two files of the same kind:

```
npx vitest run server/tests/heroes.test.ts tests/accountHeroes.test.ts
```

- `server/tests/heroes.test.ts` (24 tests, no database): what a fight must look like, the limits, who may reach the two paths, the order in which the routes count and ask, and the hall's own code. Three of them hold what the review found: a hall whose statement fails never turns sign-in off (the real accounts and the real hall over a stand-in database in which only the hall's reading fails), one count of unknown sessions for both route files, and the columnstore setting of an older table changed once at start-up. Its stand-ins: an `Accounts` and a `Heroes` object with fixed answers, and a made-up statement function that answers from a list. None is a database.
- `tests/accountHeroes.test.ts` (9 tests, a made-up `fetch`): no request when signed out, one request a fight when signed in, what is sent, the fight's clock, and the hall as the browser reads it.

### The database tests

**These talk to a real database:** `server/tests/accountsDb.test.ts` (16 tests) and `server/tests/heroesDb.test.ts` (12 tests).

```
TEST_DATABASE_URL='postgres://...' npx vitest run server/tests/accountsDb.test.ts server/tests/heroesDb.test.ts
```

- To run them on the service in `.env` without the string ever being on a command line or in the shell's history (one line). The CA file goes in as `sslrootcert`, so the tests' connections are checked as the server's are:
  ```
  node --env-file=.env -e "let u; try { u = new URL(process.env.DATABASE_URL); } catch { console.error('DATABASE_URL is not a URL'); process.exit(1); } if (process.env.DATABASE_CA_FILE) u.searchParams.set('sslrootcert', process.env.DATABASE_CA_FILE); process.env.TEST_DATABASE_URL = u.toString(); require('node:child_process').spawnSync('npx', ['vitest', 'run', 'server/tests/accountsDb.test.ts', 'server/tests/heroesDb.test.ts'], { stdio: 'inherit', shell: process.platform === 'win32' })"
  ```
- `accountsDb` runs on a Tiger Data string or on a Postgres on this machine (`postgres://USER@localhost:5432/DBNAME`; a local address needs no `sslmode`). `heroesDb` needs TimescaleDB, so a plain local Postgres will not do for it.
- Each run makes its own tables (and its own hypertable and continuous aggregate) under a random prefix, `t` and ten hex digits, and drops them at the end. So a run can share the database with the game and with another run. The tests check that nothing with their prefix is left. The real tables are not touched.
- Both files together take about 20 s against Tiger Data from here. Most of the time is password hashes.
- **Without `TEST_DATABASE_URL` these 28 tests are skipped**, as the owner allowed.
- What the 12 of the hall cover: the hypertable, the aggregate and its policy as the service lists them; the columnstore setting, and a table still grouped by account set right by a server that starts on it; a fight written with the session's account; nobody writing as somebody else; the ten best in order with a tie; tonight against all time, before and after a refresh of the aggregate; the 36 buckets of the activity line; the limit of four a minute; an account deleted; a row under a name no account has, traced to its account and taken off.

## What was run against the real database

All of it on the Tiger Data service (free plan, PostgreSQL 18.6, TimescaleDB 2.32.0), from luvudeshi's Mac, on the branch with `main` (b50da59) merged in and the lead's lines applied locally (four in `src/screens/Account.tsx`, two in `src/App.tsx`).

- **The 25 database tests:** pass, three runs in a row (21.3 s, 20.5 s, 20.4 s). Afterwards no test table and no test index was left.
- **Two browser profiles in headless Chrome, 1280 x 720, keyboard play, on the built game** (`vite build`, served by `vite preview`, the real server beside it):
  - In the first: create an account, move the music volume from 70 to 35, win a fight at Polyphemus (score 2190). The win sent one `POST /api/account/fights` (201) and the save. The Account page said "Saved to your account.", and the Hall of heroes showed the hero with 2,190 at Polyphemus, marked "You", under Tonight and under All time. Sign out: the progress stayed.
  - In the second, with nothing stored: the hall, signed out, showed the same hero and score with nobody marked. Sign in with the name in capitals: the hero name, 1 fight, 1 win, the best score, the same 5 of 23 trophies, the cleared stop (ticked on the map) and the volume 35 were there, and that browser kept its own "Play with: Keyboard". The hall now marked the row "You". A second win there, then sign-in again on the first: 2 fights and 2 wins on both, one row for the hero in the hall, and the hall's count of fights this hour two higher.
  - Both signed out at the end. No page error and no console error other than the refused sign-ins. The server logged `server_listening`, `accounts_ready`, `heroes_ready` and nothing else.
- **Refusals, as the player reads them:** a wrong password ("Wrong name or password."), a taken name ("That hero name is taken. Pick another, or sign in."), and from a visitor through the tunnel ten wrong tries answered 401 and the eleventh 429 ("Too many tries. Wait a minute, then try again."; the limit was ten in ten minutes then, and is five in a minute now). The right password from that address then waited too; the laptop's own browser still got in.
- **Through the tunnel's headers** (`Cf-Connecting-Ip`, `Cf-Ray`, `X-Forwarded-For` on every request): sign-in works and is counted as a stranger, and the hall is read with the "You" mark.
- **No request to `/api/account` or `/api/heroes` before the Account page is opened**, signed out, with the database on, off and silent. A whole fight sends none either. With the database off or silent the Account page asks the status once and never the hall.
- **The off states** (run when the page still said so in words; today it draws no account block instead): no `DATABASE_URL`: "Accounts are not available here." after 64 ms. A database port that takes the connection and says nothing: the same after 2.8 s (the limit is 4 s). A port nothing listens on: status `false` in 8 ms, sign-up and the two hall paths 503 in 1 ms. In all three the fight was played, won and kept in the browser.
- **`npm run preflight -- --offline`:** 3 pass, 1 warn (no AI keys), 0 fail, with and without `DATABASE_URL`.
- **The built game holds no part of the connection string:** built with the string in the environment, then searched for the host, the user, the password, the database name, "postgres", "DATABASE_URL" and "sslmode". None is in it.
- The accounts the runs made (one a run), with their saves and their fights, were deleted afterwards. The tables stay, empty.

After the review of the branch (three reviewers; what they found and what was changed is in the PR), on the same service with `DATABASE_CA_FILE` set, so every connection below had the database's certificate and host name checked:

- **The 27 database tests:** pass, three runs in a row (20.5 s, 20.1 s, 19.9 s), the last with the one line given under "The database tests". No test table was left.
- **The unit test files of the accounts, the hall and the preflight** (16 files): 218 tests pass.
- **The real `fights` table was set right by the server's own start-up.** It had been made grouped by account. The first reading of the hall on the new code logged `heroes_columnstore_set`, and the service then listed it as ordered by time with no grouping. The second start changed nothing and logged only `accounts_ready` and `heroes_ready`. The table was empty, with one chunk and none in the columnstore.
- **A fresh start of the server:** `GET /api/account/status` answered `{"available":true}` in 0.48 s, the first `GET /api/heroes` in 0.24 s (0.28 s the time it also changed the setting), the next from memory in 2 ms.
- **`npm run preflight`** with the server up: `PASS accounts: ON, the database answered in 290 ms, its certificate checked; the server on port 8795 has them on`. The other states, each run for real: no `DATABASE_URL` (`OFF (no_database_url)`), a CA file that is not there (`OFF (bad_ca_file, ENOENT)`), an address nothing listens on (`OFF (no_answer, ECONNREFUSED)`), the real database with no CA file (`ON ... its certificate NOT checked`, a WARN), and a running server that has no accounts (`OFF on the server`). All are WARN and the exit code stays 0. `npm run preflight -- --offline` prints `SKIP accounts` and passes with and without `DATABASE_URL`.
- **Closing the hall's board**, in headless Chrome against the real server with the lead's lines applied locally: `GET /api/heroes` was sent once when the Account page opened, once when the board opened and not at all when it closed (before the fix: once more at each closing).

How long things take from this Mac (the database is a 40 ms round trip away):

| What | Connection open | After 30 s with no request |
| --- | --- | --- |
| Sign-in (one password hash, three statements) | 0.34 s | 0.63 s |
| A save written | 0.04 s | 0.35 s |
| A save read | 0.04 s | about 0.33 s |
| A fight written to the hall | 0.08 s | 0.32 s |
| The hall read at tonight's size (from the database / from the server's memory) | 0.045 s / 0.015 s | |
| Sign-out | 0.04 s | |
| The first status after a start (connect, make the tables) | 0.5 s | |

A fight is longer than 30 s, so what is sent after a fight is the slow case: a third of a second, in the background.

Two lines in `src/App.tsx` (the lead's file, in the PR, tried here and not committed):

- After a sign-in brings cleared stops into a browser, the map does not mark them until the page is loaded again, because `src/App.tsx` reads the profile's cleared stops once at start. Every stop can be played either way. The fix is on the `QuestMap`: `cleared={[...new Set([...flow.cleared, ...profile.cleared])]}` in place of `cleared={flow.cleared}`. With it the second browser's map showed the tick at once.
- The god of a fight reaches the hall only when `recordFight` is given `godId: god?.god ?? null`. Without it the god is empty and everything else works.

## Not done, not checked

- A real person on a real phone through the real tunnel. The tunnel was stood in for by its headers.
- The camera. Every fight in the run was played on the keyboard.
- A service with a certificate signed by a public CA. The free service was opened with its own CA in `DATABASE_CA_FILE`, on a Mac; not on the demo laptop.
- **The server connects as the service's owner role.** That role is not a superuser, but it owns the five objects and may create roles and databases. A role limited to the five tables was not made: it is a new identity on the sponsor's service, and the owner's call. Every statement passes its values apart from its text, so this would be a second line of defence, not the first.
- A daily bucket for the aggregate in place of the hourly one. On the test load it would be 7,919 rows against 18,939. It needs the aggregate dropped and made again, and was not tried.
- A fight just written can be missing from the hall for up to 5 seconds, when somebody else read the hall just before it: the reading in the server's memory is not thrown away by a fight.
- Two servers that first use the hall at the same moment on a database with no hall objects: one of them fails once (`23505`) and has its hall 15 seconds later. The real objects exist, so this cannot happen at the demo.
- More than a few players at once against the free service. The limits are tested one request at a time.
- The demo laptop (Windows). Everything above ran on a Mac.
- Tiger Data pausing a free service that nobody uses: not seen, and not looked up. If it does, the first request after a pause answers "not available" and the next try 15 s later finds it.
- `scripts/check-dist.mjs` does not look for `DATABASE_URL` or its value in the built game: the name does not say "secret" and a URL does not look like a key. The lead owns that file. `tests/accountClient.test.ts` scans `src/` for it, and the built game was searched by a script (above).
- `make check`, `make ready`, eslint and the full test suite were not run for this branch (the owner's load rule for the night). The account and hall test files were, and both typechecks. After the review fixes only the server's typecheck was run again; the one browser file changed then (`src/account/ui/HallOfHeroes.tsx`) was run in Chrome, not typechecked.
- The scrypt settings are not stored with the hash. Changing them later needs a column.
- There is no way to change a password or to end all sessions of an account.
- For the public server ("On a public server"): Caddy, Docker and Vercel were not run, the caps on accounts made were not reached on the real tables, and nobody signed in from a browser on the public site. `make check`, `make ready`, eslint, the full test suite and the browser's typecheck were not run for that change either (the load rule again); the account, hall and guard test files were, and the server's typecheck once.
