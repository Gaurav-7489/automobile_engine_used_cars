import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const pipeline = "http://127.0.0.1:3001/command/pipeline", api = "http://127.0.0.1:3001/command/api", site = "http://127.0.0.1:3000";
const axeSource = readFileSync(createRequire(process.cwd() + "/package.json").resolve("axe-core"), "utf8");
async function violations(page: Page) {
  await page.evaluate(axeSource);
  return page.evaluate(async () => {
    const r = await (window as unknown as { axe: { run: (c: Document, o: object) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
    return r.violations.map(v => ({ id: v.id, targets: v.nodes.slice(0, 4).map(n => n.target.join(" ")) }));
  });
}
async function freshLead(request: import("@playwright/test").APIRequestContext, label: string) {
  const created = await request.post(`${site}/api/leads`, { data: { name: `Pipeline ${label}`, phone: "+91 90000 00055", intent: "finance", vehicleId: "veh-3", whatsappConsent: true, marketingConsent: false } });
  expect(created.status()).toBe(201);
  return { id: (await created.json()).leadId as string, name: `Pipeline ${label}` };
}

test("the board shows the seven open stages, a demo label and a keyboard-reachable scroller", async ({ page }) => {
  await page.goto(pipeline);
  await expect(page.getByRole("heading", { level: 1, name: "Every lead, one next step." })).toBeVisible();
  await expect(page.getByText("Demonstration data — fictional records")).toBeVisible();
  const board = page.getByRole("group", { name: "Pipeline stages" });
  await expect(board.getByRole("heading", { level: 2 })).toHaveText(["New", "Contacted", "Qualified", "Appointment", "Visited", "Test drive", "Negotiation"]);
  await board.focus(); await expect(board).toBeFocused();
  await expect(page.getByRole("region", { name: "Pipeline headline figures" })).toContainText("Open leads", { ignoreCase: true });
  await expect(page.getByRole("heading", { name: "Closed" })).toBeVisible();
});

test("a new lead appears with its waiting time and no next step, and can be moved from the card", async ({ page, request }, info) => {
  const lead = await freshLead(request, `move ${info.project.name} ${Date.now()}`);
  await page.goto(pipeline);
  const column = (name: string) => page.locator("section.pl-col").filter({ has: page.getByRole("heading", { name, exact: true }) });
  const card = column("New").getByRole("listitem").filter({ hasText: lead.name });
  await expect(card).toContainText(/Waiting [\d.]+ h/);
  await card.getByLabel(`Move ${lead.name} to another stage`).selectOption("contacted");
  await expect.poll(async () => ((await (await request.get(`${api}/snapshot`)).json()).data.leads as { id: string; stage: string }[]).find(l => l.id === lead.id)?.stage).toBe("contacted");
  await page.reload();
  await expect(column("Contacted").getByRole("listitem").filter({ hasText: lead.name })).toBeVisible();
  await expect(column("New").getByRole("listitem").filter({ hasText: lead.name })).toHaveCount(0);
});

test("a stale screen cannot overwrite a newer change: the move is refused and says why", async ({ page, request }, info) => {
  const lead = await freshLead(request, `stale ${info.project.name} ${Date.now()}`);
  await page.goto(pipeline);
  const card = page.locator("section.pl-col").getByRole("listitem").filter({ hasText: lead.name });
  await expect(card).toBeVisible();
  const current = ((await (await request.get(`${api}/snapshot`)).json()).data.leads as { id: string; version?: number }[]).find(l => l.id === lead.id)!;
  expect((await request.patch(`${api}/leads/${lead.id}`, { data: { stage: "qualified", expectedVersion: current.version ?? 0 } })).status()).toBe(200);
  await card.getByLabel(`Move ${lead.name} to another stage`).selectOption("negotiation");
  await expect(card.getByRole("alert")).toHaveText("This lead changed. Reload to see the latest.");
  const after = ((await (await request.get(`${api}/snapshot`)).json()).data.leads as { id: string; stage: string }[]).find(l => l.id === lead.id)!;
  expect(after.stage).toBe("qualified");
});

test("owner and attention filters mark the current choice and only narrow the board", async ({ page, request }, info) => {
  await freshLead(request, `filter ${info.project.name} ${Date.now()}`);
  await page.goto(pipeline);
  const cards = page.locator("section.pl-col .pl-card");
  const all = await cards.count();
  expect(all).toBeGreaterThan(0);
  const focus = page.getByRole("navigation", { name: "Filter by attention" });
  await expect(focus.getByRole("link", { name: "All leads" })).toHaveAttribute("aria-current", "page");
  await focus.getByRole("link", { name: "Needs attention" }).click();
  await expect(page).toHaveURL(/focus=attention/);
  await expect(focus.getByRole("link", { name: "Needs attention" })).toHaveAttribute("aria-current", "page");
  const flagged = await page.locator("section.pl-col .pl-card").count();
  expect(flagged).toBeLessThanOrEqual(all); expect(flagged).toBeGreaterThan(0);
  for (const item of await page.locator("section.pl-col .pl-card").all()) await expect(item.getByRole("list", { name: /^Flags for/ })).toBeVisible();
  await page.goto(`${pipeline}?owner=nobody-here`);
  await expect(page.getByRole("navigation", { name: "Filter by owner" }).getByRole("link", { name: "Everyone" })).toHaveAttribute("aria-current", "page");
});

test("WCAG 2.1 A/AA automated checks pass and the page itself never scrolls sideways", async ({ page }) => {
  await page.goto(pipeline);
  await page.getByRole("heading", { level: 1 }).waitFor();
  expect(await violations(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
