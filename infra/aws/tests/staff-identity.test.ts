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

test("single sign-in adds a Google provider and an Intelligence client without a secret in the template", () => {
  const stack = new StaffIdentityStack(new App(), "SsoTest", { environmentName: "staging", publicOrigin: "https://staging.vandlabs.test", intelligenceOrigin: "https://intelligence.vandlabs.test", googleClientId: "google-client.apps.googleusercontent.com", env: { account: "111122223333", region: "ap-south-1" } });
  const template = Template.fromStack(stack);
  const json = template.toJSON();
  const resources = Object.values(json.Resources) as Array<{ Type: string; Properties: Record<string, any> }>;
  const provider = resources.find(r => r.Type === "AWS::Cognito::UserPoolIdentityProvider")!;
  assert.equal(provider.Properties.ProviderType, "Google");
  assert.deepEqual(provider.Properties.AttributeMapping, { email: "email", name: "name" });
  assert.ok(JSON.stringify(provider.Properties.ProviderDetails.client_secret).includes("GoogleClientSecret"));
  assert.equal(json.Parameters.GoogleClientSecret.NoEcho, true);
  const clients = resources.filter(r => r.Type === "AWS::Cognito::UserPoolClient");
  assert.equal(clients.length, 3);
  const intelligence = clients.find(c => (c.Properties.CallbackURLs as string[])[0] === "https://intelligence.vandlabs.test/api/auth/sso/google/callback")!;
  assert.deepEqual(intelligence.Properties.SupportedIdentityProviders, ["COGNITO", "Google"]);
  assert.deepEqual(intelligence.Properties.AllowedOAuthFlows, ["code"]);
  // The desktop client keeps Cognito-only sign-in.
  const desktop = clients.find(c => (c.Properties.CallbackURLs as string[])[0].startsWith("http://localhost"))!;
  assert.deepEqual(desktop.Properties.SupportedIdentityProviders, ["COGNITO"]);
});

test("Google sign-in requires a real Intelligence origin", () => {
  assert.throws(() => new StaffIdentityStack(new App(), "A", { environmentName: "staging", publicOrigin: "https://staging.vandlabs.test", googleClientId: "x" }));
  assert.throws(() => new StaffIdentityStack(new App(), "B", { environmentName: "staging", publicOrigin: "https://staging.vandlabs.test", intelligenceOrigin: "http://intelligence.test" }));
});
