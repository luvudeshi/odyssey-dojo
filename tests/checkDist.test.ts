// Guards scripts/check-dist.mjs: a planted key fails the scan in every form it is looked for, a clean folder
// passes, and nothing the script prints holds a value. No build is run here and the real .env is never read:
// every run of the script is given a made-up .env in a temporary folder.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { afterAll, describe, expect, it } from "vitest";
import {
  base64Needles, decodeEnvFile, hitLine, isSecretName, KEY_SHAPES, layers, looksLikeKey, MIN_VALUE_LENGTH, pickSecrets, readVariables,
  redact, scanBytes, scanFolder, SERVER_KEY_NAMES, serverKeyNames, SHELL, shellVariables, valueForms,
} from "../scripts/check-dist.mjs";

const SCRIPT = "scripts/check-dist.mjs";
const [GEMINI_NAME = "", ELEVEN_NAME = ""] = SERVER_KEY_NAMES;

// Made-up keys, put together from pieces so that no key-shaped string stands in this file.
const GOOGLE_KEY = ["AI", "za", "Sy"].join("") + "Made-Up_Key-for-a-Test_0123456789";
const ELEVEN_KEY = ["sk", "_"].join("") + "0a1b2c3d4e5f".repeat(4);
/** A password with every kind of character an encoder changes. */
const ODD_PASSWORD = ["p@ss w", 'ord/+"q\\', "uote&1é"].join("");

const scratch = mkdtempSync(join(tmpdir(), "odyssey-check-dist-"));
afterAll(() => { rmSync(scratch, { recursive: true, force: true }); });

function secretsOf(variables: Record<string, string>) {
  return pickSecrets(Object.entries(variables).map(([name, value]) => ({ name, value, source: ".env" }))).secrets;
}

/** The forms a value was found in, in the bytes given. */
function formsFound(content: string | Buffer, variables: Record<string, string>): string[] {
  const bytes = typeof content === "string" ? Buffer.from(content, "utf8") : content;
  return scanBytes(bytes, secretsOf(variables), []).filter((hit) => hit.kind === "value").map((hit) => hit.form);
}

