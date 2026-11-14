// Asks the player how they fight, in their own words, and shows the fight the Muse built from it as a title card.
import { useEffect, useRef, useState } from "react";
import { prepareLine, speakLine, stopNarration } from "../../audio/narration";
import { log } from "../../core/log";
import type { EnemySpec } from "../../core/types";
import { ENEMIES } from "../../enemies/registry";
import { MOVES } from "../../moves/registry";
import { fightFromLevel } from "../adapt";
import { generateLevel } from "../client";
import type { GodId, LevelResponse, LevelSpec } from "../contracts";
import { EXAMPLE_PHRASES, MAX_PHRASE_LENGTH, cleanPhrase, fromSpeech, pickExamples } from "./phrase";
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
}) {
  const { god, rivalGod, epithet, onDone, onBack } = props;
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
    generateLevel({ phrase: said, god, rival_god: rivalGod, ...(epithet === undefined ? {} : { epithet }) }).then(
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
      <main className="menu style-screen">
        <p className="style-working" role="status">The Muse is composing...</p>
        <p className="style-said">{phrase}</p>
      </main>
    );
  }

  if (step.kind === "card") {
    const { level, source } = step.made;
    return (
      <main className="menu style-screen style-card">
        <h1 className="style-title">{level.title}</h1>
        <p className="style-heard">We heard: {level.interpretation}</p>
        <p className="style-monster">{level.monster.name}</p>
        <p className="style-setting">{level.arena.setting}</p>
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
          <button
            autoFocus
            onClick={() => {
              silence();
              onDone({ enemy: fightFromLevel(level, ENEMIES, MOVES), level, source });
            }}
          >
            Fight
          </button>
          <button className="style-quiet" onClick={() => { silence(); setStep({ kind: "ask" }); }}>Try another phrase</button>
        </div>
      </main>
    );
  }

  return (
    <main className="menu style-screen">
      <h1>How do you fight?</h1>
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
            <button
              type="button"
              className={listening ? "style-quiet style-listening" : "style-quiet"}
              onClick={listening ? stopListening : listen}
            >
              {listening ? "Listening..." : "Speak it"}
            </button>
          )}
          <button type="submit" className="style-primary" disabled={cleanPhrase(phrase) === ""}>Build my fight</button>
        </div>
      </form>
      {onBack && <button className="style-quiet style-back" onClick={onBack}>Back</button>}
    </main>
  );
}
