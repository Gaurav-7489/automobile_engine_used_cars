import { test } from "node:test";
import assert from "node:assert/strict";
import { harness } from "./harness";
import { systemReport } from "../../apps/intelligence/lib/server/system-health";

test("system report: live database checks, every migration found, and no secret values", async () => {
  const h = await harness();
  const saved = { ...process.env };
  try {
    process.env.SESSION_SECRET = "s".repeat(40) + "-super-secret-value";
    process.env.RESEND_API_KEY = "re_secret_key_value";
    process.env.NOTIFICATION_FROM = "VandLabs <alerts@vandlabs.example>";
    process.env.APP_ORIGIN = "https://app.vandlabs.example";
    process.env.TEST_MANIFEST = JSON.stringify([{ name: "security", files: 2, tests: 5 }]);
    const report = await systemReport();
    const by = Object.fromEntries(report.checks.map((c) => [c.key, c]));
    assert.equal(by.db.status, "pass");
    assert.equal(by.rls.status, "pass", "the harness role cannot bypass row-level security");
    assert.equal(by.schema.status, "pass", JSON.stringify(report.migrations.filter((m) => !m.present)));
    assert.ok(report.migrations.length >= 16 && report.migrations.every((m) => m.present));
    assert.equal(by.session.status, "pass");
    assert.equal(by.email.status, "pass");
    assert.equal(by.origin.status, "pass");
    assert.deepEqual(report.tests, [{ name: "security", files: 2, tests: 5 }]);
    const text = JSON.stringify(report);
    assert.ok(!text.includes("super-secret") && !text.includes("re_secret_key_value"), "secret values never appear");
    delete process.env.RESEND_API_KEY;
    delete process.env.SESSION_SECRET;
    const degraded = Object.fromEntries((await systemReport()).checks.map((c) => [c.key, c.status]));
    assert.equal(degraded.email, "warn");
    assert.equal(degraded.session, "fail");
  } finally {
    process.env = saved;
    await h.close();
  }
});