/** A folder under the scratch folder holding these files. */
function folder(name: string, files: Record<string, string | Buffer>): string {
  const dir = join(scratch, name);
  mkdirSync(dir, { recursive: true });
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

/** Runs the script as `make` would, with a shell that holds only what Node needs to start and what the test adds. */
function run(args: string[], env: Record<string, string> = {}) {
  const base = Object.fromEntries(["PATH", "SystemRoot"].flatMap((name) => (process.env[name] === undefined ? [] : [[name, process.env[name]]])));
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", env: { ...base, ...env } });
  // The scratch folder's own path is taken out, so a digit in a temporary folder's name is not read as a leak.
  return { code: result.status, output: `${result.stdout}${result.stderr}`.replaceAll(scratch, "<scratch>") };
}

/** Fails when the text holds the value, any six characters in a row of it, or its length as a number. */
function expectNothingOf(value: string, text: string) {
  for (let start = 0; start + 6 <= value.length; start += 1) expect(text).not.toContain(value.slice(start, start + 6));
  expect(text).not.toMatch(new RegExp(`\\b${String(value.length)}\\b`));
}

describe("which variables are secrets", () => {
  it("goes by the words in the name", () => {
    for (const name of [GEMINI_NAME, ELEVEN_NAME, "VITE_API_TOKEN", "db_password", "CLIENT_SECRET", "OPENAIKEY", "AWS_CREDENTIALS"]) expect(isSecretName(name), name).toBe(true);
    for (const name of ["PUBLIC_BASE_URL", "PUBLIC_URL", "AI_SERVER_PORT", "API_URL", "KEYBOARD_ONLY", "NODE_ENV", "PWD"]) expect(isSecretName(name), name).toBe(false);
  });

  it("goes by the look of the value too", () => {
    for (const value of [GOOGLE_KEY, ELEVEN_KEY, "f3a9c1d7e5b2a8c4f6d0e1b3", "QWxhZGRpbjpvcGVuIHNlc2FtZQ=="]) expect(looksLikeKey(value), "a made-up key").toBe(true);
    for (const value of ["https://game.example.com:8787", "8787", "production", "true", "/usr/local/share/odyssey2026/data", "a plain sentence of words", "abc123"]) {
      expect(looksLikeKey(value), value).toBe(false);
    }
  });

  it("looks for keys, and leaves URLs, ports, empty and short values alone, saying why", () => {
    const text = [
      `${GEMINI_NAME}=${GOOGLE_KEY}`,
      `export ${ELEVEN_NAME}="${ELEVEN_KEY}"   # in quotes, with a comment after`,
      "PUBLIC_BASE_URL=https://game.example.com:8787",
      "AI_SERVER_PORT=8787",
      "SESSION_ID=f3a9c1d7e5b2a8c4f6d0e1b3",
      "ADMIN_PASSWORD=abc",
      "SPARE_TOKEN=",
    ].join("\r\n");
    // Node hands the variables back in its own order, not the file's, so nothing here goes by order.
    const { secrets, skipped } = pickSecrets(readVariables(text, ".env"));
    const values = Object.fromEntries(secrets.map((secret) => [secret.name, secret.value]));
    expect(values).toEqual({ [GEMINI_NAME]: GOOGLE_KEY, [ELEVEN_NAME]: ELEVEN_KEY, SESSION_ID: "f3a9c1d7e5b2a8c4f6d0e1b3" });
    const reasons = Object.fromEntries(skipped.map((skip) => [skip.name, skip.why]));
    expect(Object.keys(reasons).sort()).toEqual(["ADMIN_PASSWORD", "AI_SERVER_PORT", "PUBLIC_BASE_URL", "SPARE_TOKEN"]);
    expect(reasons.PUBLIC_BASE_URL).toBe(reasons.AI_SERVER_PORT);
    expect(reasons.AI_SERVER_PORT).toContain("not a secret");
    expect(reasons.ADMIN_PASSWORD).toContain(`shorter than ${String(MIN_VALUE_LENGTH)} characters`);
    expect(reasons.SPARE_TOKEN).toBe("it is empty");
  });

  it("reads a .env saved with a byte order mark or as UTF-16", () => {
    const line = `${GEMINI_NAME}=${GOOGLE_KEY}\n`;
    const saved = [Buffer.from(`\uFEFF${line}`, "utf8"), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(line, "utf16le")])];
    for (const bytes of saved) expect(readVariables(decodeEnvFile(bytes), ".env")).toEqual([{ name: GEMINI_NAME, value: GOOGLE_KEY, source: ".env" }]);
  });

  it("takes from the shell only what is a secret by name and by shape", () => {
    const shell = { [GEMINI_NAME]: GOOGLE_KEY, DEPLOY_TOKEN: "production", SESSION_ID: "f3a9c1d7e5b2a8c4f6d0e1b3", HOME: "/home/someone", UNSET_KEY: undefined };
    expect(shellVariables(shell)).toEqual([{ name: GEMINI_NAME, value: GOOGLE_KEY, source: SHELL }]);
  });

  it("adds the secret names in .env.example to the server's key names", () => {
    const example = [`${GEMINI_NAME}=`, "# NEW_VOICE_TOKEN=", "# AI_SERVER_PORT=8787", "export STORE_SECRET=x", "# A note with KEY = in it"].join("\n");
    expect(serverKeyNames(example)).toEqual([...SERVER_KEY_NAMES, "NEW_VOICE_TOKEN", "STORE_SECRET"]);
    expect(serverKeyNames("")).toEqual(SERVER_KEY_NAMES);
    expect(serverKeyNames(readFileSync(".env.example", "utf8"))).toEqual(SERVER_KEY_NAMES);
  });
});

