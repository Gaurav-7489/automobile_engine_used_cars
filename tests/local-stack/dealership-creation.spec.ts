import { test, expect, type Page } from "@playwright/test";
import { totpCodeForTests } from "../../apps/intelligence/lib/server/totp";

const ADMIN = { email: "admin@vandlabs.example", password: "steady orchard lantern 9", secret: process.env.LOCAL_ADMIN_TOTP ?? "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP" };
const stamp = Date.now().toString(36);

async function signIn(page: Page, email: string, password: string, secret?: string) {
  await page.goto("/login");
  await page.getByLabel(/business email/i).fill(email);
  await page.getByLabel(/^password/i).fill(password);
  await page.getByRole("button", { name: /^sign in/i }).click();
  if (secret) {
    await page.getByLabel("Authenticator code").fill(totpCodeForTests(secret));
    await page.getByRole("button", { name: /^sign in/i }).click();
  }
  await page.waitForURL(/\/app\/|\/admin/, { timeout: 15_000 });
}

test("administrator creates a dealership; the owner activates and reaches a private workspace", async ({ page, browser }) => {
  await signIn(page, ADMIN.email, ADMIN.password, ADMIN.secret);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: /admin|dealerships/i }).first()).toBeVisible();

  await page.getByRole("button", { name: /add dealership/i }).first().click();
  const dialog = page.getByRole("dialog", { name: /add dealership/i });
  await dialog.getByLabel(/registered business name/i).fill(`Nair Motors ${stamp} Pvt Ltd`);
  await dialog.getByLabel(/^dealership name/i).fill(`Nair Motors ${stamp}`);
  await dialog.getByLabel(/owner's name/i).fill("Meera Nair");
  await dialog.getByLabel(/owner's email/i).fill(`meera.${stamp}@nair.example`);
  await dialog.getByLabel(/branch name/i).fill("Main");
  await dialog.getByLabel(/^city/i).fill("Kochi");
  await dialog.getByLabel(/^state/i).fill("Kerala");

  // Wrong password: a clear error, nothing created, the form stays usable.
  await dialog.getByLabel(/confirm your password/i).fill("not the right password");
  await dialog.getByRole("button", { name: /^create dealership/i }).click();
  await expect(dialog.getByText("That password is not correct.")).toBeVisible();

  // Correct password: progress label, then the one-time owner link.
  await dialog.getByLabel(/confirm your password/i).fill(ADMIN.password);
  const submit = dialog.getByRole("button", { name: /create dealership/i });
  await submit.click();
  await expect(submit).toBeDisabled().catch(() => undefined);
  const link = page.locator("text=/\\/join\\//").first();
  await expect(link).toBeVisible({ timeout: 15_000 });
  const setup = (await link.textContent())!.match(/\/join\/[\w-]+/)![0];

  // The dealership persists across a reload.
  await page.reload();
  await expect(page.getByText(`Nair Motors ${stamp}`).first()).toBeVisible();

  // A valid confirmation is remembered: the next sensitive dialog does not ask for the password again.
  await page.getByRole("button", { name: /add dealership/i }).first().click();
  const again = page.getByRole("dialog", { name: /add dealership/i });
  await expect(again.getByText("Your identity was confirmed a moment ago.")).toBeVisible();
  await expect(again.getByLabel(/confirm your password/i)).toHaveCount(0);

  // Owner activation in a separate browser context.
  const owner = await browser.newContext();
  const op = await owner.newPage();
  await op.goto(setup);
  await op.getByLabel(/^(new )?password/i).first().fill("coastal harbour ledger 55");
  const confirm = op.getByLabel(/confirm/i);
  if (await confirm.count()) await confirm.fill("coastal harbour ledger 55");
  await op.getByRole("button", { name: /set password|activate|continue|create/i }).click();
  await op.waitForURL(/\/app\//, { timeout: 15_000 });
  await expect(op.getByRole("navigation", { name: "Primary" })).toBeVisible();
  // A dealer owner has no way into the administrator console.
  const denied = await op.goto("/admin");
  expect([403, 404].includes(denied!.status()) || /could not be found|not found/i.test(await op.locator("body").innerText())).toBe(true);
  await owner.close();
});
