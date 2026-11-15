// Guards docs/audio-levels.md and the rules the clip levelling tool works by. Needs no ffmpeg: the tool itself is not run here.
import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";
import type { Measure } from "../server/tools/levelRules";
import {
  ATHENA_TARGET_LUFS, CALL_LEAD_MS, DOC_END, DOC_START, faults, formatTables, groupOf, isMoveCall, listedClips,
  MAX_LIMIT_DB, median, outOfLine, PEAK_CEILING_DBTP, planFix, playbackDb, refine, STORY_TARGET_LUFS, targetFor, withTables,
} from "../server/tools/levelRules";

const DOC = "docs/audio-levels.md";
const RERUN = "run `npx tsx server/tools/levelClips.ts --write` (needs ffmpeg), or add its row by hand as docs/audio-levels.md says";

/** A clip that is within tolerance unless a test says otherwise. */
function clip(path: string, changes: Partial<Measure> = {}): Measure {
  return { path, seconds: 2, lufs: targetFor(path) ?? -20, truePeak: -3, leadMs: 25, tailMs: 100, playDb: 0, ...changes };
}

test("every clip under public/audio has a row in the doc", () => {
  const files = readdirSync("public/audio", { recursive: true, encoding: "utf8" });
  const clips = files.map((file) => file.split("\\").join("/")).filter((file) => file.endsWith(".mp3"));
  const listed = new Set(listedClips(readFileSync(DOC, "utf8")).map((row) => row.path));
  expect(clips.length).toBeGreaterThan(100);
  expect(clips.filter((path) => !listed.has(path)), `clips with no row in ${DOC}: ${RERUN}`).toEqual([]);
});

test("every voice clip the doc lists is within tolerance", () => {
  const rows = listedClips(readFileSync(DOC, "utf8"));
  const bad = rows.filter((row) => faults(row).length > 0).map((row) => `${row.path}: ${faults(row).join("; ")}`);
  expect(bad, RERUN).toEqual([]);
  // The doc really was read as numbers: Athena's lines are near her target.
  const athena = rows.filter((row) => groupOf(row.path) === "athena").map((row) => row.lufs);
  expect(athena.length).toBeGreaterThan(30);
  expect(Math.abs(median(athena) - ATHENA_TARGET_LUFS)).toBeLessThan(1);
});

test("Athena's own lines and the story lines have their own targets, and nothing else is voice", () => {
  expect(targetFor("athena/call_jab.mp3")).toBe(ATHENA_TARGET_LUFS);
  expect(targetFor("athena/phase_3.mp3")).toBe(ATHENA_TARGET_LUFS);
  // Homer's first lines and Polyphemus's taunts were recorded into Athena's folder.
  expect(targetFor("athena/homer_title.mp3")).toBe(STORY_TARGET_LUFS);
  expect(targetFor("athena/taunt_polyphemus_1.mp3")).toBe(STORY_TARGET_LUFS);
  expect(targetFor("narration/homer_before_circe.mp3")).toBe(STORY_TARGET_LUFS);
  expect(targetFor("taunts/taunt_circe_1.mp3")).toBe(STORY_TARGET_LUFS);
  for (const path of ["sfx/won.mp3", "music/fight.mp3", "stops/circe/ambience.mp3", "stops/circe/wand.mp3"]) expect(targetFor(path), path).toBeNull();
  expect(isMoveCall("athena/call_kick.mp3")).toBe(true);
  expect(isMoveCall("athena/praise_1.mp3")).toBe(false);
  expect(isMoveCall("taunts/call_me.mp3")).toBe(false);
});

test("a voice clip is out of tolerance past 1.5 LU, above -1 dBTP, or as a call that starts late", () => {
  const call = "athena/call_jab.mp3";
  expect(faults(clip(call))).toEqual([]);
  expect(faults(clip(call, { lufs: ATHENA_TARGET_LUFS + 1.5 }))).toEqual([]);
  expect(faults(clip(call, { lufs: ATHENA_TARGET_LUFS + 1.6 }))).toEqual(["+1.6 LU from -15.5 LUFS"]);
  expect(faults(clip(call, { lufs: ATHENA_TARGET_LUFS - 1.6 }))).toEqual(["-1.6 LU from -15.5 LUFS"]);
  expect(faults(clip(call, { truePeak: -1 }))).toEqual([]);
  expect(faults(clip(call, { truePeak: -0.9 }))).toEqual(["peak -0.9 dBTP"]);
  expect(faults(clip(call, { leadMs: 60 }))).toEqual([]);
  expect(faults(clip(call, { leadMs: 61 }))).toEqual(["61 ms of silence before the call"]);
  // Only a call must start at once: Homer may take a breath.
  expect(faults(clip("narration/homer_before_circe.mp3", { leadMs: 300 }))).toEqual([]);
  expect(faults(clip("narration/homer_before_circe.mp3", { lufs: -22.2 }))).toEqual(["-3.2 LU from -19.0 LUFS"]);
  // Effects, stop sounds and music are never judged, so the tool never rewrites them.
  for (const path of ["sfx/opening.mp3", "music/menu.mp3", "stops/scylla/snap.mp3"]) {
    const loud = clip(path, { lufs: -5, truePeak: 0, leadMs: 400 });
    expect(faults(loud), path).toEqual([]);
    expect(planFix(loud), path).toBeNull();
  }
  // A row added by hand has no numbers and is not judged either.
  expect(faults(clip(call, { lufs: Number.NaN, truePeak: Number.NaN, leadMs: Number.NaN }))).toEqual([]);
});

