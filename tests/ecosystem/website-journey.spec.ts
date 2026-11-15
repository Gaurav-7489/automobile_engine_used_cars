import { test, expect, devices, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";

const INTEL = process.env.INTEL_ORIGIN ?? "http://127.0.0.1:3003";
const SITE = process.env.VLUCE_ORIGIN ?? "http://127.0.0.1:3100"; // connected website (durable store)
const SITE_ONLY = process.env.VLUCE_ONLY_ORIGIN ?? "http://127.0.0.1:3101"; // website-only, CRM webhook (durable store)
const SITE_BARE = process.env.VLUCE_BARE_ORIGIN ?? "http://127.0.0.1:3102"; // production with nothing configured
const CRM = process.env.CRM_ORIGIN ?? "http://127.0.0.1:3200";
const JOIN = process.env.JOIN_URL ?? "";
const EMAIL = "owner@delta.example";
const PASSWORD = "Delta motors 2026 secure";
const sql = (db: string, q: string) => execFileSync("psql", ["-h", "127.0.0.1", "-p", "5544", "-U", "postgres", "-d", db, "-tAc", q], { encoding: "utf8" }).trim();

async function commands(page: Page, list: { name: string; args: unknown[] }[]) {
  return page.evaluate(async (body) => { const r = await fetch("/api/workspace/commands", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; }, { commands: list });
}

let stockId = "";

/** The setup link works once; later runs sign in with the password it set. */
async function signInDealer(page: Page) {
  if (JOIN) {
    await page.goto(JOIN);
    if (await page.getByLabel("New password").waitFor({ timeout: 10_000 }).then(() => true, () => false)) {
      await page.getByLabel("New password").fill(PASSWORD);
      await page.getByLabel("Confirm password").fill(PASSWORD);
      await page.getByRole("button", { name: /sign in/i }).click();
      await page.waitForURL(/\/app/, { timeout: 30_000 });
      return;
    }
  }
  await page.goto(`${INTEL}/login`);
  await page.getByLabel("Business email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /^sign in/i }).click();
  await page.waitForURL(/\/app/, { timeout: 30_000 });
}

test("dealer publishes a car in Intelligence → it appears on the website → a customer enquires → the lead is in Intelligence → sold car leaves the website", async ({ page, browser }) => {
  // Repeated local runs trip the (correct) shared sign-in and enquiry limits; this local stack's limiters start empty.
  sql("vl", "TRUNCATE intelligence_rate_limits");
  sql("vluce_a", "DO $$ BEGIN IF to_regclass('vluce_rate_limits') IS NOT NULL THEN TRUNCATE vluce_rate_limits; END IF; END $$");
  // 1. The dealer signs in (first run: sets a password from the one-time setup link).
  await signInDealer(page);

  // 2. The dealer adds a car and makes it available, through the same endpoint the inventory screens use.
  sql("vl", "DELETE FROM intelligence_webhook_outbox");
  const branchId = sql("vl", "SELECT id FROM locations ORDER BY name LIMIT 1");
  expect(branchId).toBeTruthy();
  const added = await commands(page, [{ name: "addVehicle", args: [{ make: "Toyota", model: "Fortuner", variant: "Legender 4x4", year: "2023", fuel: "Diesel", transmission: "Automatic", km: "18500", owners: "1", registration: `KL 07 EE ${Date.now() % 10000}`, acquiredOn: new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10), branchId, status: "preparation", asking: "4650000", costs: { acquisition: "4200000", transport: "0", inspection: "0", refurbishment: "0", fees: "0" }, photos: "1", acknowledged: true }] }]);
  expect(added.status, JSON.stringify(added.body).slice(0, 300)).toBe(200);
  stockId = added.body.changes.vehicles[0].id;
  // Photos normally arrive through the media upload (blob storage, not configured locally); attach one on the shared record instead.
  sql("vl", `UPDATE vehicles SET payload = payload || '{"media":[{"id":"p1","url":"https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=1600","kind":"image"}]}'::jsonb, updated_at = now() + interval '1 second' WHERE stock_id = '${stockId}'`);
  const version = added.body.changes.vehicles[0].version;
  let live = await commands(page, [{ name: "transitionVehicle", args: [stockId, version, { to: "available" }] }]);
  if (live.status === 409) live = await commands(page, [{ name: "transitionVehicle", args: [stockId, live.body.error.latest.version, { to: "available" }] }]);
  expect(live.status, JSON.stringify(live.body).slice(0, 300)).toBe(200);

  // 3. The owner connects the website from its private /connect page (signs in with the Intelligence account).
  const site = await browser.newPage();
  await site.goto(`${SITE}/connect`);
  if (await site.getByRole("button", { name: "Connect Website" }).waitFor({ timeout: 5_000 }).then(() => true, () => false)) {
    await site.getByLabel("Intelligence email").fill(EMAIL);
    await site.getByLabel("Password").fill(PASSWORD);
    await site.getByRole("button", { name: "Connect Website" }).click();
  }
  await expect(site.getByText(/Connected to/).first()).toBeVisible({ timeout: 20_000 });
  expect(sql("vl", "SELECT scope || ' ' || coalesce(site_origin, '-') FROM intelligence_api_keys WHERE name LIKE 'Website:%' AND revoked_at IS NULL")).toBe(`website ${SITE}`);
  expect((await (await site.request.get(`${SITE}/api/health`)).json()).leads.destination).toBe("vandlabs");

  // 4. Publishing in Intelligence pushes a signed event; the website shows the car without waiting for its 5-minute refresh.
  await site.goto(`${SITE}/collection`);
  await expect(site.getByText("Fortuner")).toHaveCount(0);
  const pub = await commands(page, [{ name: "publishVehicles", args: [[stockId]] }]);
  expect(pub.status).toBe(200);
  await expect.poll(() => sql("vl", "SELECT status FROM intelligence_webhook_outbox ORDER BY created_at DESC LIMIT 1"), { timeout: 20_000 }).toBe("delivered");
  await expect.poll(async () => { await site.goto(`${SITE}/collection`); return site.getByText("Fortuner").count(); }, { timeout: 30_000 }).toBeGreaterThan(0);

  // 5. A customer on a phone finds the car and asks for a test drive.
  const phone = await browser.newContext({ ...devices["iPhone 13"] });
  const customer = await phone.newPage();
  await customer.goto(`${SITE}/collection?utm_source=instagram&utm_campaign=launch`);
  await customer.getByText("Fortuner").first().click();
  await expect(customer).toHaveURL(/\/collection\/.*fortuner/i);
  expect(await customer.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await customer.getByLabel("Name").fill("Meera Nair");
  await customer.getByLabel("Mobile").fill(`98${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`);
  await customer.locator("input[name=consent]").check();
  await customer.getByRole("button", { name: /request a viewing/i }).click();
  await expect(customer.getByText("Thank you — we have your enquiry.")).toBeVisible({ timeout: 20_000 });
  await expect(customer.getByText(/VL-[0-9A-Z]{5}-[0-9A-Z]{5}/)).toBeVisible();
  expect(sql("vluce_a", "SELECT status || ' ' || destination FROM vluce_leads WHERE payload->>'name' = 'Meera Nair' ORDER BY created_at DESC LIMIT 1")).toBe("delivered vandlabs");

  // 6. The lead is in Intelligence, on that car, typed as a test-drive request, ready for follow-up.
  await page.goto(`${INTEL}/app/leads`);
  await expect(page.getByText("Meera Nair").first()).toBeVisible({ timeout: 20_000 });
  const lead = JSON.parse(sql("vl", `SELECT data::text FROM intelligence_lead_index WHERE data->>'name' = 'Meera Nair' AND vehicle_stock_id = '${stockId}'`));
  expect(lead.vehicleId).toBe(stockId);
  expect(lead.source).toBe("Website");
  expect(lead.enquiry.type).toBe("test_drive");
  expect(lead.enquiry.attribution.utmSource).toBe("instagram");
  expect(lead.tasks[0].title).toBe("Confirm the test drive");

  // 7. Analytics: the visit and the car view were counted; the enquiry is counted from the real enquiry.
  await page.goto(`${INTEL}/app/website`);
  await expect(page.getByRole("heading", { name: "Website performance" })).toBeVisible();
  await expect.poll(() => sql("vl", "SELECT coalesce(sum(count), 0) FROM intelligence_website_metrics WHERE metric = 'vehicle_view' AND dimension = ''"), { timeout: 15_000 }).not.toBe("0");
  await page.reload();
  await expect(page.getByText("Most viewed cars")).toBeVisible();
  await expect(page.getByText("Test drive").first()).toBeVisible();

  // 8. The car is reserved for a buyer: it leaves the website promptly, and the website refuses new enquiries for it.
  const current = JSON.parse(sql("vl", `SELECT data::text FROM intelligence_vehicle_index WHERE stock_id = '${stockId}'`));
  const held = await commands(page, [{ name: "transitionVehicle", args: [stockId, current.version, { to: "reserved", note: "Booked by Meera Nair" }] }]);
  expect(held.status, JSON.stringify(held.body).slice(0, 300)).toBe(200);
  await expect.poll(async () => { await site.goto(`${SITE}/collection`); return site.getByText("Fortuner").count(); }, { timeout: 30_000 }).toBe(0);
  const late = await site.evaluate(async (s) => (await fetch("/api/enquiry", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "vehicle", stockId: s, name: "Late Buyer", phone: "98470 27182", consent: true, intent: "price" }) })).status, stockId);
  expect(late).toBe(404);
  await phone.close();
});

