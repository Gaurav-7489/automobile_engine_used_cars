import { test } from "node:test";
import assert from "node:assert/strict";
import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { StaffIdentityStack } from "../lib/staff-identity-stack.js";

test("identity-only template requires TOTP MFA, disables signup, retains users and creates no compute/database resources", () => {
  const stack = new StaffIdentityStack(new App(), "IdentityTest", { environmentName: "staging", publicOrigin: "https://staging.vandlabs.test", env: { account: "111122223333", region: "ap-south-1" } });
  const template = Template.fromStack(stack);
  const json = template.toJSON();
  const resources = Object.values(json.Resources) as Array<{ Type: string; Properties: Record<string, unknown>; DeletionPolicy?: string }>;
  assert.ok(resources.every(r => r.Type.startsWith("AWS::Cognito::")));
  const pool = resources.find(r => r.Type === "AWS::Cognito::UserPool")!;
  assert.equal(pool.Properties.MfaConfiguration, "ON");
  assert.deepEqual(pool.Properties.EnabledMfas, ["SOFTWARE_TOKEN_MFA"]);
  assert.deepEqual(pool.Properties.AdminCreateUserConfig, { AllowAdminCreateUserOnly: true });
  assert.equal(pool.Properties.UserPoolTier, "LITE");
  assert.equal(pool.Properties.DeletionProtection, "ACTIVE");
  assert.equal(pool.DeletionPolicy, "Retain");
  const clients = resources.filter(r => r.Type === "AWS::Cognito::UserPoolClient");
  assert.equal(clients.length, 2);
  for (const client of clients) {
    assert.equal(client.Properties.GenerateSecret, false);
    assert.equal(client.Properties.EnableTokenRevocation, true);
    assert.deepEqual(client.Properties.AllowedOAuthFlows, ["code"]);
    assert.equal(client.Properties.AccessTokenValidity, 15);
  }
  const web = clients.find(c => (c.Properties.CallbackURLs as string[]).some(url => url.startsWith("https:")))!;
  assert.deepEqual(web.Properties.CallbackURLs, ["https://staging.vandlabs.test/command/auth/callback", "https://staging.vandlabs.test/platform/auth/callback"]);
  assert.deepEqual(web.Properties.LogoutURLs, ["https://staging.vandlabs.test/command/login", "https://staging.vandlabs.test/platform/login"]);
});

test("identity stack rejects unknown environments and unsafe redirect origins", () => {
  for (const publicOrigin of ["http://example.test", "https://user:pass@example.test", "https://example.test/path", "https://example.test/?x=1", "https://example.invalid", "https://example.com"]) {
    assert.throws(() => new StaffIdentityStack(new App(), "Bad", { environmentName: "staging", publicOrigin }));
  }
  assert.throws(() => new StaffIdentityStack(new App(), "BadEnv", { environmentName: "demo", publicOrigin: "https://staging.vandlabs.test" }));
});
