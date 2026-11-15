# Accounts on Tiger Data

A player can sign up with a hero name and a password. Their progress, settings and character are then saved to their account and come back on another browser. Playing without an account works as before: everything stays in the browser and no network is needed.

The database is Tiger Data, the sponsor's hosted Postgres. The server reaches it with one connection string, `DATABASE_URL`.

## Where this stands

- The server half is built: the routes, the rules, the limits, the database code.
- **Nothing here has been run against a real Postgres yet.** The tests that need one are written and are skipped until a database exists (see Tests).
- Waiting on the owner (issue #33): a Tiger Data service, a yes to the `pg` package, and whether the database tests may skip when no database is named.

## Set it up on the demo laptop

Today the demo laptop runs the server with no keys at all. With nothing done, accounts are off and the Account page says so.

1. **The owner makes a Tiger Data service** (free plan). Copy its connection string. It looks like `postgres://USER:PASSWORD@HOST:PORT/DBNAME?sslmode=require`.
2. **The owner adds the driver.** `package.json` is the lead's file. The line is `"pg": "8.23.1"` under `dependencies`, then `npm install`. No code changes with it: `server/lib/db.ts` loads the driver by name when the server starts.
3. **Put the string in `.env`** at the repo root, on one line: `DATABASE_URL=postgres://...`. Never commit `.env`. Never paste the string in an issue, a chat or a test.
4. **Restart the server** (`npm run server`). The first line it logs has `"accounts":true`, which only means the variable is set.
5. **Check it:** `curl http://localhost:8787/api/account/status` answers `{"available":true}`. The three tables are made at that first request.

If it answers `{"available":false}`, the server log says why, in one line:

| Log line | Meaning |
| --- | --- |
| `accounts_unavailable` `no_driver` | `pg` is not installed (step 2). |
| `accounts_unavailable` `bad_url` | `DATABASE_URL` is not a `postgres://` address. |
| `accounts_unavailable` `no_answer` | The database did not answer in 3 seconds. The detail says what the driver said. |
| `accounts_tables_failed` | It answered, but the tables could not be made. |
| `accounts_query_failed` | A later statement failed. Accounts go off for 5 seconds, then it is tried again. |

The connection string, its password and its host are cut out of every log line. After a failure the server tries the database again at most every 15 seconds, so one that comes back is found without a restart.

To take accounts off again: remove the line from `.env` and restart.

## What is stored

Three tables, made with `create table if not exists`:

- `accounts`: an id, the hero name, the name in lower case (unique), the password hash and its salt, when it was made.
- `sessions`: the SHA-256 of a session token, the account, when it was made, when it runs out.
- `saves`: one JSON document per account, and when it was written.

Never stored: the password, the session token, an email or anything else about the person.

- **Password:** 8 to 200 characters. Hashed with Node's `scrypt` (N = 2^17, r = 8, p = 1, a 16-byte random salt per account) and compared with `timingSafeEqual`.
- **Token:** 32 random bytes. The browser gets it once, at sign-up or sign-in, and sends it as `Authorization: Bearer <token>`. There is no cookie. A session lasts 30 days. An account keeps 5 sessions; one more ends the oldest.
- **Save:** `{ version: 1, profile, settings, character, achievements? }`, checked by zod on the way in and again on the way out. Unknown fields are dropped. The server never acts on what is in it.

To delete an account by hand: `delete from accounts where name_key = lower('The Name');`. Its sessions and its save go with it.

## The routes

| Route | Answers |
| --- | --- |
| `GET /api/account/status` | 200 `{ available }`. Never fails. |
| `POST /api/account/signup` `{ name, password }` | 201 `{ token, name }`, 400 `{ error: "invalid", field }`, 409 `name_taken`, 429 `slow_down`, 503 `unavailable` |
| `POST /api/account/signin` `{ name, password }` | 200 `{ token, name }`, 401 `wrong_name_or_password`, 429, 503 |
| `POST /api/account/signout` (Bearer) | 204, also for a token nobody has. 429, 503. |
| `GET /api/account/save` (Bearer) | 200 `{ save, updatedAt }` (both null before the first save), 401 `signed_out`, 429, 503 |
| `PUT /api/account/save` (Bearer) `{ save }` | 200 `{ updatedAt }`, 400 `invalid`, 401, 413 `too_big`, 429, 503 |

Details that are easy to miss:

- The name is cleaned the way the profile name is (control characters dropped, cut to 20), and then the spaces at its ends are dropped. It must be 3 characters or more. The answer carries the name as stored.
- Two names are the same account without regard to case, to how an accent was typed, or to the number of spaces between words.
- A sign-in that fails gets one answer whatever the reason: an unknown name, a wrong password, a body that is not a name and a password. An unknown name costs the server the same password hash as a wrong password.
- With accounts off, every route but status answers 503 before it reads a body.
- A 503 on sign-out means the session is still in the database. The browser forgets its token anyway.

## What a stranger can do, and what bounds it

The public tunnel reaches `/api`, and so does any device on the Wi-Fi. `server/lib/localOnly.ts` opens exactly these five paths to them and nothing else under `/api/account/`. The numbers are in `server/lib/accountLimits.ts` and `server/lib/accounts.ts`.

| A stranger tries to | Bound |
| --- | --- |
| Find out which names exist | Sign-in never says. Sign-up does say when a name is taken (it has to), at 10 sign-ups in 10 minutes an address and 30 for all strangers together. A name is a hero name, not a person. |
| Guess a password | 20 sign-ins a minute an address, 60 a minute for all strangers, and 10 attempts in 10 minutes on any one name (1,440 a day). |
| Burn the CPU with password hashes | One hash at a time, at most 8 waiting, the rest get 429. At the limits above that is about 13 seconds of one core a minute. A hash needs 128 MB while it runs. |
| Fill the database with accounts | 30 sign-ups in 10 minutes for all strangers, and 2,000 accounts at most. Past that sign-up answers 503. |
| Fill it with saves | One save per account, 32 KB at most as sent, so 64 MB at the very most. Each part of a save has its own bound. |
| Fill it with sessions | 5 per account. Sessions that ran out are removed at the next sign-in. |
| Keep the database busy | 120 requests with a token a minute an address, 600 for all strangers, 20 unknown tokens a minute an address, 60 writes a minute to one account. Status asks the database at most once in 5 seconds. |
| Send a huge body | Sign-up and sign-in read 2 KB, a save 32 KB. A body that says it is longer is refused unread. A save body is not read at all before the token is known. |
| Hold connections | The server holds 4 database connections. A query is given up after 3 seconds, and after one failure every account route answers 503 at once for 5 seconds. A request that stops half way is closed by the server's request timeout. |
| Use another player's save | No route takes an account id. A request reaches the row of the session it carries and no other. |
| Run SQL | Every value goes to the database apart from the statement text. |
| Use a signed-in browser from another site | There is no cookie to ride on. The token is a header that only this game's page sends. |

Things to know about these limits:

- **The laptop that runs the server is never counted or refused** (but for the 60 writes a minute to one account), so strangers cannot lock the demo out of its own accounts.
- **A venue's Wi-Fi is one address.** Ten people behind it share the per-address numbers. They are set with that in mind.
- **A stranger who knows a name can keep its owner from signing in on a new browser**, by using up that name's 10 attempts again and again. A browser that is already signed in is not affected. This is the price of the per-name limit.
- **In `npm run dev:all`, a phone on the Wi-Fi counts as the laptop**, because its requests come through Vite's proxy on this machine. This is true of the rooms too. The tunnel goes straight to the server, so its visitors are counted.

## Tests

No database is needed for these 48 tests:

```
npx vitest run server/tests/accountRules.test.ts server/tests/accounts.test.ts server/tests/accountLimits.test.ts server/tests/db.test.ts server/tests/accountRoute.test.ts tests/accountName.test.ts
```

They cover the name, password and save rules, the hashing and the tokens, every limit, every way the database can fail to open, the routes with accounts off, and who may reach the routes. Where a test needs a database that fails, it uses a made-up driver that fails in that way. No test has a made-up database that works.

The database tests talk to a real Postgres:

```
TEST_DATABASE_URL='postgres://...' npx vitest run server/tests/accountsDb.test.ts
```

Each run makes its own three tables under a random prefix and drops them at the end, so it can use the same database as the game. **Without `TEST_DATABASE_URL` these 14 tests are skipped.** Whether they may skip is a question to the owner on #33.

## Not done, not checked

- No statement in `server/lib/accounts.ts` has run against Postgres. The database tests have never run.
- The driver has never been loaded. Two things to watch at the first real start: whether Tiger Data's certificate is accepted with `sslmode=require` as the driver reads it (if not, the log says `no_answer` with a certificate error; do not switch checking off without asking), and whether the driver prints a warning of its own about SSL modes.
- `scripts/check-dist.mjs` does not look for `DATABASE_URL` or its value in the built game: the name does not say "secret" and a URL does not look like a key. The lead owns that file.
- The scrypt settings are not stored with the hash. Changing them later needs a column.
