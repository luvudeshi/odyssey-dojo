// The hook-ups between the modules and the screens: a feature that is built but mounted nowhere, or one a restyle
// dropped, fails here. tests/hookups.test.ts checks the narration functions; this file checks the screens that call
// them and the other modules (issue #179, review of #144 item 5).
//
// Three lists:
//   - rendered: the real screen is drawn (to markup) and the piece is looked for in what the player would see;
//   - WIRED: screens that need WebGL, a camera or effects to run are read as text: the file must import the symbol
//     from its module and use it outside comments;
//   - NOT_WIRED: built, tested, and mounted nowhere yet. Each row names what will mount it. When one is mounted its
//     test fails and says to move the row to WIRED, so this list cannot go stale.
import { readFileSync, readdirSync } from "node:fs";
import { createElement } from "react";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import { startFight } from "../src/combat/engine";
import type { CombatPhase, EnemySpec } from "../src/core/types";
import { endingFor } from "../src/enemies/endings";
import { FINISHER_LINES, GENERAL_FINISHER_LINE, finisherLine } from "../src/enemies/finishers";
import { ENEMIES } from "../src/enemies/registry";
import { situationFor } from "../src/enemies/situations";
import { SkyHud } from "../src/hud/sky/SkyHud";
import { EndPanel } from "../src/screens/EndScreen";
import { MainMenu } from "../src/screens/MainMenu";
import { Multiplayer } from "../src/screens/Multiplayer";

// Stand-ins that only say they were mounted: the real ones ask the server as soon as they are on the page.
vi.mock("../src/facetime/ui/FaceTimeCard", () => ({ FaceTimeCard: () => createElement("i", null, "[facetime card]") }));
vi.mock("../src/screens/RoomHost", () => ({ RoomHost: () => createElement("i", null, "[room host]") }));
// The end panel puts its painting on document.body; drawn to markup, the painting stays where it is written.
vi.mock("react-dom", async (original) => ({ ...(await original<typeof import("react-dom")>()), createPortal: (children: ReactNode) => children }));

afterEach(() => { vi.unstubAllGlobals(); });

/** What a player reads: the markup without its tags, with the escaped characters put back. */
const words = (html: string): string => html
  .replace(/<[^>]*>/g, " ")
  .replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
  .replace(/\s+/g, " ");

const nothing = (): void => undefined;

// ---------------------------------------------------------------------------------------------------- rendered

