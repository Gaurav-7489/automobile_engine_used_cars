import { test } from "node:test";
import assert from "node:assert/strict";
import { harness } from "./harness";
import { hitShared } from "../../apps/intelligence/lib/rate-limit";

test("shared rate limiter: counts across callers, reports Retry-After, resets after the window, hides keys, survives outages", async () => {
  const h = await harness();
  try {
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await hitShared("login:1.2.3.4:a@b.example", 3, 60_000));
    assert.deepEqual(results.map((r) => r.allowed), [true, true, true, false, false]);
    assert.ok(results[3].retryAfter >= 1 && results[3].retryAfter <= 60);
    // A different key is independent.
    assert.equal((await hitShared("login:5.6.7.8:a@b.example", 3, 60_000)).allowed, true);

    // Nothing readable is stored, and the runtime role cannot touch the table.
    const stored = (await h.db.query<{ key_hash: string }>("SELECT key_hash FROM intelligence_rate_limits")).rows;
    assert.ok(stored.every((r) => /^[0-9a-f]{64}$/.test(r.key_hash)));
    await assert.rejects(h.app.connect().then((c) => c.query("SELECT * FROM intelligence_rate_limits")), /permission denied/);
    await assert.rejects(h.app.connect().then((c) => c.query("DELETE FROM intelligence_rate_limits")), /permission denied/);
    await assert.rejects(h.app.connect().then((c) => c.query("SELECT * FROM intelligence_rate_hit('short', 1, 60)")), /invalid rate limit/);

    // The window rolls over.
    await h.db.query("UPDATE intelligence_rate_limits SET window_ends_at = now() - interval '1 second'");
    assert.equal((await hitShared("login:1.2.3.4:a@b.example", 3, 60_000)).allowed, true);

    // Database outage: the in-process limiter still bounds attempts instead of failing open or closed.
    await h.close();
    const outage = [];
    for (let i = 0; i < 4; i++) outage.push(await hitShared("outage-key", 2, 60_000));
    assert.deepEqual(outage.map((r) => r.allowed), [true, true, false, false]);
  } finally { await h.close().catch(() => undefined); }
});
