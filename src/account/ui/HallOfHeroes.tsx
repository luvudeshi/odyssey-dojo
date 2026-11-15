// The hall of heroes on the Account screen: one button, and behind it the board. The board shows the best score of
// each hero tonight and of all time, a podium for the first three, the rest down to ten, and how busy the road has
// been (fights this hour, a line of the last six hours, wins at each stop). Read from the server's /api/heroes, which
// keeps every fight as a time series on Tiger Data.
// With no accounts on the server there is no hall: this draws nothing and asks nothing. It learns that from the
// account's state (../sync), which the sign-in part (AccountSignIn) asks for when the page opens, so the two are put
// on the page together: on the Account screen the button goes inside that part, in its row of buttons,
// <AccountSignIn><HallOfHeroes /></AccountSignIn>. It brings its own styles (./hall.css).
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GODS } from "../../ai/gods/gods";
import { ENEMIES } from "../../enemies/registry";
import { currentStyleId } from "../../styles/oldIds";
import { STYLES } from "../../styles/registry";
import { Dialog } from "../../ui/Dialog";
import { Button } from "../../ui/pebble";
import { loadHall } from "../hall";
import type { Hall, HallRow } from "../heroes";
import { useAccount } from "../sync";
import { Icon } from "./icons";
import "./hall.css";

/** How often the lists are read again while the page is open and in front. */
export const HALL_REFRESH_MS = 10_000;
/** After a reading that failed, the next one waits this long: nothing keeps knocking on a server that is down. */
export const HALL_RETRY_MS = 60_000;

type View = "tonight" | "allTime";

/**
 * The hall while this component is on the screen; null until the first answer, and for good when that answer is
 * "no hall". Nothing is asked until the server is known to have accounts (`there`). Then it is read once, to learn
 * whether there is a hall to show, and again and again only while the board is open. Closing the board asks nothing.
 */
