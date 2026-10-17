import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { discoverySummary, groundedSummary } from "../../apps/web/lib/discovery-ai";
import type { DiscoveryPage } from "../../apps/web/lib/discovery";

const cars = [{ year: 2024, make: "BMW", model: "X1" }, { year: 2023, make: "Jeep", model: "Meridian" }];
const card = (id: string, year: number, make: string, model: string) => ({ id, slug: id, stockId: id, make, model, variant: "Test", year, price: 4890000, mileage: 6100, fuelType: "diesel" as const, transmission: "automatic" as const, ownership: 1, bodyType: "SUV", exteriorColor: "White", condition: "excellent" as const, features: [], media: [], location: null, dealership: "Test", phone: null, availability: "available" as const });
const page = {
  version: "discovery-v1", turns: ["suv under 50 lakh"], intent: {}, chips: [{ key: "bodies", label: "SUV", kind: "requirement" }], thread: [], reply: "", notices: [], suggestions: [], total: 4, reserved: 0, cursor: 0, nextCursor: null,
  results: ["a", "b", "c", "d"].map((id, index) => ({ vehicleId: id, rank: index + 1, summary: "", requirements: ["SUV"], strengths: [], caveats: [], card: card(id, 2024 - index, index % 2 ? "Jeep" : "BMW", index % 2 ? "Meridian" : "X1") })),
} as unknown as DiscoveryPage;
const original = { fetch: globalThis.fetch, env: { ...process.env } };
afterEach(() => { globalThis.fetch = original.fetch; process.env = { ...original.env }; });

test("model text may only rephrase shown cars: no new numbers, makes, links or guarantees", () => {
  assert.equal(groundedSummary("The 2024 BMW X1 and Jeep Meridian both match your SUV request. Confirm service records with the dealer.", cars), "The 2024 BMW X1 and Jeep Meridian both match your SUV request. Confirm service records with the dealer.");
  for (const text of [
    "The BMW X1 costs ₹48.9 lakh.", "The X1 returns 18 km/l.", "It has 4 previous owners.", "Consider a Toyota Fortuner instead.",
    "Visit https://example.com for offers.", "We guarantee this car is fault-free.", "Certified, accident-free BMW X1.", "x".repeat(601), "", 42,
  ]) assert.equal(groundedSummary(text, cars), null, String(text).slice(0, 40));
});

test("AI summaries are off by default and need their own credential", async () => {
  delete process.env.DISCOVERY_AI_ENABLED;
  assert.deepEqual(await discoverySummary(page, false), { source: "disabled" });
  process.env.DISCOVERY_AI_ENABLED = "true";
  delete process.env.DISCOVERY_AI_SERVICE_TOKEN; process.env.DISCOVERY_AI_URL = "https://ai.example/discover";
  assert.deepEqual(await discoverySummary(page, false), { source: "not_configured" });
  process.env.DEALER_AI_SERVICE_TOKEN = "d".repeat(43);
  assert.deepEqual(await discoverySummary(page, false), { source: "not_configured" }, "the dealer credential is never reused");
});

test("only the top three cars' displayed facts are sent, and bad or failed output falls back", async () => {
  Object.assign(process.env, { DISCOVERY_AI_ENABLED: "true", DISCOVERY_AI_URL: "https://ai.example/discover", DISCOVERY_AI_SERVICE_TOKEN: "t".repeat(43) });
  let sent: { cars: { name: string }[] } | undefined, headers: Headers | undefined;
  const respond = (body: unknown, status = 200) => { globalThis.fetch = (async (_url: unknown, init?: RequestInit) => { sent = JSON.parse(String(init?.body)); headers = new Headers(init?.headers); return new Response(JSON.stringify(body), { status }); }) as typeof fetch; };
  respond({ text: "The 2024 BMW X1 fits your SUV search; confirm its service history.", model: "@cf/test" });
  assert.deepEqual(await discoverySummary(page, true), { source: "ai", text: "The 2024 BMW X1 fits your SUV search; confirm its service history.", model: "@cf/test" });
  assert.deepEqual(sent!.cars.map(item => item.name), ["2024 BMW X1", "2023 Jeep Meridian", "2022 BMW X1"]);
  assert.equal(headers!.get("authorization"), `Bearer ${"t".repeat(43)}`);
  assert.doesNotMatch(JSON.stringify(sent), /phone|email|price|mileage/i);
  respond({ text: "The BMW X1 is priced at 48 lakh.", model: "@cf/test" });
  assert.deepEqual(await discoverySummary(page, true), { source: "rules" });
  respond({ error: "AI unavailable" }, 503);
  assert.deepEqual(await discoverySummary(page, true), { source: "unavailable" });
  globalThis.fetch = (async () => { throw new TypeError("network"); }) as typeof fetch;
  assert.deepEqual(await discoverySummary(page, true), { source: "unavailable" });
  process.env.DISCOVERY_AI_URL = "http://ai.example/discover";
  assert.deepEqual(await discoverySummary(page, true), { source: "unavailable" }, "plain HTTP is refused");
});
