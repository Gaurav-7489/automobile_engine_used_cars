import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const form = () => readFile("apps/intelligence/components/inventory/add-vehicle.tsx", "utf8");
const route = () => readFile("apps/intelligence/app/api/vehicles/[id]/photos/route.ts", "utf8");

test("photos are uploaded only to the stock id the server confirmed, never the optimistic one", async () => {
  const src = await form();
  assert.match(src, /runConfirmed\(/, "the save waits for the server's answer");
  assert.match(src, /outcome\.saved && outcome\.vehicles\.length === 1 \? outcome\.vehicles\[0\] : null/, "exactly one confirmed car, or no upload");
  assert.ok(!/result\.vehicle\.id\)?\}?\/photos|vehicles\/\$\{encodeURIComponent\(result\.vehicle\.id/.test(src), "never uploads to the browser's guessed id");
  assert.match(src, /body\.append\("photos", list\[i\]\.file\)/, "one photo per request (stays under the platform request-size limit)");
  assert.match(src, /did not upload/, "a failed upload says so and keeps the saved car");
});

test("the form's photo limits match what the server enforces", async () => {
  const [src, server] = await Promise.all([form(), route()]);
  assert.match(server, /MAX_BYTES = 8 \* 1024 \* 1024/);
  assert.match(server, /MAX_PHOTOS = 20/);
  assert.match(src, /MAX_PHOTO_BYTES = 8 \* 1024 \* 1024/);
  assert.match(src, /MAX_PHOTOS = 20/);
  for (const type of ["image/jpeg", "image/png", "image/webp"]) { assert.ok(src.includes(type), type); assert.ok(server.includes(type), type); }
});

test("editing an existing car keeps the sectioned editor; adding uses the one-page form", async () => {
  const drawer = await readFile("apps/intelligence/components/inventory/vehicle-drawer.tsx", "utf8");
  assert.match(drawer, /props\.vehicle \? <EditVehicleDrawer \{\.\.\.props\} \/> : <AddVehicleDrawer/);
});
