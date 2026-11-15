import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { PowerCircle, shardHeat } from "../src/hud/PowerCircle";

const render = (power: number, lifted = false): string => renderToStaticMarkup(createElement(PowerCircle, { power, lifted }));

test("an empty meter shows the ring at 0% with nothing filled", () => {
  const html = render(0);
  expect(html).toContain('aria-valuenow="0"');
  expect(html).toContain(">0%<");
  expect(html).not.toContain("power-circle__fill");
  expect(html).not.toContain("is-full");
});

test("a part-full meter shows its percentage and fills that share of the ring", () => {
  const html = render(0.6);
  expect(html).toContain(">60%<");
  const offset = Number(/stroke-dashoffset="([\d.]+)"/.exec(html)?.[1]);
  const length = Number(/stroke-dasharray="([\d.]+)"/.exec(html)?.[1]);
  expect(offset / length).toBeCloseTo(0.4, 5);
  expect(html).not.toContain("is-full");
});

test("a full meter is marked full, and anything past full or not a number stays in range", () => {
  expect(render(1)).toContain("is-full");
  expect(render(1)).toContain(">FULL<");
  expect(render(3)).toContain('aria-valuenow="100"');
  expect(render(Number.NaN)).toContain('aria-valuenow="0"');
});

test("it lifts over the power-ready banner only when told to", () => {
  expect(render(1, true)).toContain("is-lifted");
  expect(render(1)).not.toContain("is-lifted");
});

test("each fifth of power lights one more glass shard, the one filling partly", () => {
  expect([0, 1, 2, 3, 4].map((i) => shardHeat(0.6, i))).toEqual([1, 1, 1, 0, 0]);
  expect(shardHeat(0.7, 3)).toBeCloseTo(0.5, 5);
  expect(render(0.6).match(/class="power-circle__melt"/g)?.length).toBe(3);
  expect(render(0).match(/class="power-circle__melt"/g)).toBeNull();
  expect(render(1).match(/class="power-circle__melt"/g)?.length).toBe(5);
});