describe("rendered: the piece is on the screen", () => {
  const enemy: EnemySpec = ENEMIES.find((each) => each.id === "circe") ?? (() => { throw new Error("no circe"); })();
  const hud = (phase: CombatPhase): string => words(renderToStaticMarkup(createElement(SkyHud, { enemy, state: { ...startFight(enemy, 1), phase } })));

  test("the defend card of the fight's HUD carries the attack's situation line (src/enemies/situations)", () => {
    const attack = enemy.attacks.find((each) => situationFor(enemy.id, each.id) !== null);
    if (!attack) throw new Error("circe has no attack with a situation line");
    const line = situationFor(enemy.id, attack.id) ?? "";
    expect(line).not.toBe("");
    expect(hud({ kind: "defend", attack, msLeft: 500, totalMs: 1000 })).toContain(line);
  });

  test("the finish card carries the stop's own finisher line (src/enemies/finishers)", () => {
    // Circe's line differs from the general one, so a card that stopped asking would show the wrong words.
    expect(FINISHER_LINES[enemy.id]).not.toBe(GENERAL_FINISHER_LINE);
    expect(hud({ kind: "finisher", move: "hook", msLeft: 500, totalMs: 1000 })).toContain(finisherLine(enemy.id));
  });

  const endPanel = (won: boolean, card: boolean): string => {
    vi.stubGlobal("document", { body: {} });
    return words(renderToStaticMarkup(createElement(EndPanel, {
      won,
      enemyId: enemy.id,
      mastery: {},
      defense: { attacksSeen: 4, attacksDefended: 3 },
      onShown: nothing,
      onRetry: nothing,
      onMap: nothing,
      onStyle: nothing,
      ...(card ? { card: () => null } : {}),
    })));
  };

  test("the end panel shows the stop's ending and its lesson (src/enemies/endings)", () => {
    const ending = endingFor(enemy.id);
    expect(endPanel(true, false)).toContain(ending.win);
    expect(endPanel(true, false)).toContain(ending.lesson);
    expect(endPanel(false, false)).toContain(ending.loss);
  });

  test("the end panel shows what the fight's attacks came to (the `defense` the app makes with lessonsFrom)", () => {
    expect(endPanel(true, false)).toContain("Defended 3 of 4 attacks");
  });

  test("the end panel offers the hero card when the app hands it one", () => {
    expect(endPanel(true, true)).toContain("Your hero card");
    expect(endPanel(true, false)).not.toContain("Your hero card");
  });

  test("the main menu has the four doors: Story mode, Multiplayer, Training Dojo, Account", () => {
    const html = words(renderToStaticMarkup(createElement(MainMenu, {
      name: "", notice: "", problem: "", onStory: nothing, onCamera: nothing, onKeyboard: nothing, onMultiplayer: nothing, onTraining: nothing, onAccount: nothing,
    })));
    for (const door of ["Story mode", "Multiplayer", "Training Dojo", "Account"]) expect(html, door).toContain(door);
  });

  /** The Multiplayer screen in a tab whose sessionStorage holds `kept`. */
  const multiplayer = (hosting: boolean, kept: Readonly<Record<string, string>> = {}): string => {
    vi.stubGlobal("window", {
      isSecureContext: true,
      matchMedia: () => ({ matches: false }),
      sessionStorage: { getItem: (key: string) => kept[key] ?? null, setItem: nothing, removeItem: nothing },
    });
    return renderToStaticMarkup(createElement(Multiplayer, { hosting, code: "", onOpen: nothing, onStart: nothing, onSolo: nothing, onClose: nothing, onJoined: nothing, onBack: nothing }));
  };

  test("Multiplayer has the Host card, the Join card with its code box, and the FaceTime card", () => {
    const html = multiplayer(false);
    expect(words(html)).toContain("Open a room");
    expect(html).toContain('id="room-code"');
    expect(words(html)).toContain("[facetime card]");
    expect(words(html)).not.toContain("[room host]");
  });

  test("Multiplayer becomes the room once a room is opened", () => {
    const html = words(multiplayer(true));
    expect(html).toContain("[room host]");
    expect(html).not.toContain("Open a room");
  });

  test("the Join card takes back a seat this tab still holds (keptRoom in src/screens/seatStore)", () => {
    expect(multiplayer(false)).toMatch(/id="room-code"[^>]*value=""/);
    const html = multiplayer(false, { "odyssey.room.seat": JSON.stringify({ code: "KXTR", token: "t" }) });
    expect(html).toMatch(/id="room-code"[^>]*value="KXTR"/);
  });
});

// ---------------------------------------------------------------------------------------------- read as text

/** A source file under src/, without its comments, so a mount that was commented out does not count. */
function code(file: string): string {
  return readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1");
}

const IMPORT = /import\s+(?:type\s+)?[^;]*?from\s*"[^"]+";?/g;
const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** True when `file` imports `symbol` by name from `from`. */
function imports(file: string, symbol: string, from: string): boolean {
  return new RegExp(`import\\s*\\{[^}]*\\b${escaped(symbol)}\\b[^}]*\\}\\s*from\\s*"${escaped(from)}"`).test(code(file));
}

interface Wired {
  /** What the player gets. */
  readonly feature: string;
  /** The screen, under src/. */
  readonly file: string;
  readonly symbol: string;
  /** The module path as the screen writes it. */
  readonly from: string;
  /** Every one of these must be in the screen's code, outside its imports and comments. */
  readonly uses: readonly string[];
}