describe("finding a value in every form", () => {
  const env = { [GEMINI_NAME]: GOOGLE_KEY };
  const odd = { DB_PASSWORD: ODD_PASSWORD };

  it("as written, in a script", () => {
    expect(formsFound(`const k="${GOOGLE_KEY}";fetch(u+k)`, env)).toEqual(["as written"]);
    expect(formsFound(`const k="${GOOGLE_KEY.slice(0, -1)}";`, env)).toEqual([]);
  });

  it("JSON-escaped, as in a source map", () => {
    const map = JSON.stringify({ version: 3, sources: ["../../server/env.ts"], sourcesContent: [`const password = "${ODD_PASSWORD}";`] });
    expect(map).not.toContain(ODD_PASSWORD);
    expect(formsFound(map, odd)).toEqual(["JSON-escaped"]);
  });

  it("URL-encoded, by either encoder", () => {
    const query = new URLSearchParams({ password: ODD_PASSWORD }).toString();
    expect(encodeURIComponent(ODD_PASSWORD)).not.toBe(query.slice("password=".length));
    expect(formsFound(`https://api.example.com/v1?password=${encodeURIComponent(ODD_PASSWORD)}`, odd)).toEqual(["URL-encoded"]);
    expect(formsFound(`https://api.example.com/v1?${query}`, odd)).toEqual(["URL-encoded"]);
  });

  it("in base64, whatever comes before and after it", () => {
    for (let lead = 0; lead < 6; lead += 1) {
      for (let tail = 0; tail < 4; tail += 1) {
        const blob = Buffer.from(`${"x".repeat(lead)}${GOOGLE_KEY}${"y".repeat(tail)}`, "utf8").toString("base64");
        expect(formsFound(`atob("${blob}")`, env), `${String(lead)} before, ${String(tail)} after`).toEqual(["in base64"]);
      }
    }
    expect(base64Needles(Buffer.from(GOOGLE_KEY, "utf8")).every((needle) => needle.length >= MIN_VALUE_LENGTH)).toBe(true);
  });

  it("in URL-safe base64", () => {
    const value = "key>>>???~~~secret1";
    const standard = Buffer.from(`x${value}`, "utf8").toString("base64");
    expect(standard).toMatch(/[+/]/);
    expect(formsFound(Buffer.from(`x${value}`, "utf8").toString("base64url"), { MY_SECRET: value })).toEqual(["in URL-safe base64"]);
  });

  it("in hex and in UTF-16, inside a binary file", () => {
    const noise = Buffer.from(Array.from({ length: 4096 }, (_, index) => (index * 151 + 7) % 256));
    const utf16 = Buffer.concat([noise, Buffer.from(GOOGLE_KEY, "utf16le"), noise]);
    const plain = Buffer.concat([noise, Buffer.from(GOOGLE_KEY, "utf8"), noise]);
    expect(formsFound(utf16, env)).toEqual(["in UTF-16"]);
    expect(formsFound(plain, env)).toEqual(["as written"]);
    expect(formsFound(Buffer.from(GOOGLE_KEY, "utf8").toString("hex"), env)).toEqual(["in hex"]);
    expect(formsFound(Buffer.from(GOOGLE_KEY, "utf8").toString("hex").toUpperCase(), env)).toEqual(["in hex"]);
    expect(formsFound(noise, env)).toEqual([]);
  });

  it("inside a .gz or .br file", () => {
    // Long enough that both packers really pack it: a very short file is stored as it is.
    const script = Buffer.from(`${"function render(scene){return scene.draw()}\n".repeat(200)}const k="${GOOGLE_KEY}";`, "utf8");
    for (const [name, packed] of [["app.js.gz", gzipSync(script)], ["app.js.br", brotliCompressSync(script)]] as const) {
      const found = layers(name, packed).flatMap((layer) => scanBytes(layer.bytes, secretsOf(env), []).filter((hit) => hit.kind === "value").map((hit) => `${layer.label}: ${hit.form}`));
      expect(found).toEqual([`${name} (unpacked): as written`]);
    }
    expect(layers("not-really.gz", script)).toHaveLength(1);
  });

  it("never looks for anything shorter than the shortest value", () => {
    for (const value of [GOOGLE_KEY, ELEVEN_KEY, ODD_PASSWORD, "12345678"]) {
      for (const needle of valueForms(value)) expect(needle.bytes.length).toBeGreaterThanOrEqual(MIN_VALUE_LENGTH);
    }
  });
});

