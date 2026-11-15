// Writes public/favicon.svg: the emblem in stones, small. Run: npx tsx scripts/gen-pebble-favicon.ts
import { writeFileSync } from "node:fs";
import { emblemLayout } from "../src/ui/pebble/brand";
import { layoutToSvg } from "../src/ui/pebble/draw";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><circle cx="32" cy="32" r="31" fill="#15100e"/>${layoutToSvg(emblemLayout(64, 7, 2.4))}</svg>\n`;
writeFileSync(new URL("../public/favicon.svg", import.meta.url), svg);
console.log(`public/favicon.svg ${String(svg.length)} bytes`);
