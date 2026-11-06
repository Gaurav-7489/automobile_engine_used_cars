import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { ShowroomCard } from "../../apps/intelligence/components/showroom/vehicle-card";
import { cap, money, sampleVehicles } from "../../apps/intelligence/lib/showroom";

// React lives in the app's own dependencies; the test runner's classic JSX transform expects a global React.
const appRequire = createRequire(new URL("../../apps/intelligence/package.json", import.meta.url));
const React = appRequire("react") as typeof import("react");
const { renderToStaticMarkup } = appRequire("react-dom/server") as typeof import("react-dom/server");
(globalThis as { React?: unknown }).React = React;

test("sample showroom cards use the dealership-page card, price wording and capitalised specs", () => {
  assert.equal(money(5_850_000), "₹58.50 Lakh", "same wording as /l/{tenant}");
  assert.equal(money(0), "Price on request");
  assert.equal(cap("petrol"), "Petrol");

  const cars = sampleVehicles();
  const available = cars.find((v) => v.availabilityStatus === "available")!;
  const html = renderToStaticMarkup(React.createElement(ShowroomCard, { vehicle: available }));
  assert.match(html, /^<a [^>]*class="pl-card"[^>]*href="\/showroom\/vehicles\//);
  for (const part of ["pl-card-media", "pl-card-body", "pl-card-title", "pl-card-price"]) assert.ok(html.includes(part), part);
  assert.ok(html.includes(money(available.price)));
  assert.ok(html.includes(cap(available.fuelType)) && html.includes(cap(available.transmission)));
  assert.ok(!html.includes("sr-badge"), "available cars carry no badge, as on dealership pages");

  const reserved = cars.find((v) => v.availabilityStatus !== "available");
  if (reserved) assert.match(renderToStaticMarkup(React.createElement(ShowroomCard, { vehicle: reserved })), /sr-badge pl-card-badge/);
});

test("the sample car page stays honest: no enquiry form, and it says why", async () => {
  const page = await readFile("apps/intelligence/app/showroom/vehicles/[slug]/page.tsx", "utf8");
  assert.ok(!/EnquiryForm|\/api\/public\/enquiry/.test(page), "sample cars must never create leads");
  assert.match(page, /does not take enquiries/);
  assert.match(page, /SaveButton/, "saving for comparison still works");
  const layout = await readFile("apps/intelligence/app/showroom/layout.tsx", "utf8");
  assert.match(layout, /SAMPLE_NOTICE/, "every sample page is labelled");
});