test("website-only dealership: enquiries reach its CRM, survive a CRM outage, and are never duplicated", async ({ page, request }) => {
  await request.get(`${CRM}/up`);
  // This test owns the website-only site's database: start from an empty queue.
  sql("vluce_b", "DO $$ BEGIN IF to_regclass('vluce_leads') IS NOT NULL THEN TRUNCATE vluce_leads CASCADE; TRUNCATE vluce_rate_limits; END IF; END $$");
  const tel = () => `98${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
  const crmLog = async () => (await (await request.get(`${CRM}/received`)).text()).trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const before = (await crmLog()).length;
  await page.goto(`${SITE_ONLY}/showroom`);
  await page.getByLabel("Name").fill("Arjun Menon");
  await page.getByLabel("Mobile").fill(tel());
  await page.locator("input[name=consent]").check();
  await page.getByRole("button", { name: /request appointment/i }).click();
  await expect(page.getByText("Thank you — we have your enquiry.")).toBeVisible({ timeout: 20_000 });
  let received = (await crmLog()).slice(before);
  expect(received).toHaveLength(1);
  expect(received[0].body.type).toBe("visit");
  expect(received[0].headers.sig).toMatch(/^sha256=/);
  expect(received[0].headers.idem).toBeTruthy();

  // The CRM goes down. The customer is still correctly told the enquiry was received: it is stored and queued.
  await request.get(`${CRM}/down`);
  await page.reload();
  await page.getByLabel("Name").fill("Divya Pillai");
  await page.getByLabel("Mobile").fill(tel());
  await page.locator("input[name=consent]").check();
  await page.getByRole("button", { name: /request appointment/i }).click();
  await expect(page.getByText("Thank you — we have your enquiry.")).toBeVisible({ timeout: 20_000 });
  const failed = await (await request.get(`${SITE_ONLY}/api/leads/failed`, { headers: { authorization: "Bearer local-admin-token-0123456789abcdef" } })).json();
  expect(failed.items).toHaveLength(1);
  expect(failed.items[0].status).toBe("retrying");
  expect(JSON.stringify(failed)).not.toContain("Divya");
  expect((await request.get(`${SITE_ONLY}/api/leads/failed`)).status()).toBe(401);

  // The CRM recovers; the scheduled job delivers the queued enquiry exactly once.
  await request.get(`${CRM}/up`);
  sql("vluce_b", "UPDATE vluce_leads SET next_attempt_at = now() WHERE status = 'retrying'");
  expect((await request.get(`${SITE_ONLY}/api/leads/retry`)).status()).toBe(401);
  const run = await (await request.get(`${SITE_ONLY}/api/leads/retry`, { headers: { authorization: "Bearer local-cron-secret-0123456789abcdef" } })).json();
  expect(run.delivered).toBe(1);
  await (await request.get(`${SITE_ONLY}/api/leads/retry`, { headers: { authorization: "Bearer local-cron-secret-0123456789abcdef" } })).json();
  received = (await crmLog()).slice(before);
  expect(received.map((r) => r.body.name)).toEqual(["Arjun Menon", "Divya Pillai"]);

  // A double submission (same idempotency key) is one enquiry.
  const key = `e2e-double-submit-${Date.now()}`;
  const send = () => page.evaluate(async (k) => (await fetch("/api/enquiry", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "general", name: "Rahul Das", phone: "98470 99887", consent: true, idempotencyKey: k }) })).json(), key);
  // (Same phone again within ten minutes with a new key would also be one enquiry: the fingerprint check.)
  const [a, b] = [await send(), await send()];
  expect(a.reference).toBe(b.reference);
  expect(b.duplicate).toBe(true);
  expect(sql("vluce_b", `SELECT count(*) FROM vluce_leads WHERE dedupe_key = 'k:${key}'`)).toBe("1");

  // The limit is shared through the site's database, so it holds across every server instance and restart.
  const statuses: number[] = [];
  for (let i = 0; i < 4; i++) statuses.push(await page.evaluate(async (n) => (await fetch("/api/enquiry", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "general", name: "Flood Test", phone: `9847${String(n).padStart(6, "0")}`, consent: true }) })).status, i + Date.now() % 100000));
  expect(statuses.at(-1)).toBe(429);
  expect(Number(sql("vluce_b", "SELECT count(*) FROM vluce_rate_limits"))).toBeGreaterThan(0);
});

test("a production website with no enquiry destination says so instead of pretending", async ({ page }) => {
  await page.goto(`${SITE_BARE}/showroom`);
  await page.getByLabel("Name").fill("Test Visitor");
  await page.getByLabel("Mobile").fill("98470 00001");
  await page.locator("input[name=consent]").check();
  await page.getByRole("button", { name: /request appointment/i }).click();
  await expect(page.locator(".form-error[role=alert]")).toContainText("Online enquiries are not available");
  await expect(page.getByText("Thank you — we have your enquiry.")).toHaveCount(0);
});
