import { test, expect, type Page } from "@playwright/test";

/**
 * Layout at every common width, phone to wide desktop: no sideways scrolling, nothing past the right edge,
 * and no label crushed into a column one word wide. On phone widths the Menu sheet is opened and checked too.
 *
 * Signed-in pages need LOCAL_SCALE_USER / LOCAL_SCALE_PASSWORD (a synthetic account in a local test database).
 */
const user = process.env.LOCAL_SCALE_USER, password = process.env.LOCAL_SCALE_PASSWORD ?? "";
const WIDTHS = [320, 360, 393, 430, 600, 768, 820, 1024, 1180, 1280, 1440, 1920];
const PUBLIC = ["/login", "/install", "/info/privacy", "/showroom", "/showroom/discover?q=automatic%20SUV", "/showroom/inventory", "/showroom/vehicles/toyota-fortuner-4x4-2022", "/showroom/saved", "/showroom/compare?cars=toyota-fortuner-4x4-2022,skoda-kodiaq-lk-2023", "/showroom/contact"];
const PRIVATE = ["/app/overview", "/app/market", "/app/inventory", "/app/pricing", "/app/advertising", "/app/leads", "/app/capital", "/app/alerts", "/app/reports", "/app/stock-intelligence", "/app/acquisition", "/app/automations",
  ...["business", "branches", "team", "security", "integrations", "billing", "api", "notifications", "audit"].map((s) => `/app/settings/${s}`)];

/** Returns human-readable layout problems on the current page. */
function problems(page: Page, scope = "body") {
  return page.evaluate((scope) => {
    const out: string[] = [];
    const vw = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > vw + 1) out.push(`page scrolls sideways (${document.documentElement.scrollWidth} > ${vw})`);
    const root = document.querySelector(scope) ?? document.body;
    const describe = (el: Element) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : ""} "${(el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40)}"`;
    // Inside a horizontal scroller (tables, tab strips) overflow is intended.
    const inScroller = (el: Element) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll" || o === "hidden" || o === "clip") return true; } return false; };
    for (const el of Array.from(root.querySelectorAll("a, button, label, h1, h2, h3, p, th, td, li, span, strong, input, select"))) {
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      if (!r.width || !r.height || cs.visibility === "hidden" || cs.display === "none" || el.closest("[aria-hidden='true'], .sr-only")) continue;
      if (r.right > vw + 1 && !inScroller(el)) out.push(`past right edge by ${Math.round(r.right - vw)}px: ${describe(el)}`);
      const text = (el.textContent ?? "").trim();
      const words = text.split(/\s+/).filter(Boolean);
      // A label of 2+ words broken onto one line per word: squeezed into a column too narrow for it.
      if (words.length >= 2 && words.length <= 6 && !inScroller(el)) {
        // Only the label's own words: one direct text node holding the whole label, measured word by word.
        const own = Array.from(el.childNodes).filter((n) => n.nodeType === 3 && n.textContent!.trim());
        if (own.length !== 1 || own[0].textContent!.trim().split(/\s+/).length < 2) continue;
        const range = document.createRange(); range.selectNodeContents(own[0]);
        const lines = new Set(Array.from(range.getClientRects()).filter((q) => q.width > 0).map((q) => Math.round(q.top / 4))).size;
        if (lines >= own[0].textContent!.trim().split(/\s+/).length) out.push(`squeezed (${Math.round(r.width)}px wide, ${lines} lines): ${describe(el)}`);
      }
    }
    return [...new Set(out)].slice(0, 12);
  }, scope);
}
async function settle(page: Page) {
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 20_000 }).catch(() => undefined);
  await page.waitForTimeout(500);
}

test("public pages fit every width", async ({ page }) => {
  test.setTimeout(600_000);
  const found: string[] = [];
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of PUBLIC) { await page.goto(path); await settle(page); for (const p of await problems(page)) found.push(`${width}px ${path}: ${p}`); }
  }
  expect(found).toEqual([]);
});

test("signed-in pages and the phone Menu fit every width", async ({ page }) => {
  test.skip(!user, "Set LOCAL_SCALE_USER and LOCAL_SCALE_PASSWORD for a synthetic account in a local test database.");
  test.setTimeout(1_200_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/login");
  await page.getByLabel(/business email/i).fill(user!);
  await page.getByLabel(/^password/i).fill(password);
  await page.getByRole("button", { name: /^sign in/i }).click();
  await page.waitForURL(/\/app\//);
  const found: string[] = [];
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of PRIVATE) { await page.goto(path); await settle(page); for (const p of await problems(page)) found.push(`${width}px ${path}: ${p}`); }
    if (width < 768) {
      await page.goto("/app/leads"); await settle(page);
      await page.getByRole("button", { name: "Menu" }).click();
      const menu = page.getByRole("dialog", { name: "Menu" });
      await expect(menu).toBeVisible();
      for (const p of await problems(page, "[role=dialog]")) found.push(`${width}px Menu: ${p}`);
      // Every destination reads on one line, next to its icon.
      for (const link of await menu.getByRole("navigation").getByRole("link").all()) {
        const box = await link.boundingBox();
        if (box && box.height > 52) found.push(`${width}px Menu: link wraps (${Math.round(box.height)}px tall): ${await link.innerText()}`);
      }
      // The sheet is solid: the page underneath does not show through.
      const bg = await menu.evaluate((el) => getComputedStyle(el).backgroundColor);
      if (/rgba\(.*,\s*0?\.\d+\)$/.test(bg)) found.push(`${width}px Menu: see-through background ${bg}`);
      await page.keyboard.press("Escape");
    }
  }
  expect(found).toEqual([]);
});