/** Wired on main today, in screens that cannot be drawn in a test (WebGL, the camera, effects). */
const WIRED: readonly Wired[] = [
  { feature: "Training Dojo opens from the title", file: "App.tsx", symbol: "Dojo", from: "./coach/ui/Dojo", uses: ["<Dojo", "onTraining={openTraining}", 'setPanel("training")', 'panel === "training"'] },
  { feature: "Account opens from the title", file: "App.tsx", symbol: "Account", from: "./screens/Account", uses: ["<Account", 'setPanel("account")', 'panel === "account"'] },
  { feature: "account sign-in on the Account screen", file: "screens/Account.tsx", symbol: "AccountSignIn", from: "../account/ui/AccountSignIn", uses: ["<AccountSignIn>"] },
  { feature: "hall of heroes on the Account screen, in one row with the sign-in", file: "screens/Account.tsx", symbol: "HallOfHeroes", from: "../account/ui/HallOfHeroes", uses: ["<AccountSignIn><HallOfHeroes /></AccountSignIn>"] },
  { feature: "Multiplayer opens from the title", file: "App.tsx", symbol: "Multiplayer", from: "./screens/Multiplayer", uses: ["<Multiplayer", 'setPanel("multiplayer")', 'panel === "multiplayer"'] },
  { feature: "a guest who joined a room gets the guest's fight", file: "App.tsx", symbol: "GuestFight", from: "./screens/GuestFight", uses: ["<GuestFight"] },
  { feature: "the end panel is the fight's end screen", file: "App.tsx", symbol: "EndPanel", from: "./screens/EndScreen", uses: ["<EndPanel"] },
  { feature: "lessons on the end panel", file: "App.tsx", symbol: "lessonsFrom", from: "./lessons/lessons", uses: ["defense={lessonsFrom(events)}"] },
  { feature: "defended attacks are kept for the Account's progress", file: "App.tsx", symbol: "recordDefense", from: "./lessons/defenseStore", uses: ["recordDefense(events"] },
  { feature: "hero card on the end panel", file: "App.tsx", symbol: "SharePanel", from: "./replay/ui/SharePanel", uses: ["card={(close) => <SharePanel"] },
  { feature: "trophies won are shown when they are won", file: "App.tsx", symbol: "UnlockNotice", from: "./account/ui/UnlockNotice", uses: ["<UnlockNotice", "{unlocks}"] },
  { feature: "Homer's line as a fight opens", file: "App.tsx", symbol: "narrateIntro", from: "./screens/hookups", uses: ["narrateIntro("] },
  { feature: "menu music", file: "App.tsx", symbol: "startMusic", from: "./audio/music", uses: ['startMusic("menu")'] },
  { feature: "endings on the end screen", file: "screens/EndScreen.tsx", symbol: "endingFor", from: "../enemies/endings", uses: ["endingFor(enemyId)"] },
  { feature: "defended line on the end screen", file: "screens/EndScreen.tsx", symbol: "DefenseLine", from: "../account/ui/DefensePanel", uses: ["<DefenseLine"] },
  { feature: "Homer's result line", file: "screens/EndScreen.tsx", symbol: "narrateResult", from: "./hookups", uses: ["narrateResult(enemyId, won)"] },
  { feature: "Homer's closing line at the homecoming", file: "screens/EndScreen.tsx", symbol: "narrateHomecoming", from: "./hookups", uses: ["narrateHomecoming()"] },
  { feature: "the fight draws the star-chart HUD", file: "screens/FightScreen.tsx", symbol: "SkyHud", from: "../hud/sky/SkyHud", uses: ["<SkyHud"] },
  { feature: "situation line on the defend card", file: "hud/sky/SkyHud.tsx", symbol: "situationFor", from: "../../enemies/situations", uses: ["situationFor(enemy.id, phase.attack.id)"] },
  { feature: "finisher line on the finish card", file: "hud/sky/SkyHud.tsx", symbol: "finisherLine", from: "../../enemies/finishers", uses: ["finisherLine(enemy.id)"] },
  { feature: "power banner when the god's power is ready", file: "screens/FightScreen.tsx", symbol: "PowerReady", from: "../ai/power/PowerReady", uses: ["<PowerReady"] },
  { feature: "the god's power effect", file: "screens/FightScreen.tsx", symbol: "PowerEffect", from: "../ai/ui/PowerEffect", uses: ["<PowerEffect"] },
  { feature: "the power circle", file: "screens/FightScreen.tsx", symbol: "PowerCircle", from: "../hud/PowerCircle", uses: ["<PowerCircle"] },
  { feature: "fight music, and the win and loss stings", file: "screens/FightScreen.tsx", symbol: "startMusic", from: "../audio/music", uses: ['"fight"', 'startMusic("win")', 'startMusic("loss")'] },
  { feature: "music stops for the pause and comes back", file: "screens/FightScreen.tsx", symbol: "pauseMusic", from: "../audio/music", uses: ["pauseMusic()", "resumeMusic()"] },
  { feature: "the monster's taunt at a new phase", file: "screens/FightScreen.tsx", symbol: "speakMonsterTaunt", from: "../audio/storyVoice", uses: ["speakMonsterTaunt(enemy.id)"] },
  { feature: "Host card opens a room", file: "screens/Multiplayer.tsx", symbol: "RoomHost", from: "./RoomHost", uses: ["<RoomHost"] },
  { feature: "Join card", file: "screens/Multiplayer.tsx", symbol: "RoomJoin", from: "./RoomJoin", uses: ["<RoomJoin"] },
  { feature: "FaceTime card on Multiplayer", file: "screens/Multiplayer.tsx", symbol: "FaceTimeCard", from: "../facetime/ui/FaceTimeCard", uses: ["<FaceTimeCard"] },
  { feature: "a kept seat is taken back on the Join card", file: "screens/RoomJoin.tsx", symbol: "keptRoom", from: "./seatStore", uses: ["keptRoom(store)", "joinRoomAgain("] },
  { feature: "a guest who leaves on purpose gives up the seat", file: "screens/GuestFight.tsx", symbol: "forgetSeat", from: "./seatStore", uses: ["forgetSeat("] },
  { feature: "waist-up play: are the legs in the picture", file: "screens/FightScreen.tsx", symbol: "legsInView", from: "../moves/waistUp", uses: ["legs = legsInView(history, legs)", "step(current, enemy, style, input, dt, !tracker || keyboardMode || legs)"] },
  { feature: "waist-up play: never ask for a move the camera cannot see", file: "combat/engine.ts", symbol: "askable", from: "../moves/waistUp", uses: ["askable(picked, legs)"] },
  { feature: "waist-up play: the move asked for in its place", file: "combat/engine.ts", symbol: "swapFor", from: "../moves/waistUp", uses: ["swapFor(picked, style, spot.item.moves)"] },
];

