// Issue #115: three made-up players fight every stop 200 times each, with a fixed seed.
// The tables in docs/balance.md come from this run. To rewrite them after a retune:
//   UPDATE_BALANCE=1 npx vitest run tests/balance
import { readFileSync, writeFileSync } from "node:fs";
import { env } from "node:process";
import { expect, test } from "vitest";
import type { EnemyAttack, EnemySpec } from "../../src/core/types";
import { ENEMIES } from "../../src/enemies/registry";
import { STYLES } from "../../src/styles/registry";
import { FIGHTS, measure, measureRoute, PLAYERS, type Player, type Row, table } from "./simulate";

const DOC = "docs/balance.md";

function boxer() {
  const style = STYLES.find((candidate) => candidate.id === "boxer");
  if (!style) throw new Error("the Boxer style is missing");
  return style;
}

function polyphemus(): EnemySpec {
  const enemy = ENEMIES.find((candidate) => candidate.id === "polyphemus");
  if (!enemy) throw new Error("Polyphemus is missing");
  return enemy;
}

/**
 * The Polyphemus that meets #115, which tests/content.test.ts does not allow today (see NEEDS in docs/balance.md):
 * less than half the health, and attacks that hurt a little less.
 */
const PROPOSED_HP = 160;
const PROPOSED_DAMAGE: Readonly<Record<string, number>> = { club_left: 6, club_right: 6, grab: 6, boulder: 7 };

function proposedPolyphemus(): EnemySpec {
  const now = polyphemus();
  const softer = (attack: EnemyAttack): EnemyAttack => ({ ...attack, damage: PROPOSED_DAMAGE[attack.id] ?? attack.damage });
  const [first, ...rest] = now.attacks;
  return { ...now, hp: PROPOSED_HP, attacks: [softer(first), ...rest.map(softer)] };
}

/** The player tests/content.test.ts pins to 90 to 150 seconds on Polyphemus, at its best strike quality. */
const PINNED: Player = { id: "pinned", label: "85% of prompts right, perfect strikes", defend: 0.85, land: 0.85, reactMs: 800, quality: 1 };

let route: Row[] | undefined;
const rows = (): Row[] => (route ??= measureRoute(ENEMIES, boxer()));
const row = (stop: string, player: string): Row => {
  const found = rows().find((candidate) => candidate.stop === stop && candidate.player === player);
  if (!found) throw new Error(`no fights for ${player} at ${stop}`);
  return found;
};

let proposal: Row[] | undefined;
const proposed = (): Row[] => (proposal ??= [...PLAYERS, PINNED].map((player) => measure(proposedPolyphemus(), boxer(), player)));

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
  const after = table([proposedPolyphemus()], proposed(), [...PLAYERS, PINNED]);
  const doc = readFileSync(DOC, "utf8").replaceAll("\r\n", "\n");
  const fresh = withBlock(withBlock(doc, "table:now", now), "table:proposed", after);
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
      // The beginner ends nearly every fight at zero, so only the other two can show a clear step down.
      if (player.id !== "beginner") expect(here.hpLeft, `${where}, health left`).toBeLessThan(there.hpLeft - 0.5);
    });
  }
});

test("the good player wins everywhere, and the average player wins the first stop most of the time", () => {
  for (const enemy of ENEMIES) expect(row(enemy.id, "good").wins, enemy.id).toBeGreaterThanOrEqual(FIGHTS * 0.95);
  expect(row("polyphemus", "average").wins).toBeGreaterThanOrEqual(FIGHTS * 0.75);
});

test("the proposed Polyphemus: the beginner wins most fights in under 90 seconds, which the 90 second floor forbids", () => {
  const of = (id: string): Row => {
    const found = proposed().find((candidate) => candidate.player === id);
    if (!found) throw new Error(`no fights for ${id}`);
    return found;
  };
  const beginner = of("beginner");
  expect(beginner.wins, "beginner wins").toBeGreaterThanOrEqual(FIGHTS * 0.6);
  expect(beginner.seconds, "beginner, all fights").toBeLessThan(90);
  expect(beginner.winSeconds, "beginner, fights won").toBeLessThan(90);
  expect(of("average").wins).toBe(FIGHTS);
  // Still the easiest stop on the route for everyone.
  for (const player of PLAYERS) expect(of(player.id).hpLeft, player.id).toBeGreaterThan(row("circe", player.id).hpLeft);
  // The conflict: the player tests/content.test.ts holds to 90 s or more is done in about half that.
  expect(of("pinned").seconds).toBeLessThan(90);
});
