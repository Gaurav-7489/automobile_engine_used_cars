import { test, expect, type Page } from "@playwright/test";

const command = "http://127.0.0.1:3001/command";
const feed = (page: Page) => page.getByRole("feed", { name: "Matching cars, one at a time" });
const activeTitle = (page: Page) => page.locator(".reel-slide.is-active h2");

test("a conversational search refines the same results and the browser history keeps each turn", async ({ page }, info) => {
  await page.goto("/");
  const ask = page.getByRole("search", { name: "Ask for a car" });
  await ask.getByRole("textbox").fill("SUV under 70 lakh");
  await ask.getByRole("textbox").press("Enter");
  await expect(page).toHaveURL(/\/discover\?q=SUV\+under\+70\+lakh/);
  if (info.project.name === "mobile") await page.getByRole("button", { name: /Your search/ }).click();
  const understood = page.locator(".understood");
  await expect(understood.getByText("SUV", { exact: true })).toBeVisible();
  await expect(understood.getByText("Up to ₹70 lakh")).toBeVisible();
  const first = await feed(page).getByRole("article").count();
  expect(first).toBeGreaterThan(1);

  const refine = page.getByRole("search", { name: "Refine your search" }).getByRole("textbox");
  await refine.fill("only diesel");
  await refine.press("Enter");
  await expect(page).toHaveURL(/q=only\+diesel/);
  if (info.project.name === "mobile") await page.getByRole("button", { name: /Your search/ }).click();
  await expect(page.locator(".understood").getByText("Diesel", { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Conversation" }).getByText("only diesel")).toBeVisible();
  const refined = await feed(page).getByRole("article").count();
  expect(refined).toBeLessThan(first);
  for (const fact of await page.locator(".reel-slide:not(.is-placeholder) .reel-facts").allTextContents()) expect(fact).toContain("Diesel");

  await page.goBack();
  await expect(page).not.toHaveURL(/only\+diesel/);
  await expect(feed(page).getByRole("article")).toHaveCount(first);
  await page.goForward();
  await expect(feed(page).getByRole("article")).toHaveCount(refined);

  if (info.project.name === "mobile") await page.getByRole("button", { name: /Your search/ }).click();
  await page.getByRole("link", { name: "Remove Diesel" }).click();
  await expect(page).toHaveURL(/q=any\+fuel/);
  await expect(feed(page).getByRole("article")).toHaveCount(first);
});

test("the reel moves one car at a time by keyboard and restores the car from the address", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "Keyboard navigation is a desktop interaction; touch uses native scroll snapping.");
  await page.goto("/discover");
  await expect(page.getByRole("heading", { level: 1, name: "Discover cars" })).toBeVisible();
  const total = Number((await page.locator(".reel-nav-rail small").textContent())!.replace("/", ""));
  expect(total).toBeGreaterThan(8);
  const firstTitle = await activeTitle(page).textContent();
  await feed(page).focus();
  await page.keyboard.press("ArrowDown");
  await expect(activeTitle(page)).not.toHaveText(firstTitle!);
  await expect(page.locator(".reel-nav-rail strong")).toHaveText("2");
  await expect(page).toHaveURL(/[?&]v=[a-z0-9-]+/);
  const secondTitle = await activeTitle(page).textContent();
  await page.reload();
  await expect(activeTitle(page)).toHaveText(secondTitle!);
  await feed(page).focus();
  await page.keyboard.press("ArrowUp");
  await expect(page.locator(".reel-nav-rail strong")).toHaveText("1");

  // Only cars near the active one are fully rendered; the rest of the feed loads in pages.
  expect(await page.locator(".reel-slide:not(.is-placeholder)").count()).toBeLessThanOrEqual(5);
  for (let i = 2; i <= total; i++) {
    await page.getByRole("button", { name: "Next car" }).click();
    await expect(page.locator(".reel-nav-rail strong")).toHaveText(String(i));
  }
  await expect(page.locator(".reel-nav-rail strong")).toHaveText(String(total));
  await expect(feed(page).getByRole("article")).toHaveCount(total);
  await expect(page.getByRole("button", { name: "Next car" })).toBeDisabled();
});

test("impossible requests are explained without silently widening the budget or place", async ({ page, request }) => {
  await page.goto("/discover?q=" + encodeURIComponent("automatic SUV under ₹10 lakh in Delhi"));
  const empty = page.locator(".empty-card");
  await expect(empty.getByRole("heading", { level: 2 })).toContainText("No available automatic SUVs under ₹10 lakh in Delhi");
  await expect(empty).toContainText("won't change your budget unless you ask");
  await expect(empty).toContainText("Cars meeting your other requirements start at");
  await expect(empty).toContainText("Nothing is listed in Delhi yet");
  await expect(page.getByRole("feed")).toHaveCount(0);
  const api = await request.get("/api/discover?q=" + encodeURIComponent("automatic SUV under ₹10 lakh in Delhi"));
  const body = await api.json();
  expect(body.total).toBe(0);
  expect(body.intent.budget).toEqual({ max: 1000000 });
  expect(body.notices.some((notice: { kind: string }) => notice.kind === "location")).toBe(true);
  // Each relaxation is the buyer's explicit choice, offered only when it would help.
  await empty.getByRole("link", { name: /^Up to ₹/ }).click();
  await expect(page).toHaveURL(/q=under\+\d+\+lakh/);
  await expect(page.getByRole("feed")).toHaveCount(0);
  await page.locator(".empty-card").getByRole("link", { name: /^Any city \(\d+\)$/ }).click();
  await expect(page.getByRole("feed")).toBeVisible();
});

test("a buyer saves a car and enquires from the reel; the dealer sees the lead with the shared search", async ({ page }, info) => {
  test.setTimeout(60000);
  await page.goto("/discover?q=" + encodeURIComponent("first owner SUV") + "&q=" + encodeURIComponent("newest first"));
  const slide = page.locator(".reel-slide.is-active");
  const title = (await slide.getByRole("heading", { level: 2 }).textContent())!;
  await slide.getByRole("button", { name: `Save ${title}` }).click();
  await expect(slide.getByRole("button", { name: `Remove ${title} from saved cars` })).toHaveAttribute("aria-pressed", "true");
  if (info.project.name !== "mobile") await expect(page.getByRole("navigation", { name: "Primary" }).getByLabel("1 saved")).toBeVisible();

  await slide.getByRole("button", { name: "Enquire" }).click();
  const dialog = page.getByRole("dialog", { name: title });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("checkbox", { name: /Share my search with the dealer/ })).toBeChecked();
  await expect(dialog).toContainText("“first owner SUV → newest first”");
  await dialog.getByRole("textbox", { name: "Name" }).fill("Discovery Buyer");
  await dialog.getByRole("textbox", { name: "Phone" }).fill("+91 90000 00077");
  const response = page.waitForResponse(item => item.url().endsWith("/api/leads") && item.request().method() === "POST");
  await dialog.getByRole("button", { name: "Send request" }).click();
  const lead = await (await response).json();
  expect(lead.leadId).toBeTruthy();
  await expect(dialog.getByRole("heading", { name: "We have the context." })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.locator(".reel-slide.is-active h2")).toHaveText(title);

  await page.goto(`${command}/leads/${lead.leadId}`);
  await expect(page.getByRole("heading", { name: "Discovery Buyer" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What they searched for" })).toBeVisible();
  await expect(page.getByText("“first owner SUV” → “newest first”")).toBeVisible();
  await expect(page.getByText("SUV · First owner · Newest first")).toBeVisible();
  await expect(page.getByText(/^1 of \d+ matches$/)).toBeVisible();

  await page.goto("/saved");
  await expect(page.getByRole("heading", { level: 2, name: title })).toBeVisible();
  await page.getByRole("button", { name: `Remove ${title} from saved cars` }).click();
  await expect(page.getByRole("heading", { name: "No saved cars yet" })).toBeVisible();
});

test("search pages stay out of the index and the discovery APIs validate input", async ({ request }) => {
  const canonical = await (await request.get("/discover")).text();
  expect(canonical).toMatch(/rel="canonical" href="[^"]+\/discover"/);
  expect(canonical).not.toMatch(/noindex/);
  const session = await (await request.get("/discover?q=suv")).text();
  expect(session).toMatch(/<meta name="robots" content="noindex, follow"/);
  expect(session).toMatch(/rel="canonical" href="[^"]+\/discover"/);
  expect((await request.get("/api/discover?cursor=-1")).status()).toBe(400);
  expect((await request.get("/api/discover?limit=500")).status()).toBe(400);
  const page = await (await request.get("/api/discover?q=suv&limit=2")).json();
  expect(page.results).toHaveLength(2);
  expect(page.nextCursor).toBe(2);
  for (const match of page.results) {
    expect(match.card.availability).toBe("available");
    expect(Object.keys(match.card)).not.toContain("source");
    expect(Object.keys(match.card)).not.toContain("externalId");
  }
  expect(await (await request.get("/api/discover/summary?q=suv")).json()).toEqual({ source: "disabled" });
  const tooMany = await request.post("/api/leads", { data: { name: "Bounded", phone: "+91 90000 00078", discovery: { turns: Array.from({ length: 11 }, () => "suv") } } });
  expect(tooMany.status()).toBe(400);
  const sitemap = await (await request.get("/sitemap.xml")).text();
  for (const path of ["/discover", "/privacy", "/terms"]) expect(sitemap).toContain(path + "</loc>");
  expect(sitemap).not.toContain("/saved</loc>");
});

test("phone layouts keep every hero and reel element inside the screen", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "Phone layout check.");
  await page.goto("/");
  const outside = async () => page.evaluate(() => [...document.querySelectorAll(".va-hero h1, .hero-lede, .composer, .hero-figure, .hero-card, main h2")]
    .filter(element => { const box = element.getBoundingClientRect(); return box.width > 0 && (box.left < -1 || box.right > window.innerWidth + 1); })
    .map(element => element.className || element.tagName));
  expect(await outside()).toEqual([]);
  await page.goto("/discover?q=suv");
  const card = await page.locator(".reel-slide.is-active .reel-card").boundingBox();
  const viewport = page.viewportSize()!;
  expect(card!.x).toBeGreaterThanOrEqual(0);
  expect(card!.x + card!.width).toBeLessThanOrEqual(viewport.width);
  expect(card!.height).toBeGreaterThan(viewport.height * 0.6);
  await page.getByRole("button", { name: /Your search/ }).click();
  await expect(page.getByRole("list", { name: "Conversation" })).toBeVisible();
  await page.getByRole("button", { name: "Show cars" }).click();
  await expect(page.getByRole("list", { name: "Conversation" })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
