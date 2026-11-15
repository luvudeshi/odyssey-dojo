// Issues #115 and #127: three made-up players fight every stop 200 times each, with a fixed seed.
// The tables in docs/balance.md come from this run. To rewrite them after a retune:
//   UPDATE_BALANCE=1 npx vitest run tests/balance
import { readFileSync, writeFileSync } from "node:fs";
import { env } from "node:process";
import { expect, test, vi } from "vitest";

// 3,600 simulated fights take about 1.5 s alone and far longer when other agents load the machine.
vi.setConfig({ testTimeout: 60_000 });
import { ENEMIES } from "../../src/enemies/registry";
import { STYLES } from "../../src/styles/registry";
import { FIGHTS, measureRoute, PLAYERS, type Row, table } from "./simulate";

const DOC = "docs/balance.md";

function boxer() {
  const style = STYLES.find((candidate) => candidate.id === "boxer");
  if (!style) throw new Error("the Boxer style is missing");
  return style;
}

let route: Row[] | undefined;
const rows = (): Row[] => (route ??= measureRoute(ENEMIES, boxer()));
const row = (stop: string, player: string): Row => {
  const found = rows().find((candidate) => candidate.stop === stop && candidate.player === player);
  if (!found) throw new Error(`no fights for ${player} at ${stop}`);
  return found;
};

/** Puts `body` between the `<!-- name -->` and `<!-- /name -->` lines of the document. */
function withBlock(doc: string, name: string, body: string): string {
  const open = `<!-- ${name} -->`;
  const close = `<!-- /${name} -->`;
  const from = doc.indexOf(open);
  const to = doc.indexOf(close);
  if (from < 0 || to < from) throw new Error(`${DOC} has no ${open} block`);
  return `${doc.slice(0, from + open.length)}\n${body}\n${doc.slice(to)}`;
}

test("docs/balance.md shows the numbers this simulation gives", () => {
  const now = table(ENEMIES, rows());
  const doc = readFileSync(DOC, "utf8").replaceAll("\r\n", "\n");
  const fresh = withBlock(doc, "table:now", now);
  if (env.UPDATE_BALANCE) writeFileSync(DOC, fresh);
  else expect(doc, "run UPDATE_BALANCE=1 npx vitest run tests/balance to rewrite the tables").toBe(fresh);
});

test("every fight is played 200 times and none hangs", () => {
  expect(rows().length).toBe(ENEMIES.length * PLAYERS.length);
  for (const measured of rows()) {
    expect(measured.fights).toBe(FIGHTS);
    expect(measured.longest, `${measured.stop}/${measured.player}: longest fight`).toBeLessThan(300);
  }
});

test("no stop takes the average player more than two minutes", () => {
  for (const enemy of ENEMIES) {
    const fight = row(enemy.id, "average");
    // If this fails after a retune, lower `hp` in that stop's file: fight length follows it.
    expect(fight.seconds, `${enemy.id}: ${fight.seconds.toFixed(0)} s`).toBeLessThanOrEqual(120);
    expect(fight.winSeconds, `${enemy.id}: ${fight.winSeconds.toFixed(0)} s when won`).toBeLessThanOrEqual(120);
  }
});

test("the route gets harder stop by stop for every player", () => {
  for (const player of PLAYERS) {
    ENEMIES.forEach((enemy, index) => {
      const before = ENEMIES[index - 1];
      if (!before) return;
      const here = row(enemy.id, player.id);
      const there = row(before.id, player.id);
      const where = `${player.id}: ${enemy.id} after ${before.id}`;
      expect(here.wins, `${where}, fights won`).toBeLessThanOrEqual(there.wins);
      expect(here.hpLeft, `${where}, health left`).toBeLessThanOrEqual(there.hpLeft);
      // The beginner ends most fights at zero, so only the other two can show a clear step down.
      // The good player's step was 0.5 until part 3 of issue #127 (ruled by the lead there): a route a beginner
      // wins 15% of at every stop costs the good player under 4 health, so five steps of half a point do not fit.
      if (player.id === "average") expect(here.hpLeft, `${where}, health left`).toBeLessThan(there.hpLeft - 0.5);
      if (player.id === "good") expect(here.hpLeft, `${where}, health left`).toBeLessThan(there.hpLeft - 0.1);
    });
  }
});

test("the good player wins everywhere", () => {
  for (const enemy of ENEMIES) expect(row(enemy.id, "good").wins, enemy.id).toBeGreaterThanOrEqual(FIGHTS * 0.95);
});