function useHall(there: boolean, open: boolean): Hall | null {
  const [hall, setHall] = useState<Hall | null>(null);
  // True once a reading has come back. The effect below runs again when the board closes, and must not read then.
  const held = useRef(false);
  useEffect(() => {
    if (!there) return undefined;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const again = (ms: number): void => { timer = setTimeout(() => { void read(); }, ms); };
    const read = async (): Promise<void> => {
      // A tab in the background asks nothing; it looks again at its next turn.
      if (document.visibilityState === "hidden") {
        again(HALL_REFRESH_MS);
        return;
      }
      const got = await loadHall();
      if (!live) return;
      if (got !== null) {
        held.current = true;
        setHall(got);
      }
      if (open) again(got !== null ? HALL_REFRESH_MS : HALL_RETRY_MS);
    };
    if (open || !held.current) void read();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [there, open]);
  return hall;
}

const words = (id: string): string => id.split(/[_-]/).filter(Boolean).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
const stopName = (id: string): string => ENEMIES.find((enemy) => enemy.id === id)?.name ?? words(id);
const styleName = (id: string): string => STYLES.find((style) => style.id === currentStyleId(id))?.name ?? words(id);
const godName = (id: string | null): string | null => (id === null ? null : Object.values(GODS).find((god) => god.id === id)?.name ?? words(id));
const points = (score: number): string => score.toLocaleString("en-US");

/** Where a score was made, in words: "Scylla, Boxer, with Athena". */
function where(row: HallRow): string {
  const god = godName(row.god);
  return `${stopName(row.stop)}, ${styleName(row.style)}${god === null ? "" : `, with ${god}`}`;
}

const PLACE = ["First", "Second", "Third"] as const;

function Step(props: { row: HallRow | undefined; place: 0 | 1 | 2 }) {
  const { row, place } = props;
  return (
    <li className={`hall__step hall__step--${String(place + 1)} ${row?.you ? "is-you" : ""} ${row ? "" : "is-empty"}`} style={{ order: [1, 0, 2][place] }}>
      {row && (
        <>
          <b className="hall__name" title={row.hero}>{row.hero}</b>
          {row.you && <span className="hall__you">You</span>}
          <span className="hall__score">{points(row.score)}</span>
          <span className="hall__where" title={where(row)}>{stopName(row.stop)}</span>
        </>
      )}
      <span className="hall__block" aria-label={row ? `${PLACE[place]} place` : undefined}>{String(place + 1)}</span>
    </li>
  );
}

/** The fights per bucket as a filled line, oldest on the left. */
function Pulse(props: { fights: readonly number[]; label: string }) {
  const { fights } = props;
  const W = 240, H = 44, PAD = 4;
  const top = Math.max(1, ...fights);
  const x = (index: number): number => PAD + (index * (W - 2 * PAD)) / Math.max(1, fights.length - 1);
  const y = (value: number): number => H - PAD - (value / top) * (H - 2 * PAD - 2);
  const line = fights.map((value, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)} ${y(value).toFixed(1)}`).join(" ");
  const last = fights.length - 1;
  return (
    <svg className="hall__pulse" viewBox={`0 0 ${String(W)} ${String(H)}`} preserveAspectRatio="none" role="img" aria-label={props.label}>
      {fights.length > 1 && (
        <>
          <path className="hall__pulse-fill" d={`${line} L${x(last).toFixed(1)} ${String(H - PAD)} L${x(0).toFixed(1)} ${String(H - PAD)} Z`} />
          <path className="hall__pulse-line" d={line} vectorEffect="non-scaling-stroke" />
        </>
      )}
    </svg>
  );
}

function Board(props: { hall: Hall }) {
  const { hall } = props;
  const [view, setView] = useState<View>("tonight");
  const rows = hall[view];
  const hours = Math.round((hall.activity.fights.length * hall.activity.minutes) / 60);
  const busiest = hall.stops.filter((stop) => stop.wins > 0).slice(0, 3);
  return (
    <section className="hall" aria-label="The best scores">
      <div className="hall__switch" role="group" aria-label="Which scores">
        <Button primary={view === "tonight"} aria-pressed={view === "tonight"} onClick={() => { setView("tonight"); }}>Tonight</Button>
        <Button primary={view === "allTime"} aria-pressed={view === "allTime"} onClick={() => { setView("allTime"); }}>All time</Button>
      </div>
      {rows.length === 0 ? (
        <p className="hall__none">{hall.allTime.length === 0 ? "No hero has fought yet. Be the first." : "No hero has fought tonight. Be the first."}</p>
      ) : (
        <>
          <ol className="hall__podium">
            {([0, 1, 2] as const).map((place) => <Step key={place} place={place} row={rows[place]} />)}
          </ol>
          {rows.length > 3 && (
            <ol className="hall__list" start={4}>
              {rows.slice(3).map((row, index) => (
                <li key={`${String(index)} ${row.hero}`} className={row.you ? "is-you" : ""} title={where(row)}>
                  <span className="hall__rank">{String(index + 4)}</span>
                  <b className="hall__name">{row.hero}</b>
                  {row.you && <span className="hall__you">You</span>}
                  <span className="hall__where">{stopName(row.stop)}</span>
                  <span className="hall__score">{points(row.score)}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
      <footer className="hall__road">
        {view === "tonight"
          ? <p className="hall__count"><b>{points(hall.lastHour)}</b><span>{hall.lastHour === 1 ? "fight this hour" : "fights this hour"}</span></p>
          : <p className="hall__count"><b>{points(hall.fightsEver)}</b><span>{hall.fightsEver === 1 ? "fight in all" : "fights in all"}</span></p>}
        <div className="hall__chart">
          <Pulse fights={hall.activity.fights} label={`Fights every ${String(hall.activity.minutes)} minutes over the last ${String(hours)} hours`} />
          <span>Fights, last {String(hours)} hours</span>
        </div>
        {busiest.length > 0 && (
          <p className="hall__stops">
            <span>Most beaten tonight</span>
            {busiest.map((stop) => <span key={stop.stop} className="hall__stop" title={`${String(stop.wins)} won of ${String(stop.fights)} fought`}><b>{stopName(stop.stop)}</b> {String(stop.wins)}</span>)}
          </p>
        )}
      </footer>
    </section>
  );
}

export function HallOfHeroes() {
  const account = useAccount();
  const [open, setOpen] = useState(false);
  // "unknown": nobody has asked the server yet. "off": it has no accounts, so it has no hall either.
  const there = account.status !== "unknown" && account.status !== "off";
  const hall = useHall(there, open);
  if (!there || hall === null) return null;
  const close = (): void => { setOpen(false); };
  return (
    <div className="hall-door">
      <Button onClick={() => { setOpen(true); }}><Icon name="trophy" className="hall-door__icon" />Hall of heroes</Button>
      {open && createPortal(
        <Dialog title="Hall of heroes" onEscape={close}>
          <Board hall={hall} />
          <Button onClick={close}>Back</Button>
        </Dialog>,
        document.body,
      )}
    </div>
  );
}