describe("key shapes and key names, with no .env at all", () => {
  const kinds = (content: string) => scanBytes(Buffer.from(content, "utf8"), [], SERVER_KEY_NAMES).map((hit) => `${hit.kind}: ${hit.name}`);

  it("finds a Google key and an ElevenLabs key", () => {
    expect(kinds(`fetch("https://example.com/v1?key=${GOOGLE_KEY}&alt=json")`)).toEqual([`shape: ${KEY_SHAPES[0]?.label ?? ""}`]);
    expect(kinds(`headers:{"xi-api-key":"${ELEVEN_KEY}"}`)).toEqual([`shape: ${KEY_SHAPES[1]?.label ?? ""}`]);
  });

  it("does not take a near miss for a key", () => {
    const short = GOOGLE_KEY.slice(0, 30);
    const insideBlob = `Zm9v${GOOGLE_KEY}YmFy`;
    const word = `ta${ELEVEN_KEY}`;
    const stub = ELEVEN_KEY.slice(0, 20);
    for (const text of [short, insideBlob, word, stub, "a task_list and a mask_layer"]) expect(kinds(`x="${text}"`), text.slice(0, 8)).toEqual([]);
  });

  it("finds the name of a server key variable", () => {
    expect(kinds(`if(!process.env.${GEMINI_NAME})throw new Error("${ELEVEN_NAME} is not set")`)).toEqual([`name: ${GEMINI_NAME}`, `name: ${ELEVEN_NAME}`]);
  });

  it("finds nothing key-shaped in the script or in this test", () => {
    for (const file of [SCRIPT, "tests/checkDist.test.ts"]) expect(scanBytes(readFileSync(file), [], []), file).toEqual([]);
  });
});

describe("what is printed", () => {
  it("names the file, the variable and the place, never the value", () => {
    const dist = folder("report", { "assets/app.js": `0123456789const k="${GOOGLE_KEY}";const again="${GOOGLE_KEY}";` });
    const { files, found } = scanFolder(dist, secretsOf({ [GEMINI_NAME]: GOOGLE_KEY }), []);
    expect(files).toBe(1);
    const lines = found.map(({ file, hit }) => hitLine(file, hit));
    expect(lines).toEqual([
      `LEAK assets/app.js: the value of ${GEMINI_NAME} (from .env), as written, at byte 19, and 1 more in this file`,
      `LEAK assets/app.js: a string shaped like a Google API key, at byte 19, and 1 more in this file`,
    ]);
    expectNothingOf(GOOGLE_KEY, lines.join("\n"));
  });

  it("takes a value out of any text before it is printed", () => {
    const secrets = secretsOf({ DB_PASSWORD: ODD_PASSWORD });
    const safe = redact(`could not parse ${ODD_PASSWORD} near ${JSON.stringify(ODD_PASSWORD)}`, secrets);
    expect(safe).toBe('could not parse [hidden] near "[hidden]"');
  });
});