// Issue #127: the first fight is often the only one a new player gets, so it is tuned to be won.
// If one of these fails after a retune, docs/balance.md says which way `hp` and `damage` in polyphemus.ts move each number.
test("Polyphemus: the beginner wins at least 85% of fights, and those wins take 95 seconds or less", () => {
  const beginner = row("polyphemus", "beginner");
  expect(beginner.wins, "beginner, fights won").toBeGreaterThanOrEqual(FIGHTS * 0.85);
  expect(beginner.winSeconds, `beginner, fights won: ${beginner.winSeconds.toFixed(1)} s`).toBeLessThanOrEqual(95); // was 90 before the 3 s pause after a phase change (+4.6 s over two phase changes)
});

test("Polyphemus: the average player always wins", () => {
  expect(row("polyphemus", "average").wins).toBe(FIGHTS);
});

test("Polyphemus: the good player's fight still lasts at least 30 seconds", () => {
  const good = row("polyphemus", "good");
  // If this fails, raise `hp` and lower `damage` together: health alone would push the beginner's wins past 90 s.
  expect(good.seconds, `good: ${good.seconds.toFixed(1)} s`).toBeGreaterThanOrEqual(30);
});

test("Polyphemus: every fight a beginner wins goes through all three phases", () => {
  const enemy = ENEMIES.find((candidate) => candidate.id === "polyphemus");
  expect(enemy?.phases?.length).toBe(3);
  // A phase counts as seen when the player had to defend at least one attack in it.
  for (const player of PLAYERS) expect(row("polyphemus", player.id).fewestPhasesInAWin, player.id).toBe(3);
});

// Issue #127, part 2: the five stops after Polyphemus. docs/balance.md says how each stop's numbers were chosen.
test("the average player wins at least 60% of fights at every stop", () => {
  for (const enemy of ENEMIES) {
    const fight = row(enemy.id, "average");
    // If this fails after a retune, lower `damage` in that stop's file: damage sets who wins.
    expect(fight.wins, `${enemy.id}: ${String(fight.wins)} of ${String(FIGHTS)}`).toBeGreaterThanOrEqual(FIGHTS * 0.6);
  }
});

test("from Circe on, no stop is easier for the beginner than the one before, and the last is harder than Circe", () => {
  const later = ENEMIES.filter((enemy) => enemy.id !== "polyphemus");
  expect(later[0]?.id).toBe("circe");
  later.forEach((enemy, index) => {
    const before = later[index - 1];
    if (!before) return;
    const here = row(enemy.id, "beginner").wins;
    const there = row(before.id, "beginner").wins;
    expect(here, `${enemy.id} (${String(here)}) after ${before.id} (${String(there)})`).toBeLessThanOrEqual(there);
  });
  const first = later[0];
  const last = later.at(-1);
  if (!first || !last) throw new Error("no stops after Polyphemus");
  expect(row(last.id, "beginner").wins).toBeLessThan(row(first.id, "beginner").wins);
  // The first stop is the one tuned for the beginner: every later stop is far harder for them.
  expect(row(first.id, "beginner").wins).toBeLessThan(row("polyphemus", "beginner").wins);
});

// Issue #127, part 3: the beginner is not shut out after the first stop. Measured without the warm-up.
// If one of these fails after a retune, lower `damage` (or `hp`) in that stop's file: docs/balance.md says what each does.
test("the beginner wins Circe at least 35% of the time", () => {
  const circe = row("circe", "beginner");
  expect(circe.wins, `circe: ${String(circe.wins)} of ${String(FIGHTS)}`).toBeGreaterThanOrEqual(FIGHTS * 0.35);
});

test("the beginner wins at least 15% of fights at every stop", () => {
  for (const enemy of ENEMIES) {
    const fight = row(enemy.id, "beginner");
    expect(fight.wins, `${enemy.id}: ${String(fight.wins)} of ${String(FIGHTS)}`).toBeGreaterThanOrEqual(FIGHTS * 0.15);
  }
});

// So the route cannot drift into having no bite: the last stop stays the one a beginner usually loses.
test("the beginner wins at least 15% and at most 35% of fights at the Suitors", () => {
  const suitors = row("suitors", "beginner");
  expect(suitors.wins, `suitors: ${String(suitors.wins)} of ${String(FIGHTS)}`).toBeGreaterThanOrEqual(FIGHTS * 0.15);
  expect(suitors.wins, `suitors: ${String(suitors.wins)} of ${String(FIGHTS)}`).toBeLessThanOrEqual(FIGHTS * 0.35);
});

test("from Circe on, the good player's fight still lasts at least 40 seconds", () => {
  for (const enemy of ENEMIES) {
    if (enemy.id === "polyphemus") continue;
    const good = row(enemy.id, "good");
    // If this fails, raise `hp` in that stop's file and lower its `damage` to keep the beginner's wins.
    expect(good.seconds, `${enemy.id}: ${good.seconds.toFixed(1)} s`).toBeGreaterThanOrEqual(40);
  }
});
