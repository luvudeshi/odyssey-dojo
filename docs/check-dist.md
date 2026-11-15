# Key check on the built game

Issue #196. The server holds the Gemini and ElevenLabs keys. `scripts/check-dist.mjs` proves that neither key, nor anything else secret in `.env`, is in the files a browser downloads.

```bash
node scripts/check-dist.mjs                 # build, then scan dist
node scripts/check-dist.mjs --no-build      # scan the dist that is already there
node scripts/check-dist.mjs --env=<file>    # take the values from this .env (default: .env at the repo root)
node scripts/check-dist.mjs --dist=<folder> # scan this folder as it is, build nothing
```

A worktree has no `.env`, so from a worktree pass the main checkout's: `--env=/path/to/main/checkout/.env`. With no `.env` the check still runs and still looks for key shapes and key names; it says that no values from a file were looked for.

Exit codes: **0** nothing found. **1** a leak. **2** the check could not do its job (no `dist`, an empty `dist`, no file at `--env`, a failed build, an unknown option).

## What it looks for

Every file in `dist` is read as bytes, so models, sounds, the pose model and wasm are scanned the same way as scripts, and a source map is scanned like any other file. A `.gz` or `.br` file is also unpacked and scanned.

1. **The value of each secret variable** in the `.env` and in the files Vite reads from the same folder (`.env.local`, `.env.production`, `.env.production.local`). When the script builds, it tells Vite to read those same files, so a build from a worktree is checked as a build in the main checkout would be.
2. **Key-shaped strings**, whatever any `.env` says: a Google key (`AIza` and 35 more letters, digits, `_` or `-`) and an ElevenLabs key (`sk_` and 32 or more letters or digits). The string has to stand alone, so the same letters in the middle of a long base64 blob are not a hit.
3. **The names of the server's key variables**: `GEMINI_API_KEY`, `ELEVENLABS_API_KEY`, and any name in `.env.example` that says secret. A name in the bundle means server code or a message about server setup was bundled into the page.

### Which variables are secrets

A variable is looked for when **its name says secret or its value looks like a key**, and its value has at least 8 characters.

- The name says secret when one of its words is `KEY`, `KEYS`, `APIKEY`, `TOKEN`, `TOKENS`, `SECRET`, `SECRETS`, `PASSWORD`, `PASSWD`, `PASS`, `CREDENTIAL` or `CREDENTIALS` (words are split at `_` and anything else that is not a letter or digit), or the name ends in `KEY`, `TOKEN`, `SECRET` or `PASSWORD`.
- The value looks like a key when it has one of the two key shapes, or is one unbroken run of 20 or more letters, digits and `_ - + / =` with at least one letter and one digit, and does not start with `/`.
- So `PUBLIC_BASE_URL`, `PUBLIC_URL` and `AI_SERVER_PORT` are left alone: a URL or a port number is not a secret and may rightly be in the page. Each variable left alone is listed by name with the reason.
- A value under 8 characters is not looked for, because it cannot be told from ordinary text in a 60 MB build. The script says so by name. An empty value is skipped the same way.
- Variables of the shell the script runs in are looked for only when both are true (secret by name and key-shaped by value), so an ordinary word in somebody's shell never fails a build. They are counted in the report, and named only when found.

### Forms of a value

As written; JSON-escaped (how Vite writes a value into a script, and how a source map holds source text); URL-encoded two ways (`%20` and `+` for a space); base64 and URL-safe base64 at all three byte offsets, so it is found inside a longer encoded text such as `Bearer <key>`; hex in lower and upper case; UTF-16 (little-endian).

### What is printed

On a leak: the file, the variable's **name**, the form, and the byte it starts at. Never the value, any part of it, or its length. Everything the script prints, error messages included, first has every secret value taken out.

## Not covered

- A value split across two strings and joined at run time, written as a list of character codes, reversed, encrypted, or packed inside a format other than gzip or brotli (a zip, a compressed mesh).
- JavaScript escapes other than JSON's, for example `\x41`.
- Key shapes other than the two above. A key from another service is found only through its value in `.env`.
- Values shorter than 8 characters.
- Anything the page fetches at run time. What the server answers is not checked here.

## If it finds a leak

Do not paste the value anywhere: not in an issue, a PR, a comment or a chat. Open an issue naming the file and the variable, tell the lead on #33, and treat the key as public: make a new one and retire the old one.

## Result

Run on 14 November 2026 on `main` at `f8b1891`, built with the pose model files in `public/mediapipe`, values taken from the main checkout's `.env`: **170 files, 61.7 MB, exit 0.** Both keys were looked for by value; nothing was found by value, by shape or by name.

Two controls on the same day, both with made-up values: a made-up variable holding a word that is in the game's text gave exit 1 on the real `dist`, and a throwaway Vite project that reads a `VITE_` variable from a `.env` gave exit 1 with the value found in its bundle.

## In `make check`

Not wired in yet: the Makefile is the lead's. `make check` already builds, so the line scans that build and needs no keys:

```make
test:
	npm test && npm run build && node scripts/check-dist.mjs --no-build
```

The test is `tests/checkDist.test.ts`. It builds nothing and never reads the real `.env`.
