import { test } from "node:test";
import assert from "node:assert/strict";
import type { Vehicle } from "../../apps/intelligence/lib/domain";
import { buildCaption, captionLength, captionProblems, hashtags, listingLink, listingPath, normalisePhone, ordinalOwner, PLATFORMS, postPrice, shareLinks } from "../../apps/intelligence/lib/social-post";

const vehicle = { id: "V-1001", branchId: "b", make: "Toyota", model: "Innova Crysta", variant: "2.4 GX 7 STR", year: 2020, fuel: "Diesel", transmission: "Manual", km: 50000, owners: 2, registration: "KL 01 AA 0001", status: "available", acquiredAt: "2026-10-01T00:00:00Z", asking: 174_500_000, costs: { acquisition: 0, transport: 0, inspection: 0, refurbishment: 0, fees: 0 }, costComplete: true, hasImages: true, enquiries14d: 0, cohortMedianEnquiries: 0, version: 1, channels: ["Owned site"], documents: [] } as Vehicle;
const tenant = "6f1c2a3b-1111-4222-8333-444455556666";

test("listing links point to the public page with per-platform UTM tags; sample workspaces use the showroom", () => {
  assert.equal(listingPath(tenant, "V-1001"), `/l/${tenant}/v-1001`);
  assert.equal(listingPath("sample", "V-1001"), "/showroom/inventory");
  const link = listingLink("https://app.example/", tenant, "V-1001", "facebook", "vl_cmp-1001_v-1001");
  const url = new URL(link);
  assert.equal(url.pathname, `/l/${tenant}/v-1001`);
  assert.equal(url.searchParams.get("utm_source"), "facebook");
  assert.equal(url.searchParams.get("utm_medium"), "social");
  assert.equal(url.searchParams.get("utm_campaign"), "vl_cmp-1001_v-1001");
});

test("prices, owners and phones are formatted for Indian posts", () => {
  assert.equal(postPrice(174_500_000), "₹17.45 Lakh");
  assert.equal(postPrice(1_250_000_000), "₹1.25 Crore");
  assert.equal(postPrice(8_500_000), "₹85,000");
  assert.equal(postPrice(null), "Price on request");
  assert.deepEqual([1, 2, 3, 4, 11].map(ordinalOwner), ["1st owner", "2nd owner", "3rd owner", "4th owner", "11th owner"]);
  assert.equal(normalisePhone("98470 12345"), "+919847012345");
  assert.equal(normalisePhone("+91 98470-12345"), "+919847012345");
  assert.equal(normalisePhone("12345"), null);
});

test("captions use stock facts only, stay within each platform's limit and carry the link", () => {
  const link = listingLink("https://app.example", tenant, vehicle.id, "x", "vl_cmp-1001_v-1001");
  for (const p of PLATFORMS) {
    const text = buildCaption({ vehicle, platform: p.id, link, city: "Kochi", dealer: "Gamma Motors", phone: "98470 12345", headline: "Innova Crysta / Kochi" });
    assert.deepEqual(captionProblems(text), [], `${p.id} caption has no blocked claims`);
    assert.ok(captionLength(text, p.id) <= p.limit, `${p.id} caption within limit`);
    assert.ok(text.includes(link), `${p.id} caption includes the link`);
    assert.ok(!text.includes("KL 01 AA 0001"), "registration never appears in a post");
    if (p.id !== "x") { assert.match(text, /₹17\.45 Lakh/); assert.match(text, /50,000 km/); assert.match(text, /2nd owner/); }
  }
  assert.match(buildCaption({ vehicle, platform: "instagram", link, city: "Kochi", dealer: "G" }), /link in bio/);
  assert.ok(!buildCaption({ vehicle, platform: "instagram", link, city: "Kochi", dealer: "G", tags: false }).includes("#"));
  // A very long title still fits on X.
  const long = { ...vehicle, variant: "A".repeat(400) };
  assert.ok(captionLength(buildCaption({ vehicle: long, platform: "x", link, city: "Kochi", dealer: "G" }), "x") <= 280);
  // A dealer's extra line is checked like campaign copy.
  assert.ok(captionProblems(buildCaption({ vehicle, platform: "facebook", link, city: "Kochi", dealer: "G", extra: "Accident-free, zero down payment!" })).length >= 1);
});

test("hashtags are clean and share links are encoded", () => {
  const tags = hashtags(vehicle, "Kochi");
  assert.ok(tags.every((t) => /^#[A-Za-z0-9]+$/.test(t)));
  assert.ok(tags.includes("#ToyotaInnovaCrysta") && tags.includes("#KochiCars"));
  const links = shareLinks("Hello & welcome", "https://app.example/l/x?utm_source=x");
  assert.ok(links.find((l) => l.platform === "whatsapp")!.href.startsWith("https://wa.me/?text=Hello%20%26%20welcome"));
  assert.ok(links.find((l) => l.platform === "facebook")!.href.includes(encodeURIComponent("https://app.example/l/x?utm_source=x")));
});
