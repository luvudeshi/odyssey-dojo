// Guards the real-life situation each enemy attack stands for: every attack has a line, short and matching docs/situations.md.
import { expect, test } from "vitest";
import situationsDoc from "../docs/situations.md?raw";
import { ENEMIES } from "../src/enemies/registry";
import { SITUATION_MAX_LENGTH, SITUATIONS, situationFor } from "../src/enemies/situations";

/** The table rows under one enemy's heading in docs/situations.md. */
function docRowsFor(enemyId: string): string[] {
  const sections = situationsDoc.split(/^## /m);
  const section = sections.find((candidate) => (candidate.split("\n")[0] ?? "").includes(`(\`${enemyId}\`)`));
  return section === undefined ? [] : section.split("\n").filter((row) => row.startsWith("| "));
}

test("every attack of every enemy has a situation line of 1 to 60 characters", () => {
  expect(ENEMIES.length).toBeGreaterThan(0);
  expect(SITUATION_MAX_LENGTH).toBe(60);
  for (const enemy of ENEMIES) {
    for (const attack of enemy.attacks) {
      const line = situationFor(enemy.id, attack.id);
      const where = `${enemy.id}/${attack.id}`;
      expect(line, where).not.toBeNull();
      expect((line ?? "").trim().length, where).toBeGreaterThanOrEqual(1);
      expect((line ?? "").length, where).toBeLessThanOrEqual(SITUATION_MAX_LENGTH);
      expect(line, where).toBe((line ?? "").trim());
    }
  }
});

test("no situation line is left over for an enemy or an attack that does not exist", () => {
  const known = new Map(ENEMIES.map((enemy) => [enemy.id, new Set(enemy.attacks.map((attack) => attack.id))]));
  for (const [enemyId, lines] of Object.entries(SITUATIONS)) {
    expect(known.has(enemyId), enemyId).toBe(true);
    for (const attackId of Object.keys(lines)) {
      expect(known.get(enemyId)?.has(attackId), `${enemyId}/${attackId}`).toBe(true);
    }
  }
});

test("docs/situations.md lists every attack with its counter, the same line and a source link", () => {
  for (const enemy of ENEMIES) {
    const rows = docRowsFor(enemy.id);
    for (const attack of enemy.attacks) {
      const where = `${enemy.id}/${attack.id}`;
      const row = rows.find((candidate) => candidate.includes(`(\`${attack.id}\`) |`));
      expect(row, where).toBeDefined();
      expect(row, where).toContain(`| \`${attack.counter}\` | ${situationFor(enemy.id, attack.id) ?? ""} | [`);
    }
  }
});

test("docs/situations.md has no row for an attack that does not exist", () => {
  for (const enemy of ENEMIES) {
    const ids = new Set(enemy.attacks.map((attack) => attack.id));
    const attackRows = docRowsFor(enemy.id).filter((row) => /\(`[a-z_]+`\) \|/.test(row));
    expect(attackRows.length, enemy.id).toBe(ids.size);
  }
});

test("an unknown enemy or attack gives null and never throws", () => {
  const first = ENEMIES[0];
  expect(first).toBeDefined();
  expect(situationFor("nobody", "grab")).toBeNull();
  expect(situationFor(first?.id ?? "", "no_such_attack")).toBeNull();
  expect(situationFor("", "")).toBeNull();
  expect(situationFor("constructor", "name")).toBeNull();
  expect(situationFor(first?.id ?? "", "toString")).toBeNull();
  expect(situationFor("__proto__", "__proto__")).toBeNull();
});

test("situation lines stay calm: no graphic or frightening words", () => {
  const harsh = /\b(kill|stab|knife|gun|blood|weapon|choke|strangle|murder|die|dead|attacker|assault)\w*\b/i;
  for (const lines of Object.values(SITUATIONS)) {
    for (const [attackId, line] of Object.entries(lines)) expect(line, attackId).not.toMatch(harsh);
  }
});
