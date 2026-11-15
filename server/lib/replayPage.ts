// The page a phone opens from the QR code: the god card, the fight video and how the fight went. One document, nothing fetched from anywhere else.
import type { StoredReplay } from "./replayStore";

const STYLE = `
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#140c22;color:#f1ead9;font:17px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;-webkit-text-size-adjust:100%}
main{max-width:520px;margin:0 auto;padding:28px 18px 44px;text-align:center}
h1,h2,.kicker{font-family:Georgia,"Iowan Old Style","Times New Roman",serif;overflow-wrap:anywhere}
.kicker{margin:0;color:#e8b84a;font-size:13px;letter-spacing:.28em;text-transform:uppercase}
h1{margin:10px 0 4px;color:#e8b84a;font-size:40px;line-height:1.1}
h2{margin:22px 0 2px;font-size:22px;line-height:1.25;font-weight:400}
p{margin:0;overflow-wrap:anywhere}
.epithet{font-style:italic;opacity:.85}
.result strong{color:#e8b84a}
img,video{display:block;width:100%;height:auto;margin:20px 0 0;border:1px solid #e8b84a;border-radius:10px;background:#0c0716}
.links{display:flex;flex-direction:column;gap:12px;margin-top:24px}
.links a{display:block;padding:14px 16px;border:1px solid #e8b84a;border-radius:999px;background:#e8b84a;color:#140c22;font-weight:600;text-decoration:none}
.links a+a{background:transparent;color:#e8b84a}
footer{margin-top:30px;font-size:13px;opacity:.6}
`.trim();

const ESCAPES: Readonly<Record<string, string>> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? "");
}

function shell(title: string, body: string): string {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="theme-color" content="#140c22">',
    `<title>${escapeHtml(title)}</title>`,
    `<style>${STYLE}</style>`,
    "</head>",
    "<body>",
    "<main>",
    '<p class="kicker">Odyssey Dojo</p>',
    body,
    "</main>",
    "</body>",
    "</html>",
  ].join("\n");
}

function resultLine(replay: StoredReplay): string {
  const { enemyName, score, won } = replay.meta;
  const against = enemyName === "" ? "" : ` ${won ? "over" : "to"} ${escapeHtml(enemyName)}`;
  const points = Math.round(score).toLocaleString("en-US");
  return `<p class="result"><strong>${won ? "Victory" : "Fell"}</strong>${against} &middot; Score ${points}</p>`;
}

export function replayPage(replay: StoredReplay): string {
  const { epithet, fightTitle } = replay.meta;
  const godName = replay.meta.godName === "" ? "A hero of Ithaca" : replay.meta.godName;
  const base = `/replays/${replay.id}`;
  const parts = [`<h1>${escapeHtml(godName)}</h1>`];
  if (epithet !== "") parts.push(`<p class="epithet">${escapeHtml(epithet)}</p>`);
  if (replay.hasCard) parts.push(`<img src="${base}/card.png" alt="The god card of ${escapeHtml(godName)}">`);
  if (fightTitle !== "") parts.push(`<h2>${escapeHtml(fightTitle)}</h2>`);
  parts.push(resultLine(replay));
  if (replay.video !== null) parts.push(`<video controls playsinline preload="metadata" src="${base}/video"></video>`);
  const links: string[] = [];
  if (replay.hasCard) links.push(`<a href="${base}/card.png" download="odyssey-dojo-card.png">Save the card</a>`);
  if (replay.video !== null) {
    links.push(`<a href="${base}/video" download="odyssey-dojo-replay.${replay.video}">Save the replay</a>`);
  }
  if (links.length > 0) parts.push(`<div class="links">${links.join("")}</div>`);
  parts.push("<footer>Fought with a webcam at HackUTA 2026.</footer>");
  return shell(`${godName} | Odyssey Dojo`, parts.join("\n"));
}

export function missingPage(): string {
  return shell("Replay not found | Odyssey Dojo", [
    "<h1>Lost at sea</h1>",
    "<p>This replay is gone. Only the newest fights are kept, so ask for a fresh code.</p>",
  ].join("\n"));
}
