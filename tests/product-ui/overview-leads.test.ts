import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (p: string) => readFile(`apps/intelligence/${p}`, "utf8");

test("overview priority actions are a readable list, shown before the charts", async () => {
  const src = await read("components/overview/overview-page.tsx");
  assert.match(src, /<ul className="pa-list" aria-label="Priority actions">/);
  assert.ok(!/aria-label="Priority actions">\s*<thead>/.test(src), "no cramped table");
  assert.ok(src.indexOf('aria-labelledby="pa-title"') < src.indexOf("order-charts"), "actions come right after the key figures");
  assert.match(src, /No due date/, "a missing due date says so plainly");
});

test("figure icons are decorative only", async () => {
  const ui = await read("components/ui.tsx");
  assert.match(ui, /<span className=\{`kpi-ico \$\{tone\}`\} aria-hidden="true">/);
});

test("leads: the List / Pipeline switch sits with the filters, and every stage has a colour", async () => {
  const src = await read("components/leads/leads-page.tsx");
  assert.equal((src.match(/<ViewSwitch /g) ?? []).length, 2, "one in the desktop filter row, one in the phone bar");
  assert.ok(!/className="seg" role="group" aria-label="View"/.test(src), "the old switch at the bottom is gone");
  assert.match(src, /const STAGE_TONE: Record<LeadStage, Tone>/, "typed against every stage, so a new stage cannot be missed");
  assert.match(src, /aria-pressed=\{overdue\}/, "the overdue chip reports its state");
});

test("pipeline cards anchor their hidden labels, so the board never makes the page scroll sideways", async () => {
  const css = await read("app/globals.css");
  assert.match(css, /\.pipe-card \{ position: relative;/);
  assert.match(css, /\.pipeline \{[^}]*overflow-x: auto/);
});
