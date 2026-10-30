import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { preflight } from "../../scripts/cloudflare/preflight.mjs";

const jsonc = async (file: string) => JSON.parse((await readFile(file, "utf8")).replace(/^\s*\/\/.*$/gm, ""));

test("one Worker: the Intelligence app, no secrets in config, no public preview URLs", async () => {
  const config = await jsonc("apps/intelligence/wrangler.jsonc");
  assert.equal(config.name, "vandlabs-app");
  assert.equal(config.main, ".open-next/worker.js");
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  for (const key of ["DATABASE_URL", "SESSION_SECRET"]) assert.equal(config.vars[key], undefined, `${key} must be a secret`);
});

test("preflight lists missing settings without network access and passes with a working token", async () => {
  const empty = await preflight({}, async () => { throw new Error("no network"); });
  assert.equal(empty.ready, false);
  assert.deepEqual([...empty.missing].sort(), ["APP_ORIGIN", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN", "DATABASE_URL", "SESSION_SECRET"]);
  const env = { DATABASE_URL: "postgres://x", SESSION_SECRET: "s".repeat(40), CLOUDFLARE_ACCOUNT_ID: "a".repeat(32), APP_ORIGIN: "https://app.example.com", CLOUDFLARE_API_TOKEN: "t" };
  assert.equal((await preflight(env, async () => new Response("{}", { status: 200 }))).ready, true);
  assert.equal((await preflight(env, async () => new Response("{}", { status: 403 }))).ready, false);
  assert.equal((await preflight({ ...env, APP_ORIGIN: "http://app.example.com/path" }, async () => new Response("{}"))).ready, false);
  assert.equal((await preflight({ ...env, SESSION_SECRET: "short" }, async () => new Response("{}"))).ready, false);
});
