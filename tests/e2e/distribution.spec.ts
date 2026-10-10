import { test, expect } from "@playwright/test";

test("featured collection supports keyboard selection and the footer has readable contrast", async ({ page }) => {
  await page.goto("/");
  const choices = page.getByRole("group", { name: "Choose a featured car" }).getByRole("button");
  await expect(choices).toHaveCount(3);
  const second = choices.nth(1);
  const name = (await second.getAttribute("aria-label"))!.replace(/^Feature /, "");
  await second.focus();
  await page.keyboard.press("Space");
  await expect(second).toHaveAttribute("aria-pressed", "true");
  await expect(choices.first()).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".hero-vehicle strong")).toHaveText(name);
  await expect(page.locator(".hero-vehicle")).toHaveAttribute("href", /^\/vehicles\/[a-z0-9-]+$/);
  await choices.first().focus();
  await page.keyboard.press("Enter");
  await expect(choices.first()).toHaveAttribute("aria-pressed", "true");

  const contrast = await page.locator("footer").evaluate(footer => {
    const luminance = (color: string) => {
      const rgb = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(value => {
        const channel = value / 255;
        return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
      });
      return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
    };
    const bg = luminance(getComputedStyle(footer).backgroundColor);
    return Array.from(footer.querySelectorAll("p, a, .footer-bottom span, .design-credits")).map(element => {
      const fg = luminance(getComputedStyle(element).color);
      return { text: element.textContent?.trim(), ratio: (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05) };
    });
  });
  for (const item of contrast) expect(item.ratio, item.text).toBeGreaterThanOrEqual(4.5);
});

test("desktop distribution has honest availability, safe routes and responsive product surfaces", async ({ page, request }, testInfo) => {
  await page.goto("/download");
  await expect(page.getByRole("heading", { name: "A workspace that moves with you." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Enter your workspace URL." })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("desktop-downloads.png"), fullPage: true });
  const unavailable = await request.get("/api/downloads/linux");
  expect(unavailable.status()).toBe(404);
  expect(unavailable.headers()["x-content-type-options"]).toBe("nosniff");
  const desktopConfig = await request.get("http://127.0.0.1:3001/command/api/desktop-config");
  expect(desktopConfig.status()).toBe(503);
  expect((await desktopConfig.json()).clientId).toBeUndefined();

  for (const [name, url] of [["showroom", "/"], ["dealer-workspace", "http://127.0.0.1:3001/command"], ["platform", "http://127.0.0.1:3002/platform"]]) {
    await page.goto(url);
    await expect(page.locator("h1")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(name + ".png"), fullPage: true });
  }
  await expect(page.getByRole("navigation", {name:"Platform navigation"}).getByRole("link",{name:"Overview"})).toHaveAttribute("aria-current","page");
});

test("public writes reject foreign origins and oversized event bodies before persistence", async ({ request }) => {
  const foreign = await request.post("/api/leads", {headers:{origin:"https://foreign.example"},data:{name:"Foreign origin",phone:"123"}});
  expect(foreign.status()).toBe(403);
  const oversized = await request.post("/api/events", {data:{type:"page_view",sessionId:"bounded-test",path:"x".repeat(9000)}});
  expect(oversized.status()).toBe(400);
  const malformed = await request.post("/api/events", {data:"{broken",headers:{"Content-Type":"application/json"}});
  expect(malformed.status()).toBe(400);
});
