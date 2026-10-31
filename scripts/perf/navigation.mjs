// Time from clicking a navigation link to the page showing its data, with 120 ms of added network latency.
// Usage: LOCAL_SCALE_USER=... LOCAL_SCALE_PASSWORD=... node scripts/perf/navigation.mjs   (against a running production build)
import { chromium } from "playwright";
const BASE = process.env.LOCAL_STACK_ORIGIN ?? "http://127.0.0.1:3003";
const USER = process.env.LOCAL_SCALE_USER, PASSWORD = process.env.LOCAL_SCALE_PASSWORD ?? "";
if (!USER) throw new Error("Set LOCAL_SCALE_USER and LOCAL_SCALE_PASSWORD (a synthetic account in a local test database).");
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1366, height: 860 } }); const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
await p.goto(BASE + "/login"); await p.getByLabel(/business email/i).fill(USER); await p.getByLabel(/^password/i).fill(PASSWORD); await p.getByRole("button", { name: /^sign in/i }).click(); await p.waitForURL(/\/app\//);
await p.waitForTimeout(1500);
await cdp.send("Network.enable"); await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 120, downloadThroughput: 1.5e6, uploadThroughput: 7.5e5 });
const route = ["Inventory", "Leads & customers", "Capital & profit", "Command Centre", "Inventory", "Leads & customers", "Capital & profit", "Command Centre"];
const out = [];
for (const name of route) {
  const link = p.getByRole("navigation", { name: "Primary" }).getByRole("link", { name, exact: true });
  await link.hover(); await p.waitForTimeout(250); // a person's pointer reaches the link before the click
  const t0 = Date.now();
  await link.click();
  await p.waitForFunction(() => !document.querySelector('[aria-busy="true"]') && !document.querySelector('[role="status"][aria-label="Loading page"]') && document.querySelector("main h1"), null, { timeout: 30000, polling: 16 });
  out.push(`${name.padEnd(18)} ${String(Date.now() - t0).padStart(5)} ms`);
}
console.log(out.join("\n")); await b.close();
