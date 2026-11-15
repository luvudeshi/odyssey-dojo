// Asks the player how they fight, in their own words, and shows the fight the Muse built from it as a title card.
// Drawn with the pebble kit (src/ui/pebble): a panel, a stone heading and the kit's buttons. The rest is styleScreen.css.
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { prepareLine, speakLine, stopNarration } from "../../audio/narration";
import { log } from "../../core/log";
import type { EnemySpec } from "../../core/types";
import { ENEMIES } from "../../enemies/registry";
import { MOVES } from "../../moves/registry";
import { Button, Panel, PebbleHeading } from "../../ui/pebble";
import { fightFromLevel } from "../adapt";
import { generateLevel } from "../client";
import type { GodId, LevelResponse, LevelSpec } from "../contracts";
import { fallbackLevel } from "../fallbacks";
import { EXAMPLE_PHRASES, MAX_PHRASE_LENGTH, cleanEpithet, cleanPhrase, fromSpeech, pickExamples } from "./phrase";
import "./styleScreen.css";

// lib.dom does not declare speech recognition, so the part used here is typed by hand.
interface Recognizer {
  maxAlternatives: number;
  onresult: ((event: { readonly results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}
type RecognizerClass = new () => Recognizer;

type Step = { readonly kind: "ask" } | { readonly kind: "working" } | { readonly kind: "card"; readonly made: LevelResponse };

const PLACEHOLDER_MS = 2800;
const CHIPS = 4;
// The wait is up to LEVEL_TIMEOUT_MS (src/ai/client.ts). A row of stones lights up across it and these lines come in one
// by one, so the screen is never still. Both are timed in styleScreen.css, not here.
const STONES = 12;
const MAKING: readonly string[] = ["A monster takes shape", "An arena rises around it", "It learns your name"];
const nth = (index: number): CSSProperties => ({ "--i": index } as CSSProperties);

function findRecognizer(): RecognizerClass | null {
  if (typeof window === "undefined") return null;
  const scope = window as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  const found = scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
  return typeof found === "function" ? (found as RecognizerClass) : null;
}

function hush(recognizer: Recognizer | null): void {
  try {
    recognizer?.abort();
  } catch (error) {
    log("warn", "speech_abort_failed", error);
  }
}

const Recognition = findRecognizer();

export function StyleScreen(props: {
  god: GodId;
  rivalGod: GodId;
  epithet?: string;
  onDone: (fight: { enemy: EnemySpec; level: LevelSpec; source: "ai" | "fallback" }) => void;
  onBack?: () => void;
  /** What the Back button says. "Back" when left out. */
  backLabel?: string;
}) {
  const { god, rivalGod, epithet, onDone, onBack, backLabel = "Back" } = props;
  const [step, setStep] = useState<Step>({ kind: "ask" });
  const [phrase, setPhrase] = useState("");
  const [listening, setListening] = useState(false);
  const [turn, setTurn] = useState(0);
  const [chips] = useState(() => pickExamples(Date.now(), CHIPS));
  const alive = useRef(true);
  const input = useRef<HTMLInputElement>(null);
  const recognizer = useRef<Recognizer | null>(null);
  const intro = useRef<string | null>(null);

  useEffect(() => {
    alive.current = true;
    const timer = window.setInterval(() => { setTurn((count) => count + 1); }, PLACEHOLDER_MS);
    return () => {
      alive.current = false;
      window.clearInterval(timer);
      hush(recognizer.current);
      recognizer.current = null;
      intro.current = null;
      stopNarration();
    };
  }, []);

  const stopListening = (): void => {
    hush(recognizer.current);
    recognizer.current = null;
    setListening(false);
  };

  const listen = (): void => {
    if (!Recognition) return;
    try {
      const session = new Recognition();
      const done = (): void => {
        if (recognizer.current !== session) return;
        recognizer.current = null;
        if (!alive.current) return;
        setListening(false);
        input.current?.focus();
      };
      session.maxAlternatives = 3;
      session.onresult = (event) => {
        const heard = fromSpeech(Array.from(event.results[0] ?? []));
        if (alive.current && recognizer.current === session && heard !== "") setPhrase(heard);
      };
      session.onerror = done;
      session.onend = done;
      recognizer.current = session;
      session.start();
      setListening(true);
    } catch (error) {
      log("warn", "speech_unavailable", error);
      stopListening();
    }
  };

  // The voice can arrive after the player has moved on, so it only starts while its own card is still showing.
  const readAloud = (line: string): void => {
    intro.current = line;
    void prepareLine("homer", line).then((url) => {
      if (url !== null && intro.current === line) void speakLine("homer", line);
    });
  };

  const silence = (): void => {
    intro.current = null;
    stopNarration();
  };

  const build = (): void => {
    const said = cleanPhrase(phrase);
    if (said === "") return;
    stopListening();
    setPhrase(said);
    setStep({ kind: "working" });
    // An epithet longer than the server allows would be refused, and every phrase would then get a bundled fight.
    const known = cleanEpithet(epithet);
    generateLevel({ phrase: said, god, rival_god: rivalGod, ...(known === undefined ? {} : { epithet: known }) }).then(
      (made) => {
        if (!alive.current) return;
        setStep({ kind: "card", made });
        readAloud(made.level.narration_intro);
      },
      (error: unknown) => {
        log("error", "level_failed", error);
        if (alive.current) setStep({ kind: "ask" });
      },
    );
  };

  if (step.kind === "working") {
    return (
      <Panel as="main" ornament className="menu style-screen">
        <p className="style-working" role="status">The Muse is composing...</p>
        <p className="style-said">{phrase}</p>
        <div className="style-stones" aria-hidden="true">
          {Array.from({ length: STONES }, (_, index) => <span key={index} className="style-stone" style={nth(index)} />)}
        </div>
        <ul className="style-making" aria-hidden="true">
          {MAKING.map((line, index) => <li key={line} className="style-step" style={nth(index)}>{line}</li>)}
        </ul>
      </Panel>
    );
  }

  if (step.kind === "card") {
    const { level, source } = step.made;
    const taunt = level.taunts[0];
    // Fight always starts a fight. A made level the game cannot turn into one gives way to the bundled fight for the same phrase.
    const fight = (): void => {
      silence();
      let made: Parameters<typeof onDone>[0];
      try {
        made = { enemy: fightFromLevel(level, ENEMIES, MOVES), level, source };
      } catch (error) {
        log("error", "level_unplayable", error);
        const spare = fallbackLevel({ phrase, god, rival_god: rivalGod });
        made = { enemy: fightFromLevel(spare, ENEMIES, MOVES), level: spare, source: "fallback" };
      }
      onDone(made);
    };
    return (
      <Panel as="main" ornament className="menu style-screen style-card">
        <p className="style-kicker">{source === "ai" ? "The Muse made this fight for you" : "A fight from the old songs"}</p>
        <h1 className="style-title">{level.title}</h1>
        <p className="style-heard">We heard: {level.interpretation}</p>
        <div className="style-foe">
          <p className="style-monster">{level.monster.name}</p>
          {taunt !== undefined && <p className="style-taunt">{taunt}</p>}
          <p className="style-setting">{level.arena.setting}</p>
        </div>
        <ul className="style-phases">
          {level.phases.map((phase, index) => <li key={index} className="style-phase">{phase.name}</li>)}
        </ul>
        <div className="style-palette" aria-hidden="true">
          {level.arena.palette.map((colour, index) => <span key={index} className="style-swatch" style={{ background: colour }} />)}
        </div>
        {source === "fallback" && (
          <p className="style-note">The Muse was out of reach, so this one comes from the old songs.</p>
        )}
        <div className="style-actions">
          <Button primary autoFocus onClick={fight}>Fight</Button>
          <Button onClick={() => { silence(); setStep({ kind: "ask" }); }}>Try another phrase</Button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel as="main" ornament className="menu style-screen">
      <PebbleHeading as="h1" text="How do you fight?" px={60} tone="ochre" />
      <p className="style-lede">Say it your way. The Muse will build your fight from it.</p>
      <form className="style-form" onSubmit={(event) => { event.preventDefault(); build(); }}>
        <input
          ref={input}
          className="style-input"
          type="text"
          autoFocus
          autoComplete="off"
          maxLength={MAX_PHRASE_LENGTH}
          aria-label="How do you fight?"
          placeholder={listening ? "Listening..." : (EXAMPLE_PHRASES[turn % EXAMPLE_PHRASES.length] ?? "")}
          value={phrase}
          onChange={(event) => { setPhrase(event.target.value); }}
        />
        <div className="style-chips">
          {chips.map((chip) => (
            <button key={chip} type="button" className="style-chip" onClick={() => { setPhrase(chip); input.current?.focus(); }}>
              {chip}
            </button>
          ))}
        </div>
        <div className="style-actions">
          {Recognition && (
            <Button className={listening ? "style-listening" : ""} onClick={listening ? stopListening : listen}>
              {listening ? "Listening..." : "Speak it"}
            </Button>
          )}
          <Button primary type="submit" className="style-build" disabled={cleanPhrase(phrase) === ""}>Build my fight</Button>
        </div>
      </form>
      {onBack && <Button onClick={onBack}>{backLabel}</Button>}
    </Panel>
  );
}
