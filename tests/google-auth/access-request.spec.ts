import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";

/**
 * Access requests on the running build. ACCESS_PASS_FILE holds a pass signed with the server's SESSION_SECRET (what the Google
 * callback sets for a verified account without access); COOKIES_FILE holds the administrator session. Google itself is not contacted.
 */
const pass = process.env.ACCESS_PASS_FILE && existsSync(process.env.ACCESS_PASS_FILE) ? readFileSync(process.env.ACCESS_PASS_FILE, "utf8").trim() : "";
const sessions = process.env.COOKIES_FILE && existsSync(process.env.COOKIES_FILE) ? (JSON.parse(readFileSync(process.env.COOKIES_FILE, "utf8")) as Record<string, string>) : null;
const secure = (base: string) => base.replace(/^http:/, "https:");

test("without a verified Google pass, the page only offers Google sign-in, and the API refuses", async ({ page, request }) => {
  await page.goto("/request-access");
  await expect(page.getByText("Sign in with Google first")).toBeVisible();
  await expect(page.getByLabel("Registered business name")).toHaveCount(0);
  const r = await request.post("/api/auth/access-request", { data: { name: "X" }, headers: { origin: "http://127.0.0.1:3003" } });
  expect(r.status()).toBe(401);
});

test("a Google account without access sends its details; the administrator sees the request", async ({ page, context, baseURL, browser }) => {
  test.skip(!pass || !sessions, "set ACCESS_PASS_FILE and COOKIES_FILE");
  await context.addCookies([{ name: "__Host-vl_access", value: pass, url: secure(baseURL!), secure: true, httpOnly: true, sameSite: "Lax" }]);
  await page.goto("/request-access");
  await expect(page.getByText("local.dealer@gmail.com").first()).toBeVisible();
  // A request already sent (an earlier project run) shows its status instead of the form.
  const alreadySent = await page.getByRole("heading", { name: "Request received" }).isVisible();
  if (!alreadySent) {
  await expect(page.getByText("Signed in with Google as")).toBeVisible();
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText("Enter the registered business name.")).toBeVisible();
  await page.getByLabel("Registered business name").fill("Local Dealer Autos Pvt Ltd");
  await page.getByLabel("Dealership name").fill("Local Dealer Autos");
  await page.getByLabel("Mobile").fill("98470 22446");
  await page.getByLabel("City").fill("Thrissur");
  await page.getByLabel("State").fill("Kerala");
  await page.getByRole("button", { name: "Send request" }).click();
  }
  await expect(page.getByRole("heading", { name: "Request received" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);

  const adminContext = await browser.newContext();
  await adminContext.addCookies([{ name: "__Host-vl_session", value: sessions!.admin, url: secure(baseURL!), secure: true, httpOnly: true, sameSite: "Lax" }]);
  const admin = await adminContext.newPage();
  await admin.goto("/admin");
  await expect(admin.getByRole("heading", { name: "Access requests" })).toBeVisible();
  await expect(admin.getByText("Local Dealer Autos").first()).toBeVisible();
  await admin.getByRole("button", { name: "Approve" }).first().click();
  await expect(admin.getByText(/becomes the owner and signs in with Google/)).toBeVisible();
  await expect(admin.getByText("Google will ask you to confirm it's you")).toBeVisible();
  await adminContext.close();
});
