import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("deployment doctor executes as ESM and reports missing configuration without a transform failure", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/deployment/doctor.ts", "command"], {
    encoding: "utf8",
    env: { ...process.env, DATA_MODE: "demo", AUTH_MODE: "demo", DATABASE_URL: "", TENANT_CONFIG_JSON: "", APP_ORIGIN: "", SESSION_SECRET: "", GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", AUTH_REGISTRY_MODE: "", AUTH_PRINCIPALS_JSON: "" },
  });
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  const report = JSON.parse(result.stdout);
  assert.equal(report.ready, false);
  assert.equal(report.surface, "command");
  assert.ok(report.checks.some((c: { key: string; ready: boolean }) => c.key === "database" && !c.ready));
});