test("a clip within tolerance is left alone, and one gain fixes a clip whose peak has room", () => {
  expect(planFix(clip("athena/call_jab.mp3", { lufs: -16.4, truePeak: -1.1, leadMs: 48 }))).toBeNull();
  const quiet = planFix(clip("athena/praise_1.mp3", { lufs: -18, truePeak: -6 }));
  expect(quiet).toEqual({ trimSeconds: 0, gainDb: 2.5, limitDb: null, aimLufs: ATHENA_TARGET_LUFS });
  const loud = planFix(clip("athena/call_block.mp3", { lufs: -12.7, truePeak: -0.7 }));
  expect(loud?.limitDb).toBeNull();
  expect(loud?.gainDb).toBeCloseTo(-2.8);
});

test("a hot peak is first met with plain gain, and the limiter is used only when that would leave the clip too quiet", () => {
  // In tolerance for loudness, hot at the peak: turned down just far enough, no limiter.
  const hot = planFix(clip("athena/call_hook.mp3", { lufs: -15.3, truePeak: -0.9 }));
  expect(hot?.limitDb).toBeNull();
  expect(hot?.gainDb).toBeCloseTo(-0.6);
  // Already quiet and hot at the peak: turning it down would leave it 2.7 LU under, so it is raised through the limiter.
  const thin = planFix(clip("athena/call_swift_dash.mp3", { lufs: -17.1, truePeak: -0.4 }));
  expect(thin?.limitDb).toBe(PEAK_CEILING_DBTP);
  expect(thin?.gainDb).toBeCloseTo(1.6);
  expect(thin?.aimLufs).toBeCloseTo(ATHENA_TARGET_LUFS);
  // The limiter never takes more than 3 dB: a clip that would need more is raised as far as that allows.
  const tall = planFix(clip("narration/homer_after_scylla.mp3", { lufs: -26, truePeak: -2 }));
  expect(tall?.gainDb).toBeCloseTo(PEAK_CEILING_DBTP + 2 + MAX_LIMIT_DB);
  expect(tall?.aimLufs).toBeCloseTo(-22.5);
});

test("a late call is cut back to 30 ms of lead, and only a call is", () => {
  expect(planFix(clip("athena/call_kick.mp3", { leadMs: 180 }))?.trimSeconds).toBeCloseTo((180 - CALL_LEAD_MS) / 1000);
  expect(planFix(clip("athena/loss.mp3", { leadMs: 180 }))).toBeNull();
  expect(planFix(clip("athena/loss.mp3", { leadMs: 180, lufs: -19.4 }))?.trimSeconds).toBe(0);
});

test("after a try the gain is corrected for what the encoder did, and it stops once the clip has landed", () => {
  const source = clip("athena/praise_1.mp3", { lufs: -18, truePeak: -6 });
  const fix = planFix(source);
  if (!fix) throw new Error("expected a fix");
  // The encoder took half a dB off: ask for that much more.
  const again = refine(fix, source, clip(source.path, { lufs: -16, truePeak: -4 }));
  expect(again?.gainDb).toBeCloseTo(3);
  expect(again?.limitDb).toBeNull();
  expect(refine(fix, source, clip(source.path, { lufs: -15.5, truePeak: -3.5 }))).toBeNull();
  // Plain gain never goes past the peak ceiling to reach the loudness.
  const capped = refine(fix, source, clip(source.path, { lufs: -16.5, truePeak: -1.8 }));
  expect(capped?.gainDb).toBeCloseTo(fix.gainDb + 0.25);
  // Over the ceiling: back down, even though the clip is still short of its loudness.
  const over = refine(fix, source, clip(source.path, { lufs: -16, truePeak: -1.2 }));
  expect(over?.gainDb).toBeLessThan(fix.gainDb);
});

test("with the limiter, a peak over the ceiling lowers the limit and the gain never asks for more than 3 dB of limiting", () => {
  const source = clip("narration/homer_after_suitors.mp3", { lufs: -23.7, truePeak: -3.7 });
  const fix = planFix(source);
  if (!fix) throw new Error("expected a fix");
  expect(fix.limitDb).toBe(PEAK_CEILING_DBTP);
  const next = refine(fix, source, clip(source.path, { lufs: -19.6, truePeak: -1.3 }));
  expect(next?.limitDb).toBeLessThan(PEAK_CEILING_DBTP);
  expect((next?.gainDb ?? 99) + source.truePeak - (next?.limitDb ?? 0)).toBeLessThanOrEqual(MAX_LIMIT_DB + 1e-9);
  expect(refine(fix, source, clip(source.path, { lufs: -19, truePeak: -1.5 }))).toBeNull();
});

