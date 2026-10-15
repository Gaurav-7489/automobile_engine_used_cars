import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, copyFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
const files = ["apps/web/wrangler.jsonc", "apps/command-center/wrangler.jsonc", "apps/platform/wrangler.jsonc", "infra/cloudflare/wrangler.jsonc", "infra/cloudflare/admission.wrangler.jsonc", "infra/cloudflare/notifications.wrangler.jsonc"];

test("staging configuration isolates every Worker, service binding, media/cache bucket and search index", async () => {
  const directory = await mkdtemp(join(tmpdir(), "vandlabs-staging-config-"));
  try {
    for (const file of files) { await mkdir(dirname(join(directory, file)), { recursive: true }); await copyFile(file, join(directory, file)); }
    const json = async (path: string) => JSON.parse(await readFile(join(directory, path), "utf8"));
    const run = (target: string, indexable = "false", suppliedOrigin?: string) => spawnSync(process.execPath, [resolve("scripts/cloudflare/configure.mjs")], {
      cwd: directory, encoding: "utf8", env: { ...process.env, CF_ENVIRONMENT: target, CF_SHARED_DATA: "false", CF_PUBLIC_ORIGIN: suppliedOrigin ?? `https://${target === "staging" ? "vandlabs-staging" : "vandlabs"}-gateway.vandlabs-automobile.workers.dev`, SEO_INDEXABLE: indexable },
    });
    for (const target of ["staging", "production", "staging"]) {
      const result = run(target); assert.equal(result.status, 0, result.stderr);
      const prefix = target === "staging" ? "vandlabs-staging" : "vandlabs";
      for (const app of ["web", "command-center", "platform"]) {
        const config = await json(`apps/${app}/wrangler.jsonc`);
        assert.equal(config.name, `${prefix}-${app}`);
        assert.equal(config.workers_dev, false);
        assert.equal(config.preview_urls, false);
        assert.equal(config.vars.SEO_INDEXABLE, "false");
        assert.equal(config.vars.NEXT_PUBLIC_PREVIEW_READ_ONLY, "true");
        assert.equal(config.services[0].service, config.name);
        assert.equal(config.durable_objects.bindings[0].script_name, `${prefix}-admission`);
        assert.deepEqual(config.r2_buckets.map((b: { bucket_name: string }) => b.bucket_name), [`${prefix}-${app}-cache`, `${prefix}-vehicle-media`]);
      }
      const gateway = await json("infra/cloudflare/wrangler.jsonc");
      assert.equal(gateway.name, `${prefix}-gateway`);
      assert.deepEqual(gateway.services.map((b: { service: string }) => b.service), [`${prefix}-web`, `${prefix}-command-center`, `${prefix}-platform`]);
      assert.equal(gateway.r2_buckets[0].bucket_name, `${prefix}-vehicle-media`);
      assert.equal(gateway.durable_objects.bindings[0].script_name, `${prefix}-admission`);
      assert.equal((await json("infra/cloudflare/admission.wrangler.jsonc")).name, `${prefix}-admission`);
      assert.equal((await json("infra/cloudflare/notifications.wrangler.jsonc")).name, `${prefix}-notifications`);
    }
    const rejected = run("staging", "true"); assert.equal(rejected.status, 1); assert.match(rejected.stderr, /Staging must not be indexed/);
    assert.equal(run("typo").status, 1);
    const before = await Promise.all(files.map(file => readFile(join(directory, file), "utf8")));
    const wrongOrigin = run("staging", "false", "https://vandlabs-gateway.vandlabs-automobile.workers.dev");
    assert.equal(wrongOrigin.status, 1);
    assert.deepEqual(await Promise.all(files.map(file => readFile(join(directory, file), "utf8"))), before);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
