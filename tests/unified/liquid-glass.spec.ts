import { test, expect, type Page } from "@playwright/test";

/** GPU Liquid Glass on the public routes: it starts, draws real surfaces, never blurs with CSS, recovers from context loss and steps aside when asked. */
type Stats = { status: string; surfaces: number; drawn: number; frames: number; fps: number };
const stats = (page: Page) => page.evaluate(() => (window as unknown as { __vlGlass?: { stats: () => Stats } }).__vlGlass?.stats() ?? null);
const state = (page: Page) => page.evaluate(() => document.documentElement.getAttribute("data-liquid-glass"));

for (const path of ["/login", "/showroom", "/showroom/inventory", "/info/privacy", "/request-access", "/install"]) {
  test(`optical glass on ${path}: drawn, no CSS blur, no overflow, no errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(path);
    await expect.poll(() => state(page), { timeout: 15000 }).toMatch(/gpu|fallback/);
    if ((await state(page)) === "gpu") {
      await expect.poll(async () => (await stats(page))?.drawn ?? 0, { timeout: 10000 }).toBeGreaterThan(0);
      expect(await page.locator(".lg-on").count()).toBeGreaterThan(0);
    }
    const blurred = await page.evaluate(() => [...document.querySelectorAll("*")].filter((e) => getComputedStyle(e).backdropFilter !== "none").length);
    expect(blurred).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test("both themes render glass, and the theme switch keeps it running", async ({ page }) => {
  await page.goto("/showroom");
  await expect.poll(() => state(page), { timeout: 15000 }).toBe("gpu");
  const before = (await stats(page))!.frames;
  await page.evaluate(() => { document.documentElement.setAttribute("data-theme", "light"); });
  await expect.poll(async () => (await stats(page))!.frames, { timeout: 5000 }).toBeGreaterThan(before);
  await page.evaluate(() => { document.documentElement.setAttribute("data-theme", "dark"); });
  expect((await stats(page))!.status).toBe("running");
});

test("a lost WebGL context is recovered", async ({ page }) => {
  await page.goto("/showroom");
  await expect.poll(() => state(page), { timeout: 15000 }).toBe("gpu");
  await page.evaluate(() => {
    const gl = document.querySelector<HTMLCanvasElement>(".lg-canvas")!.getContext("webgl2")!;
    const ext = gl.getExtension("WEBGL_lose_context")!;
    ext.loseContext();
    setTimeout(() => ext.restoreContext(), 300);
  });
  await expect.poll(() => state(page), { timeout: 5000 }).toBe("fallback");
  await expect.poll(() => state(page), { timeout: 8000 }).toBe("gpu");
});

test("reduced transparency gets solid materials and no GPU work", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (q: string) => (q.includes("prefers-reduced-transparency") ? { ...real(q), matches: true, addEventListener() {}, removeEventListener() {} } as MediaQueryList : real(q));
  });
  await page.goto("/showroom");
  await expect.poll(() => state(page), { timeout: 15000 }).toBe("off");
  expect(await page.locator(".lg-canvas").count()).toBe(0);
  await context.close();
});

test("choosing Solid in settings storage switches the engine off", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("vl-glass", "off"));
  await page.goto("/login");
  await expect.poll(() => state(page), { timeout: 15000 }).toBe("off");
});
