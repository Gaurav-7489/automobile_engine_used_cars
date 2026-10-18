import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, copyFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
const files = ["apps/web/wrangler.jsonc", "apps/command-center/wrangler.jsonc", "apps/platform/wrangler.jsonc", "infra/cloudflare/wrangler.jsonc", "infra/cloudflare/admission.wrangler.jsonc", "infra/cloudflare/notifications.wrangler.jsonc", "infra/cloudflare/dealer-ai/wrangler.jsonc"];

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
      const dealerAi = await json("infra/cloudflare/dealer-ai/wrangler.jsonc");
      assert.equal(dealerAi.name, `${prefix}-dealer-ai`, "each environment has its own AI Worker and token");
      assert.equal(dealerAi.workers_dev, false, "apps use the service binding; no public AI URL by default");
      assert.equal(dealerAi.preview_urls, false);
      const command = await json("apps/command-center/wrangler.jsonc");
      assert.deepEqual(command.services.find((b: { binding: string }) => b.binding === "DEALER_AI"), { binding: "DEALER_AI", service: `${prefix}-dealer-ai` });
      for (const app of ["web", "platform"]) assert.ok(!(await json(`apps/${app}/wrangler.jsonc`)).services.some((b: { binding: string }) => b.binding === "DEALER_AI"), app);
      const web = await json("apps/web/wrangler.jsonc");
      assert.deepEqual(web.services.find((b: { binding: string }) => b.binding === "DISCOVERY_AI"), { binding: "DISCOVERY_AI", service: `${prefix}-dealer-ai` }, "buyer search reaches its own environment's AI Worker");
      assert.equal(web.vars.DISCOVERY_AI_ENABLED, "false", "buyer AI summaries stay off unless the owner enables them");
      for (const app of ["command-center", "platform"]) assert.ok(!(await json(`apps/${app}/wrangler.jsonc`)).services.some((b: { binding: string }) => b.binding === "DISCOVERY_AI"), app);
    }
    const publicAi = spawnSync(process.execPath, [resolve("scripts/cloudflare/configure.mjs")], { cwd: directory, encoding: "utf8", env: { ...process.env, CF_ENVIRONMENT: "staging", CF_SHARED_DATA: "false", CF_PUBLIC_ORIGIN: "https://vandlabs-staging-gateway.vandlabs-automobile.workers.dev", SEO_INDEXABLE: "false", DEALER_AI_PUBLIC: "true" } });
    assert.equal(publicAi.status, 0, publicAi.stderr);
    assert.equal((await json("infra/cloudflare/dealer-ai/wrangler.jsonc")).workers_dev, true, "external hosts can opt in to the public URL");
    const rejected = run("staging", "true"); assert.equal(rejected.status, 1); assert.match(rejected.stderr, /Staging must not be indexed/);
    assert.equal(run("typo").status, 1);
    const before = await Promise.all(files.map(file => readFile(join(directory, file), "utf8")));
    const wrongOrigin = run("staging", "false", "https://vandlabs-gateway.vandlabs-automobile.workers.dev");
    assert.equal(wrongOrigin.status, 1);
    assert.deepEqual(await Promise.all(files.map(file => readFile(join(directory, file), "utf8"))), before);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("free-plan configuration drops CPU limits the Workers Free plan rejects; paid keeps them", async () => {
  const directory = await mkdtemp(join(tmpdir(), "vandlabs-plan-config-"));
  try {
    for (const file of files) { await mkdir(dirname(join(directory, file)), { recursive: true }); await copyFile(file, join(directory, file)); }
    const run = (plan: string) => spawnSync(process.execPath, [resolve("scripts/cloudflare/configure.mjs")], { cwd: directory, encoding: "utf8", env: { ...process.env, CF_ENVIRONMENT: "staging", CF_SHARED_DATA: "false", CF_PUBLIC_ORIGIN: "https://vandlabs-staging-gateway.vandlabs-automobile.workers.dev", SEO_INDEXABLE: "false", CF_PLAN: plan } });
    const limited = ["apps/web/wrangler.jsonc", "infra/cloudflare/wrangler.jsonc", "infra/cloudflare/admission.wrangler.jsonc", "infra/cloudflare/notifications.wrangler.jsonc"];
    let result = run("free"); assert.equal(result.status, 0, result.stderr);
    for (const file of files) assert.equal(JSON.parse(await readFile(join(directory, file), "utf8")).limits, undefined, file);
    for (const file of files) await copyFile(file, join(directory, file));
    result = run("paid"); assert.equal(result.status, 0, result.stderr);
    for (const file of limited) assert.ok(JSON.parse(await readFile(join(directory, file), "utf8")).limits?.cpu_ms, file);
    assert.equal(run("enterprise").status, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("shared staging configuration supports Cognito without OIDC secrets and rejects demo or incomplete identity before mutation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "vandlabs-cognito-config-"));
  try {
    for (const file of files) { await mkdir(dirname(join(directory, file)), { recursive: true }); await copyFile(file, join(directory, file)); }
    const origin = "https://vandlabs-staging-gateway.vandlabs-automobile.workers.dev";
    const env = { ...process.env, CF_ENVIRONMENT: "staging", CF_SHARED_DATA: "true", CF_PUBLIC_ORIGIN: origin, SEO_INDEXABLE: "false", DATABASE_URL: "postgresql://vandlabs_runtime:test@ep-test-pooler.ap-south-1.aws.neon.tech/test?sslmode=require", TENANT_CONFIG_JSON: JSON.stringify({seo:{canonicalBase:origin}}), SESSION_SECRET: "test", AUTH_MODE: "cognito", COGNITO_DOMAIN: "https://staff.auth.ap-south-1.amazoncognito.com", COGNITO_USER_POOL_ID: "ap-south-1_test", COGNITO_CLIENT_ID: "client-test" };
    const run = (values: typeof env) => spawnSync(process.execPath, [resolve("scripts/cloudflare/configure.mjs")], { cwd: directory, encoding: "utf8", env: values });
    const result = run(env); assert.equal(result.status, 0, result.stderr);
    for (const app of ["web", "command-center", "platform"]) {
      const config = JSON.parse(await readFile(join(directory, `apps/${app}/wrangler.jsonc`), "utf8"));
      assert.equal(config.vars.AUTH_MODE, "cognito");
      assert.equal(config.vars.DATA_MODE, "neon");
      assert.equal(config.vars.NEXT_PUBLIC_PREVIEW_READ_ONLY, "false");
      assert.ok(!JSON.stringify(config).includes("client-test"));
    }
    const before = await Promise.all(files.map(file => readFile(join(directory, file), "utf8")));
    assert.equal(run({ ...env, AUTH_MODE: "demo" }).status, 1);
    assert.equal(run({ ...env, COGNITO_CLIENT_ID: "" }).status, 1);
    assert.deepEqual(await Promise.all(files.map(file => readFile(join(directory, file), "utf8"))), before);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("deploy rejects Dealer AI tokens the Worker could never accept, before any network call", async () => {
  const directory = await mkdtemp(join(tmpdir(), "vandlabs-deploy-tokens-"));
  try {
    for (const file of ["infra/cloudflare/wrangler.jsonc", "apps/web/wrangler.jsonc"]) { await mkdir(dirname(join(directory, file)), { recursive: true }); await copyFile(file, join(directory, file)); }
    const deploy = (env: Record<string, string>) => spawnSync(process.execPath, [resolve("scripts/cloudflare/deploy.mjs")], { cwd: directory, encoding: "utf8", env: { PATH: process.env.PATH ?? "", CLOUDFLARE_API_TOKEN: "test-token-not-used", ...env } });
    const valid = "A".repeat(43);
    for (const env of [{ DEALER_AI_SERVICE_TOKEN: "test" }, { DEALER_AI_SERVICE_TOKEN: valid, DEALER_AI_SERVICE_TOKEN_ALTERNATE: "A".repeat(44) }, { DEALER_AI_SERVICE_TOKEN: valid.slice(1) + "=" }, { DISCOVERY_AI_SERVICE_TOKEN: "test" }]) {
      const result = deploy(env);
      assert.equal(result.status, 1); assert.match(result.stderr, /must be 32 random bytes encoded as base64url/);
      assert.ok(!result.stderr.includes(valid), "token values are never echoed");
    }
    const orphan = deploy({ DEALER_AI_SERVICE_TOKEN_ALTERNATE: valid });
    assert.equal(orphan.status, 1); assert.match(orphan.stderr, /ALTERNATE requires DEALER_AI_SERVICE_TOKEN/);
    const discoveryOrphan = deploy({ DISCOVERY_AI_SERVICE_TOKEN_ALTERNATE: valid });
    assert.equal(discoveryOrphan.status, 1); assert.match(discoveryOrphan.stderr, /ALTERNATE requires DISCOVERY_AI_SERVICE_TOKEN/);
    const shared = deploy({ DEALER_AI_SERVICE_TOKEN: valid, DISCOVERY_AI_SERVICE_TOKEN: valid });
    assert.equal(shared.status, 1); assert.match(shared.stderr, /different token for buyer discovery/);
    assert.ok(!shared.stderr.includes(valid));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