test("playback gain follows the audio code: voice as it is, effects through their level and the master, stops and music levelled first", () => {
  expect(playbackDb("athena/call_jab.mp3", 0.1, 0.9)).toBeCloseTo(0);
  expect(playbackDb("narration/homer_before_circe.mp3", 0.1, 0.9)).toBeCloseTo(0);
  // A taunt is spoken at 0.7 of the voice volume, wherever its clip lives.
  expect(playbackDb("taunts/taunt_circe_1.mp3", 0.1, 0.9)).toBeCloseTo(20 * Math.log10(0.7));
  expect(playbackDb("athena/taunt_polyphemus_1.mp3", 0.1, 0.9)).toBeCloseTo(20 * Math.log10(0.7));
  expect(playbackDb("sfx/enemyHit.mp3", 0.1, 0.9)).toBeCloseTo(20 * Math.log10(0.5));
  expect(playbackDb("sfx/opening.mp3", 0.1, 0.9)).toBeCloseTo(20 * Math.log10(0.25));
  // A stop event is brought to RMS 0.12 and then halved, unless its peak would pass 0.9.
  expect(playbackDb("stops/circe/wand.mp3", 0.06, 0.3)).toBeCloseTo(20 * Math.log10(2 * 0.5));
  expect(playbackDb("stops/circe/wand.mp3", 0.06, 0.9)).toBeCloseTo(20 * Math.log10(0.5));
  expect(playbackDb("stops/circe/ambience.mp3", 0.08, 0.5)).toBeCloseTo(20 * Math.log10(0.16 * 0.7));
  expect(playbackDb("music/fight.mp3", 0.16, 0.9)).toBeCloseTo(20 * Math.log10(0.16 * 0.7));
  // A near-silent music clip is raised twelve times at most.
  expect(playbackDb("music/menu.mp3", 0.001, 0.01)).toBeCloseTo(20 * Math.log10(12 * 0.16 * 0.7));
});

test("the median, the groups and the out-of-line list", () => {
  expect(median([3, 1, 2])).toBe(2);
  expect(median([4, 1, 3, 2])).toBe(2.5);
  expect(median([])).toBeNaN();
  expect(groupOf("athena/win.mp3")).toBe("athena");
  expect(groupOf("athena/homer_win.mp3")).toBe("athena (Homer)");
  expect(groupOf("athena/taunt_polyphemus_2.mp3")).toBe("athena (Polyphemus)");
  expect(groupOf("stops/circe/ambience.mp3")).toBe("stops (ambience)");
  expect(groupOf("stops/circe/wand.mp3")).toBe("stops (events)");
  const clips = [
    clip("sfx/a.mp3", { lufs: -20 }), clip("sfx/b.mp3", { lufs: -20 }), clip("sfx/quiet.mp3", { lufs: -23.1 }),
    clip("sfx/late.mp3", { lufs: -20, leadMs: 151 }), clip("athena/call_jab.mp3", { truePeak: -0.5 }), clip("music/menu.mp3", { leadMs: 900 }),
  ];
  expect(outOfLine(clips)).toEqual([
    "- `sfx/quiet.mp3`: -3.1 LU from the median of sfx at the listener",
    "- `sfx/late.mp3`: 151 ms of silence before the sound",
    "- `athena/call_jab.mp3`: peak -0.5 dBTP",
  ]);
});

test("the tables the tool writes are read back as the same clips, and only the measured part of the doc is replaced", () => {
  const clips = [clip("athena/call_jab.mp3", { lufs: -15.8, truePeak: -1.6, leadMs: 26.4, seconds: 1.92 }), clip("sfx/won.mp3", { lufs: -15.5, playDb: -7.4 })];
  const doc = withTables(`# Title\n\n| \`not/a-row.mp3\` | 1 |\n\n${DOC_START}\nold\n${DOC_END}\n\nAfter.\n`, formatTables(clips));
  expect(doc).not.toBeNull();
  expect(doc).toContain("# Title");
  expect(doc).toContain("After.");
  expect(doc).not.toContain("old");
  const rows = listedClips(doc ?? "");
  expect(rows.map((row) => row.path)).toEqual(["athena/call_jab.mp3", "sfx/won.mp3"]);
  expect(rows[0]).toEqual({ path: "athena/call_jab.mp3", seconds: 1.92, lufs: -15.8, truePeak: -1.6, leadMs: 26, tailMs: 100, playDb: 0 });
  expect(rows[1]?.playDb).toBe(-7.4);
  // A row added by hand, with dashes, still counts as listed.
  const byHand = listedClips(`${DOC_START}\n| \`athena/call_new.mp3\` | - | - | - | - | - | - | - |\n${DOC_END}`);
  expect(byHand.map((row) => row.path)).toEqual(["athena/call_new.mp3"]);
  expect(faults(byHand[0] ?? clip("athena/x.mp3", { lufs: 0 }))).toEqual([]);
  expect(withTables("no markers here", "x")).toBeNull();
});
