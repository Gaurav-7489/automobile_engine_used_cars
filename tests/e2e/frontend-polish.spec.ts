import { test, expect } from "@playwright/test";

const command = "http://127.0.0.1:3001/command";
const platform = "http://127.0.0.1:3002/platform";

test("responsive menus preserve route state, keyboard dismissal and mobile sign-out", async ({ page }, info) => {
  test.setTimeout(60000);
  for (const width of [375, 820, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [name, path, next, menu, mobileNav] of [
      ["public", "/inventory", "/saved", "Website menu", "Primary mobile"],
      ["dealer", command + "/inventory", command + "/leads", "Command Center menu", "Command Center mobile"],
      ["platform", platform + "/health", platform + "/staff", "Platform menu", "Platform mobile"],
    ]) {
      await page.goto(path);
      await expect(page.getByRole("main")).toBeVisible();
      const summary = page.getByLabel(menu, { exact: true });
      if (width < 960 || (name !== "public" && width <= 1050)) {
        await summary.focus(); await page.keyboard.press("Enter");
        const navigation = page.getByRole("navigation", { name: mobileNav, exact: true });
        await expect(navigation).toBeVisible();
        await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
        if (name !== "public") await expect(summary).toContainText((await navigation.locator('[aria-current="page"]').textContent())!);
        if (name !== "public") {
          await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
          await expect(page.locator(".workspace-menu form")).toHaveAttribute("method", "post");
          await expect(page.locator(".workspace-menu form")).toHaveAttribute("action", name === "dealer" ? "/command/auth/logout" : "/platform/auth/logout");
        }
        await page.keyboard.press("Escape");
        await expect(navigation).not.toBeVisible(); await expect(summary).toBeFocused();
        await summary.click();
        await navigation.locator(`a[href="${new URL(next, "http://127.0.0.1:3000").pathname}"]`).click();
        await expect(page).toHaveURL(new RegExp(new URL(next, "http://127.0.0.1:3000").pathname + "$"));
        await expect(page.locator("details.workspace-menu[open], details.public-menu[open]")).toHaveCount(0);
        await summary.click();
        await expect(navigation.locator('[aria-current="page"]')).toHaveAttribute("href", new URL(next, "http://127.0.0.1:3000").pathname);
        await page.screenshot({ path: info.outputPath(`${name}-menu-${width}.png`) });
      } else {
        await expect(summary).not.toBeVisible();
        // Page-level filter links (nav.ck-filters) mark their own current choice; this asserts the app navigation alone.
        await expect(page.locator('nav:not(.ck-filters) [aria-current="page"]:visible')).toHaveCount(1);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  }
});

test("mobile collection keeps search visible and all filters remain available", async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/inventory?q=BMW&sort=price-low");
  await expect(page.getByRole("textbox", { name: "Search the collection" })).toHaveValue("BMW");
  const toggle = page.getByRole("button", { name: "Filters", exact: true });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("combobox", { name: "Sort", exact: true })).not.toBeVisible();
  await toggle.click();
  await expect(page.getByRole("combobox", { name: "Sort", exact: true })).toHaveValue("price-low");
  await page.getByRole("combobox", { name: "Fuel", exact: true }).selectOption("diesel");
  await expect(page).toHaveURL(/fuel=diesel/);
  await toggle.click();
  await expect(page.getByRole("button", { name: "Remove fuel filter" })).toBeVisible();
  await page.reload();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(page.getByRole("combobox", { name: "Fuel", exact: true })).toHaveValue("diesel");
  await page.getByRole("button", { name: "Reset all", exact: true }).click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("textbox", { name: "Search the collection" })).toHaveValue("");
  await page.screenshot({ path: info.outputPath("compact-mobile-inventory.png") });
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(toggle).not.toBeVisible();
  await expect(page.getByRole("combobox", { name: "Sort", exact: true })).toBeVisible();
});

test("public skip link and comparison scrolling work with a keyboard", async ({ page }) => {
  await page.goto("/compare?ids=veh-2,veh-4,veh-1");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  const comparison = page.getByRole("region", { name: "Vehicle comparison details" });
  await comparison.focus(); await expect(comparison).toBeFocused();
  await expect(comparison.getByRole("table")).toBeVisible();
});

