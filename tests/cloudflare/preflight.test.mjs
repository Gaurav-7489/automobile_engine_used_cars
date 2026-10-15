import { test } from "node:test";
import assert from "node:assert/strict";
import { preflight, formatReport, runtimeSecrets, runtimeVariables } from "../../scripts/cloudflare/preflight.mjs";

const env = Object.fromEntries([...runtimeSecrets, ...runtimeVariables].map(key => [key, "configured"]));
env.CLOUDFLARE_ACCOUNT_ID = "a".repeat(32);
env.CLOUDFLARE_API_TOKEN = "sensitive-test-token";
const success = async () => ({ ok: true, json: async () => ({ success: true, result: [] }) });

test("missing token fails without making a request or revealing configuration values", async () => {
  const report = await preflight({ SESSION_SECRET: "private-session-value" }, () => { throw new Error("must not fetch"); });
  assert.equal(report.credentialsReady, false);
  assert.equal(report.runtimeConfigured, false);
  assert.ok(report.missing.includes("DATABASE_URL"));
  assert.doesNotMatch(formatReport(report), /private-session-value/);
});

test("fixed read-only endpoints reject redirects, use timeouts and bearer authentication", async () => {
  const calls = [];
  const report = await preflight(env, async (url, options) => { calls.push({ url, options }); return success(); });
  assert.equal(report.credentialsReady, true);
  assert.equal(report.runtimeConfigured, true);
  assert.equal(report.deploymentAccepted, false);
  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.equal(new URL(call.url).origin, "https://api.cloudflare.com");
    assert.equal(call.options.method, "GET");
    assert.equal(call.options.redirect, "error");
    assert.ok(call.options.signal instanceof AbortSignal);
    assert.equal(call.options.headers.Authorization, `Bearer ${env.CLOUDFLARE_API_TOKEN}`);
  }
  assert.equal(report.checks[2].status, "unverified");
});

test("authorization and network failures never include response or exception secrets", async () => {
  const report = await preflight(env, async url => {
    if (url.endsWith("subscriptions")) throw new Error(env.CLOUDFLARE_API_TOKEN);
    return { ok: false, json: async () => ({ success: false, errors: [{ message: env.SESSION_SECRET }] }) };
  });
  assert.equal(report.credentialsReady, false);
  const output = JSON.stringify(report) + formatReport(report);
  assert.doesNotMatch(output, /sensitive-test-token|configured/);
  assert.equal(report.checks[2].status, "unverified");
});

test("fallback account supports credential testing without hiding missing environment variables", async () => {
  const report = await preflight({ ...env, CLOUDFLARE_ACCOUNT_ID: "", CF_PREFLIGHT_ACCOUNT_ID: "b".repeat(32) }, success);
  assert.equal(report.credentialsReady, true);
  assert.equal(report.runtimeConfigured, false);
  assert.ok(report.missing.includes("CLOUDFLARE_ACCOUNT_ID"));
});

test("invalid account cannot inject a credential-bearing request destination", async () => {
  const report = await preflight({ ...env, CLOUDFLARE_ACCOUNT_ID: "../../attacker" }, () => { throw new Error("must not fetch"); });
  assert.equal(report.credentialsReady, false);
  assert.equal(report.checks[0].name, "account-id");
});
