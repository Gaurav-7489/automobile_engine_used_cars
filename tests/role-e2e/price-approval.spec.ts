import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createPrivateKey } from "node:crypto";
import { SignJWT } from "jose";

async function as(role: string) {
  const key = createPrivateKey(readFileSync(join(process.env.VANDLABS_ROLE_FIXTURE_DIR!, "jwt.pem")));
  const token = await new SignJWT({ token_use: "access" }).setProtectedHeader({ alg: "RS256", kid: "isolated-role-test" }).setSubject(role).setIssuer("https://127.0.0.1:3443").setAudience("isolated-dealer-api").setIssuedAt().setExpirationTime("10m").sign(key);
  return { authorization: `Bearer ${token}` };
}
const api = "/command/api";
// The local demo state persists between runs, so each test takes a vehicle nobody has touched yet.
type Snap = { vehicles: { id: string; availabilityStatus: string; price: number; version?: number; stockId: string; publishStatus: string }[]; priceRequests?: { vehicleId: string }[]; costs?: { vehicleId: string }[] };
const untouched = (data: Snap, skip = 0) => data.vehicles.filter(v => v.availabilityStatus === "available" && !(data.priceRequests ?? []).some(r => r.vehicleId === v.id) && !(data.costs ?? []).some(c => c.vehicleId === v.id))[skip];
const snapshot = async (request: import("@playwright/test").APIRequestContext, role: string) => (await (await request.get(`${api}/snapshot`, { headers: await as(role) })).json()).data;

test("manager requests, owner decides: the whole approval path with real signed roles", async ({ request, page }) => {
  const manager = await as("manager"), owner = await as("owner");
  const vehicle = untouched(await snapshot(request, "owner"))!;
  const deep = Math.round(vehicle.price * 0.6);
  // A manager cannot make a guarded cut directly.
  const direct = await request.patch(`${api}/vehicles/${vehicle.id}`, { headers: manager, data: { price: deep, publishStatus: vehicle.publishStatus, availabilityStatus: vehicle.availabilityStatus, expectedVersion: vehicle.version ?? 0 } });
  expect(direct.status()).toBe(409);
  expect((await snapshot(request, "owner")).vehicles.find((v: { id: string }) => v.id === vehicle.id).price).toBe(vehicle.price);
  // The manager raises a request; the response and snapshot carry no cost-based reason.
  const raised = await request.post(`${api}/inventory/price-requests`, { headers: manager, data: { vehicleId: vehicle.id, proposedPrice: deep, note: "Ageing, needs to move", expectedVersion: vehicle.version ?? 0 } });
  expect(raised.status()).toBe(201);
  const created = (await raised.json()).data;
  expect(created.status).toBe("pending"); expect(created.reasons).not.toContain("below_cost");
  // Roles that cannot manage inventory prices cannot raise or decide.
  expect((await request.post(`${api}/inventory/price-requests`, { headers: await as("sales"), data: { vehicleId: vehicle.id, proposedPrice: deep, note: "x", expectedVersion: 0 } })).status()).toBe(403);
  expect((await request.patch(`${api}/inventory/price-requests/${created.id}`, { headers: manager, data: { decision: "approved" } })).status()).toBe(403);
  expect((await request.patch(`${api}/inventory/price-requests/${created.id}`, { headers: await as("acquisition"), data: { decision: "approved" } })).status()).toBe(403);
  // The owner sees it, decides it in the interface, and the price changes exactly once.
  await page.setExtraHTTPHeaders(owner);
  await page.goto("/command/inventory");
  const item = page.getByRole("list", { name: "Pending price requests" }).getByRole("listitem").filter({ hasText: vehicle.stockId });
  await expect(item).toContainText("Ageing, needs to move");
  await item.getByRole("button", { name: /^Approve/ }).click();
  // The item either shows its success message or has already left the list once the page refreshes, so the server record is the evidence.
  // These tests inject a bearer header into every request, which makes the router's background refresh unreliable; a reload re-reads the page.
  await expect.poll(async () => (await snapshot(request, "owner")).priceRequests.find((r: { id: string }) => r.id === created.id)?.status).toBe("approved");
  const after = await snapshot(request, "owner");
  expect(after.vehicles.find((v: { id: string }) => v.id === vehicle.id).price).toBe(deep);
  expect(after.priceRequests.find((r: { id: string }) => r.id === created.id)).toMatchObject({ status: "approved", decidedBy: "owner" });
  await page.reload();
  await expect(page.getByRole("list", { name: "Pending price requests" }).getByRole("listitem").filter({ hasText: vehicle.stockId })).toHaveCount(0);
  expect((await request.patch(`${api}/inventory/price-requests/${created.id}`, { headers: owner, data: { decision: "approved" } })).status()).toBe(409);
});