test("enquiry failures explain the recovery and retain entered details", async ({ page }) => {
  await page.goto("/contact");
  await page.getByLabel("Name", { exact: true }).fill("Recovery QA");
  await page.getByLabel("Phone", { exact: true }).fill("9000000199");
  for (const [status, expected] of [[400, "Check your details"], [429, "Too many requests"], [503, "temporarily unavailable"]] as const) {
    await page.route("**/api/leads", route => route.fulfill({ status, contentType: "application/json", body: '{"error":"internal provider detail"}' }));
    await page.getByRole("button", { name: "Send request", exact: true }).click();
    await expect(page.getByRole("form", { name: "Vehicle enquiry" }).getByRole("alert")).toContainText(expected);
    await expect(page.getByRole("form", { name: "Vehicle enquiry" }).getByRole("alert")).not.toContainText("internal provider detail");
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Recovery QA");
    await expect(page.getByRole("button", { name: "Send request", exact: true })).toBeEnabled();
    await page.unroute("**/api/leads");
  }
  await page.route("**/api/leads", route => route.abort("failed"));
  await page.getByRole("button", { name: "Send request", exact: true }).click();
  await expect(page.getByRole("form", { name: "Vehicle enquiry" }).getByRole("alert")).toContainText("It may have been received");
});

test("share fallback clears when the inventory search changes", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("Clipboard unavailable")) } }));
  await page.goto("/inventory?q=BMW");
  await page.getByRole("button", { name: "Share search" }).click();
  await expect(page.getByRole("textbox", { name: "Shareable link" })).toHaveValue(/q=BMW/);
  await page.getByRole("textbox", { name: "Search the collection" }).fill("Audi");
  await expect(page.getByRole("textbox", { name: "Shareable link" })).toHaveCount(0);
  await page.getByRole("button", { name: "Share search" }).click();
  await expect(page.getByRole("textbox", { name: "Shareable link" })).toHaveValue(/q=Audi/);
});

test("all staff sections stay within a narrow screen", async ({ page }, info) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 360, height: 800 });
  for (const [base, sections] of [
    [command, ["", "leads", "pipeline", "tasks", "appointments", "inventory", "customers", "analytics", "intelligence", "capital", "automation", "settings"]],
    [platform, ["", "dealerships", "organizations", "onboarding", "health", "integrations", "features", "audit", "staff"]],
  ] as const) {
    for (const section of sections) {
      await page.goto(base + (section ? "/" + section : ""));
      await expect(page.getByRole("main")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${base}/${section}`).toBe(true);
      if (base === command && section === "inventory") {
        const inventory = page.getByRole("table", { name: "Dealership inventory" });
        const row = inventory.getByRole("row").nth(1);
        await expect(row.getByRole("cell")).toHaveCount(7);
        const controls = row.getByRole("button", { name: "Manage inventory", exact: true });
        await expect(controls).toHaveAttribute("aria-expanded", "false");
        await expect(row.getByRole("button", { name: "Save inventory", exact: true })).not.toBeVisible();
        await controls.click();
        await expect(row.getByRole("button", { name: "Save inventory", exact: true })).toBeVisible();
        await controls.click();
        expect(await row.evaluate(element => element.getBoundingClientRect().height)).toBeLessThan(420);
      }
      if (base === platform && section === "staff") {
        const role = page.getByRole("combobox", { name: "Role", exact: true });
        await expect(role).toHaveCSS("appearance", "none");
        await expect(role).toHaveCSS("color", "rgb(239, 243, 230)");
      }
      if (["inventory", "staff"].includes(section)) await page.screenshot({ path: info.outputPath(`${base.includes("command") ? "dealer" : "platform"}-${section}-narrow.png`), fullPage: info.project.name !== "mobile" });
    }
  }
});


test("native mobile menu stays open when delayed JavaScript hydrates", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  let release!: () => void;
  const scripts = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/_next/static/**/*.js", async route => { await scripts; await route.continue(); });
  try {
    await page.goto(platform + "/health", { waitUntil: "commit" });
    const summary = page.getByLabel("Platform menu", { exact: true });
    await summary.click();
    await expect(page.locator("details.workspace-menu")).toHaveAttribute("open", "");
    release();
    await page.waitForLoadState("load");
    await expect(page.getByRole("navigation", { name: "Platform mobile", exact: true })).toBeVisible();
    // Retrying the keyboard action waits for its React handler without a fixed sleep.
    await expect(async () => {
      await summary.press("Escape");
      await expect(page.locator("details.workspace-menu")).not.toHaveAttribute("open", "");
    }).toPass();
    await summary.click();
    const navigation = page.getByRole("navigation", { name: "Platform mobile", exact: true });
    await expect(navigation).toBeVisible();
    await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
  } finally { release(); }
});

test("short desktop workspace keeps lower navigation and sign-out reachable", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 600 });
  await page.goto(command + "/inventory");
  const sidebar = page.locator(".sidebar");
  const settings = sidebar.getByRole("link", { name: "Settings", exact: true });
  await settings.focus();
  await expect(settings).toBeInViewport();
  await expect(settings).toBeFocused();
  expect(await sidebar.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await page.keyboard.press("Tab");
  const logout = sidebar.getByRole("button", { name: "Sign out", exact: true });
  await expect(logout).toBeFocused();
  await expect(logout).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