describe("the script, run from the command line", () => {
  const envFile = join(folder("env", { ".env": `${GEMINI_NAME}=${GOOGLE_KEY}\n${ELEVEN_NAME}=${ELEVEN_KEY}\nAI_SERVER_PORT=8787\n` }), ".env");
  const clean = { "index.html": "<!doctype html><title>Odyssey Fighter</title>", "assets/app.js": "render(scene);start()", "models/hero.glb": Buffer.from([0, 1, 2, 3, 255]) };

  it("exits 0 on a clean folder", () => {
    const { code, output } = run([`--dist=${folder("clean", clean)}`, `--env=${envFile}`]);
    expect(output).toContain("3 files");
    expect(output).toMatch(/values looked for: \w+ \(\.env\), \w+ \(\.env\)\n/);
    for (const name of SERVER_KEY_NAMES) expect(output).toContain(`${name} (.env)`);
    expect(output).toContain("value not looked for: AI_SERVER_PORT (.env)");
    expect(output).toContain("clean.");
    expect(code).toBe(0);
  });

  it("exits 1 on a planted key and prints the file and the variable name, never the value", () => {
    const dist = folder("planted", { ...clean, "assets/app.js": `const speak=(t)=>fetch(u,{headers:{"xi-api-key":"${ELEVEN_KEY}"}})` });
    const { code, output } = run([`--dist=${dist}`, `--env=${envFile}`]);
    expect(code).toBe(1);
    expect(output).toContain(`LEAK assets/app.js: the value of ${ELEVEN_NAME} (from .env), as written, at byte`);
    expect(output).toContain("LEAK assets/app.js: a string shaped like an ElevenLabs API key");
    expect(output).not.toContain(`${GEMINI_NAME} (from`);
    expectNothingOf(ELEVEN_KEY, output);
    expectNothingOf(GOOGLE_KEY, output);
  });

  it("exits 1 on a key in a source map, in a binary file and in base64", () => {
    const dist = folder("hidden", {
      ...clean,
      "assets/app.js.map": JSON.stringify({ version: 3, sourcesContent: [`const key = "${GOOGLE_KEY}";`] }),
      "models/hero.glb": Buffer.concat([Buffer.from([0, 255, 254, 7]), Buffer.from(ELEVEN_KEY, "utf16le"), Buffer.from([0, 9])]),
      "assets/vendor.js": `atob("${Buffer.from(`Bearer ${ELEVEN_KEY}`, "utf8").toString("base64")}")`,
    });
    const { code, output } = run([`--dist=${dist}`, `--env=${envFile}`]);
    expect(code).toBe(1);
    expect(output).toContain(`LEAK assets/app.js.map: the value of ${GEMINI_NAME} (from .env), as written`);
    expect(output).toContain(`LEAK models/hero.glb: the value of ${ELEVEN_NAME} (from .env), in UTF-16`);
    expect(output).toContain(`LEAK assets/vendor.js: the value of ${ELEVEN_NAME} (from .env), in base64`);
    expectNothingOf(ELEVEN_KEY, output);
    expectNothingOf(GOOGLE_KEY, output);
  });

  it("exits 1 on a key that is only in the shell, and on a key variable's name", () => {
    const shellKey = ["tok", "en9"].join("") + "f3a9c1d7e5b2a8c4f6d0";
    const dist = folder("shell", { ...clean, "assets/app.js": `const t="${shellKey}";const hint="set ${GEMINI_NAME} in .env"` });
    const { code, output } = run([`--dist=${dist}`, `--env=${envFile}`], { DEPLOY_TOKEN: shellKey });
    expect(code).toBe(1);
    expect(output).toContain(`LEAK assets/app.js: the value of DEPLOY_TOKEN (from ${SHELL}), as written`);
    expect(output).toContain(`LEAK assets/app.js: the variable name ${GEMINI_NAME}`);
    expectNothingOf(shellKey, output);
  });

  it("exits 2 when it cannot do its job", () => {
    const dist = folder("clean", clean);
    expect(run([`--dist=${join(scratch, "no-such-folder")}`, `--env=${envFile}`]).code).toBe(2);
    expect(run([`--dist=${dist}`, `--env=${join(scratch, "no-such.env")}`]).code).toBe(2);
    expect(run([`--dist=${folder("empty", {})}`, `--env=${envFile}`]).code).toBe(2);
    expect(run([`--dist=${dist}`, `--env=${envFile}`, "--print-values"]).code).toBe(2);
  });
});