test("an owner rejection needs a reason, leaves the price alone and frees the vehicle for a new request", async ({ request, page }) => {
  const manager = await as("manager"), owner = await as("owner");
  const vehicle = untouched(await snapshot(request, "owner"))!;
  const raised = await request.post(`${api}/inventory/price-requests`, { headers: manager, data: { vehicleId: vehicle.id, proposedPrice: Math.round(vehicle.price * 0.5), note: "Deep cut", expectedVersion: vehicle.version ?? 0 } });
  expect(raised.status()).toBe(201);
  const id = (await raised.json()).data.id;
  expect((await request.patch(`${api}/inventory/price-requests/${id}`, { headers: owner, data: { decision: "rejected" } })).status()).toBe(400);
  await page.setExtraHTTPHeaders(owner);
  await page.goto("/command/inventory");
  const item = page.getByRole("list", { name: "Pending price requests" }).getByRole("listitem").filter({ hasText: vehicle.stockId });
  await item.getByRole("button", { name: "Reject…" }).click();
  await item.getByLabel("Reason for rejecting").fill("Too deep for this model");
  await item.getByRole("button", { name: "Confirm rejection" }).click();
  await expect.poll(async () => (await snapshot(request, "owner")).priceRequests.find((r: { id: string }) => r.id === id)?.status).toBe("rejected");
  const after = await snapshot(request, "owner");
  expect(after.vehicles.find((v: { id: string }) => v.id === vehicle.id).price).toBe(vehicle.price);
  expect(after.priceRequests.find((r: { id: string }) => r.id === id)).toMatchObject({ status: "rejected", decisionNote: "Too deep for this model" });
  expect((await request.post(`${api}/inventory/price-requests`, { headers: manager, data: { vehicleId: vehicle.id, proposedPrice: Math.round(vehicle.price * 0.8), note: "Shallower", expectedVersion: vehicle.version ?? 0 } })).status()).toBe(201);
});

test("capital-blind roles never receive cost-based reasons or cost figures", async ({ request }) => {
  const owner = await as("owner"), v = untouched(await snapshot(request, "owner"))!;
  const cost = await request.put(`${api}/vehicles/${v.id}/costs`, { headers: owner, data: { record: { acquiredOn: "2026-08-01", purchasePrice: Math.round(v.price * 0.95), reconditioningCost: 0, transferCost: 0, otherCost: 0, dailyHoldingCost: null, reference: "ROLE-E2E" }, expectedVersion: 0 } });
  expect(cost.status()).toBe(200);
  const req = await request.post(`${api}/inventory/price-requests`, { headers: await as("manager"), data: { vehicleId: v.id, proposedPrice: Math.round(v.price * 0.9), note: "Below cost but under 10%", expectedVersion: v.version ?? 0 } });
  expect(req.status()).toBe(201);
  const managerView = await snapshot(request, "manager"), ownerView = await snapshot(request, "owner");
  expect(managerView.costs).toBeUndefined();
  expect(managerView.priceRequests.find((r: { vehicleId: string }) => r.vehicleId === v.id).reasons).toEqual([]);
  expect(ownerView.priceRequests.find((r: { vehicleId: string }) => r.vehicleId === v.id).reasons).toEqual(["below_cost"]);
});
