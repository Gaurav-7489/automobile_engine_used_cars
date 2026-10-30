import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

/**
 * Automated WCAG 2.2 AA checks (axe-core rule tags wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa) in both themes and at desktop and phone widths, plus a
 * phone-width overflow check and visual-regression snapshots of the data-independent pages. Automated checks find a subset of problems; they do not replace
 * manual review with assistive technology.
 *
 * Authenticated pages need LOCAL_SCALE_USER / LOCAL_SCALE_PASSWORD (a synthetic account in a local test database); public pages always run.
 */
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const user = process.env.LOCAL_SCALE_USER, password = process.env.LOCAL_SCALE_PASSWORD ?? "";
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const THEMES = ["dark", "light"] as const;
const VIEWPORTS = { desktop: { width: 1366, height: 860 }, phone: { width: 390, height: 844 } } as const;

async function scan(page: Page) {
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(async (tags) => {
    // @ts-expect-error axe is injected
    const result = await window.axe.run(document, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations"] });
    return result.violations.map((v: { id: string; impact: string; help: string; nodes: { target: string[]; failureSummary?: string }[] }) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 4).map((n) => `${n.target.join(" ")} :: ${(n.failureSummary ?? "").split("\n").slice(0, 2).join(" ")}`) }));
  }, TAGS);
}
async function settled(page: Page) {
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 20_000 }).catch(() => undefined);
  // Panels reveal as they scroll into view; walk the page once so every panel is at rest, then measure from the top.
  await page.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } window.scrollTo(0, 0); });
  await page.waitForTimeout(900);
}
async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/business email/i).fill(user!);
  await page.getByLabel(/^password/i).fill(password);
  await page.getByRole("button", { name: /^sign in/i }).click();
  await page.waitForURL(/\/app\//);
}

const PUBLIC = ["/login", "/info/privacy", "/install", "/showroom", "/showroom/inventory", "/showroom/vehicles/toyota-fortuner-4x4-2022", "/showroom/saved", "/showroom/discover?q=automatic%20SUV", "/showroom/contact", "/showroom/compare?cars=toyota-fortuner-4x4-2022,skoda-kodiaq-lk-2023"];
const PRIVATE = ["/app/overview", "/app/inventory", "/app/leads", "/app/capital", "/app/alerts", "/app/reports", "/app/stock-intelligence", "/app/automations", "/app/settings/billing", "/app/settings/team", "/app/settings/api", "/app/settings/audit"];

for (const theme of THEMES) for (const [vp, size] of Object.entries(VIEWPORTS)) {
  test.describe(`${theme} / ${vp}`, () => {
    test.use({ colorScheme: theme, viewport: size });

    for (const path of PUBLIC) {
      test(`public ${path}: no WCAG 2.2 AA violations, no horizontal overflow`, async ({ page }) => {
        await page.goto(path);
        await settled(page);
        expect(await scan(page), path).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "horizontal overflow").toBe(true);
      });
    }

  });
}

// One sign-in per viewport (the sign-in endpoint is rate limited); both themes are checked in that session.
for (const [vp, size] of Object.entries(VIEWPORTS)) {
  test(`signed-in pages / ${vp}: no WCAG 2.2 AA violations and no horizontal overflow, in both themes`, async ({ page }) => {
    test.skip(!user, "LOCAL_SCALE_USER is not set");
    test.setTimeout(300_000);
    await page.setViewportSize(size);
    await signIn(page);
    const failures: string[] = [];
    for (const theme of THEMES) {
      await page.emulateMedia({ colorScheme: theme });
      for (const path of PRIVATE) {
        await page.goto(path);
        await settled(page);
        const violations = await scan(page);
        if (violations.length) failures.push(`${theme} ${path}: ${JSON.stringify(violations)}`);
        if (!(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))) failures.push(`${theme} ${path}: horizontal overflow at ${size.width}px`);
      }
    }
    expect(failures).toEqual([]);
  });
}

// Overlays are part of the product too: the search sheet, a form dialog and the profile menu, in both themes.
test("overlays: search, rule dialog and profile menu have no WCAG 2.2 AA violations in either theme", async ({ page }) => {
  test.skip(!user, "LOCAL_SCALE_USER is not set");
  test.setTimeout(180_000);
  await page.setViewportSize(VIEWPORTS.desktop);
  await signIn(page);
  const failures: string[] = [];
  for (const theme of THEMES) {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto("/app/overview"); await settled(page);
    await page.keyboard.press("/"); await expect(page.getByRole("dialog")).toBeVisible(); await page.waitForTimeout(500);
    failures.push(...(await scan(page)).map((v) => `${theme} search: ${JSON.stringify(v)}`));
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /^Profile menu/ }).click(); await expect(page.getByRole("menu")).toBeVisible(); await page.waitForTimeout(600);
    failures.push(...(await scan(page)).map((v) => `${theme} profile menu: ${JSON.stringify(v)}`));
    await page.keyboard.press("Escape");
    await page.goto("/app/automations"); await settled(page);
    await page.getByRole("button", { name: /new rule/i }).first().click(); await expect(page.getByRole("dialog", { name: /new rule/i })).toBeVisible(); await page.waitForTimeout(500); // let the entrance animation finish: contrast is measured on the settled surface
    failures.push(...(await scan(page)).map((v) => `${theme} rule dialog: ${JSON.stringify(v)}`));
    await page.keyboard.press("Escape");
  }
  expect(failures).toEqual([]);
});

// Visual regression: pages whose content does not depend on data or the date. Update with `--update-snapshots` after an intended design change.
for (const theme of THEMES) for (const [vp, size] of Object.entries(VIEWPORTS)) {
  test.describe(`visual ${theme} / ${vp}`, () => {
    test.use({ colorScheme: theme, viewport: size });
    for (const path of ["/login", "/info/privacy"]) {
      test(`${path} matches its baseline`, async ({ page }) => {
        await page.goto(path);
        await settled(page);
        await expect(page).toHaveScreenshot(`${path.replace(/\W+/g, "-").replace(/^-/, "")}-${theme}-${vp}.png`, { maxDiffPixelRatio: 0.01, animations: "disabled", fullPage: true });
      });
    }
  });
}

test("the theme choice is applied before paint and persists", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "System", exact: true }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
});
