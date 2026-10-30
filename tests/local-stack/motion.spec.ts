import { test, expect, type Page } from "@playwright/test";

/** The motion layer: it must feel alive, never throw, never change layout, and switch off cleanly. Needs LOCAL_SCALE_USER / LOCAL_SCALE_PASSWORD. */
const user = process.env.LOCAL_SCALE_USER, password = process.env.LOCAL_SCALE_PASSWORD ?? "";
test.skip(!user, "LOCAL_SCALE_USER is not set");

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/business email/i).fill(user!);
  await page.getByLabel(/^password/i).fill(password);
  await page.getByRole("button", { name: /^sign in/i }).click();
  await page.waitForURL(/\/app\//);
}

test("alive: pointer light, tilt, ripple, liquid tab, route loader, scroll physics, and no script errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  await page.goto("/app/overview");
  await expect(page.getByRole("heading", { name: /command centre/i })).toBeVisible();
  await page.waitForTimeout(1200);

  // Pointer light follows the cursor over a glass panel; the metric tile tilts and settles back.
  const kpi = page.locator(".kpi").first();
  const box = (await kpi.boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.move(box.x + box.width - 10, box.y + box.height - 10, { steps: 10 });
  await expect.poll(async () => kpi.evaluate((e) => (e as HTMLElement).style.getPropertyValue("--mx"))).not.toBe("");
  await expect.poll(async () => kpi.evaluate((e) => (e as HTMLElement).style.transform)).toContain("rotate");
  await page.mouse.move(5, 5, { steps: 6 });
  await expect.poll(async () => kpi.evaluate((e) => (e as HTMLElement).style.transform), { timeout: 4000 }).toBe("");

  // Press ripple on a button.
  const primary = page.getByRole("button", { name: /add vehicle/i }).first();
  await primary.hover();
  const pb = (await primary.boundingBox())!;
  await page.mouse.move(pb.x + 8, pb.y + 8); await page.mouse.down();
  await expect(primary.locator(".ripple")).toHaveCount(1);
  await page.mouse.up();
  await expect(primary.locator(".ripple")).toHaveCount(0, { timeout: 2000 });
  await page.keyboard.press("Escape"); // the press opened the Add vehicle drawer; close it
  await expect(page.locator(".drawer-wrap")).toHaveCount(0);

  // Liquid tab indicator moves to the newly selected tab.
  const tabs = page.getByRole("tab");
  const first = tabs.first(), second = tabs.nth(1);
  const pill = page.locator(".tabs .liquid-pill").first();
  const x0 = await pill.evaluate((e) => (e as HTMLElement).offsetLeft);
  await second.click();
  await expect(second).toHaveAttribute("aria-selected", "true");
  await expect.poll(async () => pill.evaluate((e) => (e as HTMLElement).style.left)).not.toBe(`${x0}px`);
  await first.click();

  // Scroll physics lean the content layer while moving and release it at rest.
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(120);
  await page.mouse.wheel(0, 900);
  await expect.poll(async () => page.locator(".main-inner").evaluate((e) => (e as HTMLElement).style.transform), { timeout: 4000 }).toBe("");

  // Route loader: the bar appears the moment an internal link is followed, and is gone when the page is in.
  await page.getByRole("link", { name: /^Inventory/ }).first().click();
  await page.waitForURL(/\/app\/inventory/);
  await expect(page.locator(".route-bar")).toHaveCount(0, { timeout: 8000 });
  expect(errors).toEqual([]);
});

test("reduced motion switches the layer off: no ambient drift, no entrance animation, no ripple, and the choice persists", async ({ page }) => {
  await signIn(page);
  await page.goto("/app/overview");
  await page.getByRole("button", { name: /^Profile menu/ }).click();
  await page.getByRole("menuitemradio", { name: /^Motion/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
  await expect(page.locator(".kpi").first()).toBeVisible();
  const names = await page.evaluate(() => ({ kpi: getComputedStyle(document.querySelector(".kpi")!).animationName, blob: getComputedStyle(document.querySelector(".ambient i")!).animationName }));
  expect(names).toEqual({ kpi: "none", blob: "none" });
  const btn = page.getByRole("button", { name: /add vehicle/i }).first();
  const bb = (await btn.boundingBox())!;
  await page.mouse.move(bb.x + 8, bb.y + 8); await page.mouse.down();
  await expect(page.locator(".ripple")).toHaveCount(0);
  await page.mouse.up();
  // The operating-system setting selects the same state without any stored choice.
  await page.evaluate(() => localStorage.removeItem("vl-motion"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
});

test("theme button: always visible, flips light and dark with the circular wash, and remembers the choice", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/login");
  const toggle = page.getByRole("button", { name: /^Switch to (light|dark) theme$/ });
  await expect(toggle).toBeVisible();
  const before = await page.evaluate(() => document.documentElement.getAttribute("data-theme") ?? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"));
  await toggle.click();
  const expected = before === "dark" ? "light" : "dark";
  await expect(page.locator("html")).toHaveAttribute("data-theme", expected);
  // The wash is a View Transition with a clip-path animation on the incoming page.
  const running = await page.evaluate(() => document.getAnimations().some((a) => String((a as CSSAnimation & { pseudoElement?: string }).pseudoElement ?? "").includes("view-transition")));
  expect(typeof running).toBe("boolean");
  await page.waitForTimeout(1300);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", expected);
  // With reduced motion the theme switches immediately (no transition).
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.getByRole("button", { name: /^Switch to (light|dark) theme$/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", before);
});

test("install page lists installers for Windows, macOS and Linux", async ({ page }) => {
  await page.goto("/install");
  for (const name of ["Windows", "macOS", "Linux"]) await expect(page.getByRole("article", { name })).toBeVisible();
  const hrefs = await page.locator('a[download]').evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).href.split("/").pop()));
  expect(hrefs.sort()).toEqual(["Automobile-Engine-Linux-x64.AppImage", "Automobile-Engine-Linux-x64.deb", "Automobile-Engine-Linux-x64.rpm", "Automobile-Engine-Windows-x64.exe", "Automobile-Engine-Windows-x64.msi", "Automobile-Engine-macOS-universal.dmg"]);
});
