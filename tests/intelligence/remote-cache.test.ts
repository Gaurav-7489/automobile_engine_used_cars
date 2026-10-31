import { test } from "node:test";
import assert from "node:assert/strict";
import { cached, clearRemoteCache, remember, request, store, warm } from "../../apps/intelligence/lib/remote-cache";

test("a revisited page reads its last data from memory, newest entries kept", () => {
  clearRemoteCache();
  store("/api/a", { n: 1 });
  assert.deepEqual(cached("/api/a")?.data, { n: 1 });
  for (let i = 0; i < 100; i++) store(`/api/x${i}`, i);
  assert.equal(cached("/api/a"), undefined, "oldest entries are dropped past the limit");
  assert.equal(cached("/api/x99")?.data, 99);
});

test("identical requests in flight share one network call; sign-out clears everything", async () => {
  clearRemoteCache();
  let calls = 0;
  globalThis.fetch = (async () => { calls++; await new Promise((r) => setTimeout(r, 10)); return new Response(JSON.stringify({ ok: 1 }), { status: 200 }); }) as typeof fetch;
  const [a, b] = await Promise.all([request("/api/same"), request("/api/same")]);
  assert.equal(calls, 1);
  assert.deepEqual(await a.json(), { ok: 1 });
  assert.deepEqual(await b.json(), { ok: 1 }, "each caller gets its own readable copy");
  remember("/app/inventory", "/api/inventory?page=1");
  warm("/app/inventory");
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(cached("/api/inventory?page=1")?.data, { ok: 1 }, "hovering a link warms the data that page used last time");
  const before = calls;
  warm("/app/inventory");
  assert.equal(calls, before, "data only seconds old is not fetched again");
  clearRemoteCache();
  assert.equal(cached("/api/inventory?page=1"), undefined);
});