describe("read as text: the screen imports the piece and uses it", () => {
  test.each(WIRED)("$feature ($file uses $symbol)", (row) => {
    expect(imports(row.file, row.symbol, row.from), `${row.file} no longer imports ${row.symbol} from "${row.from}"`).toBe(true);
    const body = code(row.file).replace(IMPORT, "");
    for (const use of row.uses) expect(body, `${row.file} no longer has \`${use}\`: the hook-up for "${row.feature}" is gone`).toContain(use);
  });
});

// -------------------------------------------------------------------------------------------- built, not wired

interface NotWired {
  readonly feature: string;
  readonly symbol: string;
  /** The feature's own files and folders under src/: uses in here do not count as wiring. */
  readonly own: readonly string[];
  /** The issue, doc or diff that will mount it. */
  readonly wiredBy: string;
}

/**
 * BUILT BUT NOT WIRED on main. Nothing outside the feature's own files names the symbol, so no player can reach it.
 * When you mount one, its test fails: delete the row here and add a row to WIRED (or a rendered test above).
 */
const NOT_WIRED: readonly NotWired[] = [];

/** Every .ts and .tsx file under src/, as paths from src/ with forward slashes. */
function sources(): readonly string[] {
  return readdirSync(new URL("../src/", import.meta.url), { recursive: true, encoding: "utf8" })
    .map((file) => file.replaceAll("\\", "/"))
    .filter((file) => /\.tsx?$/.test(file));
}

describe("built but not wired: mounted nowhere yet", () => {
  const files = sources();

  test("the list of sources is the real one", () => {
    expect(files).toContain("App.tsx");
    expect(files).toContain("screens/Multiplayer.tsx");
  });

  test.each(NOT_WIRED)("$feature ($symbol) is still mounted nowhere", (row) => {
    const named = new RegExp(`\\b${escaped(row.symbol)}\\b`);
    // The module is there to be mounted: if it is gone or renamed the row is out of date too.
    expect(files.filter((file) => row.own.some((own) => file.startsWith(own)) && named.test(code(file))), `${row.symbol} is no longer in ${row.own.join(", ")}: drop or rename its row in NOT_WIRED`).not.toEqual([]);
    const users = files.filter((file) => !row.own.some((own) => file.startsWith(own)) && named.test(code(file)));
    expect(users, `"${row.feature}" is wired now: ${row.symbol} is used by src/${users.join(", src/")}. Move its row from NOT_WIRED to WIRED in tests/screenHookups.test.ts (was waiting on ${row.wiredBy}).`).toEqual([]);
  });
});
