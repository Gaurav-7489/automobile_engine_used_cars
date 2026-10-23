import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { SignJWT, importJWK } from "jose";
import { AuthorizationError, type AuthenticatedPrincipal } from "../../packages/contracts/src/index";
import {
  AuthenticationError, authMode, createGoogleVerifier, createPrincipalResolver, requireLeadAccess,
} from "../../packages/server-auth/src/index";

const principal: AuthenticatedPrincipal = {
  userId: "staff@dealer.example", tenantId: "tenant-a", dealershipIds: ["dealer-a"],
  locationIds: ["location-a"], capabilities: ["lead:read", "lead:write", "task:write"],
};
const env = {
  AUTH_MODE: "google", GOOGLE_CLIENT_ID: "test-client.apps.googleusercontent.com",
  AUTH_PRINCIPALS_JSON: JSON.stringify({ "staff@dealer.example": principal }),
};
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const localKeys = async () => keys.publicKey as never;
const verifier = createGoogleVerifier(env, localKeys);
async function token(overrides: Record<string, unknown> = {}, privateKey = keys.privateKey) {
  const { exp, iss, aud, ...claims } = { exp: Math.floor(Date.now() / 1000) + 300, iss: "https://accounts.google.com", aud: env.GOOGLE_CLIENT_ID, ...overrides } as Record<string, unknown>;
  return new SignJWT({ sub: "1234567890", email: "Staff@Dealer.example", email_verified: true, ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" }).setIssuedAt().setIssuer(iss as string).setAudience(aud as string)
    .setExpirationTime(exp as number).sign(privateKey);
}
void importJWK;
const resolver0 = createPrincipalResolver({ demoPrincipal: principal, env, verifyToken: verifier });
const resolve = async (r: Request | Promise<Request>) => resolver0(await r);
async function request(jwt?: string | Promise<string>, extra: Record<string, string> = {}, method = "GET") {
  const bearer = await jwt;
  return new Request("https://dealer.example/command/api/leads/lead-a", {
    method, headers: { ...(bearer ? { authorization: `Bearer ${bearer}` } : {}), ...extra },
  });
}
function unauthorized(error: unknown) {
  return error instanceof AuthenticationError && error.status === 401;
}

test("verified Google ID token resolves only server-provisioned scope", async () => {
  assert.deepEqual(await resolve(request(token({ "custom:tenant_id": "tenant-b" }), {
    "x-vandlabs-user-id": "attacker", "x-vandlabs-tenant-id": "tenant-b", "x-vandlabs-capabilities": "platform:admin",
  })), principal);
});
test("forged upstream identity headers are not authentication", async () => {
  await assert.rejects(resolve(request(undefined, {
    "x-vandlabs-user-id": "staff-1", "x-vandlabs-tenant-id": "tenant-a", "x-vandlabs-capabilities": "task:write",
  })), unauthorized);
});
for (const [name, claims] of [
  ["expired token", { exp: 1 }], ["wrong issuer", { iss: "https://attacker.example" }],
  ["wrong client", { aud: "another-client" }], ["unverified email", { email_verified: false }],
  ["missing email", { email: undefined }],
] as const) {
  test(`rejects ${name}`, async () => { await assert.rejects(resolve(request(token(claims))), unauthorized); });
}
test("rejects a token signed by a different key", async () => {
  const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
  await assert.rejects(resolve(request(token({}, other.privateKey))), unauthorized);
});
test("valid but unprovisioned user is forbidden", async () => {
  await assert.rejects(resolve(request(token({ email: "unknown@dealer.example" }))), AuthorizationError);
});
test("malformed server registry fails closed", async () => {
  for (const registry of [undefined, "{", "[]", '{"staff@dealer.example":{"tenantId":"tenant-a"}}',
    JSON.stringify({ "staff@dealer.example": { ...principal, capabilities: ["superuser"] } })]) {
    const resolver = createPrincipalResolver({ demoPrincipal: principal,
      env: { ...env, AUTH_PRINCIPALS_JSON: registry }, verifyToken: verifier });
    await assert.rejects(resolver(await request(token())), (error: unknown) => error instanceof AuthenticationError && error.status === 503);
  }
});
test("missing or mistyped production auth mode never enables demo", () => {
  for (const AUTH_MODE of [undefined, "cognito", "googel", ""]) {
    assert.throws(() => authMode({ NODE_ENV: "production", AUTH_MODE }), AuthenticationError);
  }
  assert.equal(authMode({ NODE_ENV: "development" }), "demo");
  assert.equal(authMode({ NODE_ENV: "production", AUTH_MODE: "demo" }), "demo");
});
test("demo identity is blocked for Aurora and cannot be mutated by callers", async () => {
  const demo = createPrincipalResolver({ demoPrincipal: principal, env: { AUTH_MODE: "demo" } });
  const first = await demo(await request()); first.capabilities.push("platform:admin");
  assert.deepEqual(await demo(await request()), principal);
  const production = createPrincipalResolver({ demoPrincipal: principal, env: { AUTH_MODE: "demo", DATA_MODE: "aurora" } });
  await assert.rejects(production(await request()), AuthenticationError);
});
test("cookie mutations require same origin; bearer clients can operate without browser origin", async () => {
  const cookie = `__Host-vandlabs-access-token=${await token()}`;
  await assert.rejects(resolve(request(undefined, { cookie }, "PATCH")), AuthorizationError);
  await assert.rejects(resolve(request(undefined, { cookie, origin: "https://attacker.example" }, "PATCH")), AuthorizationError);
  assert.deepEqual(await resolve(request(undefined, { cookie, origin: "https://dealer.example" }, "PATCH")), principal);
  assert.deepEqual(await resolve(request(token(), {}, "PATCH")), principal);
  await assert.rejects(resolve(request(undefined, { cookie, authorization: "Basic invalid" })), unauthorized);
});
const lead = { tenantId: "tenant-a", dealershipId: "dealer-a", locationId: "location-a" };
test("lead and task authorization enforce capability, tenant, dealership and location", () => {
  for (const capability of ["lead:write", "task:write"] as const) {
    assert.doesNotThrow(() => requireLeadAccess(principal, lead, capability));
    for (const denied of [
      { ...principal, capabilities: [] }, { ...principal, tenantId: "tenant-b" },
      { ...principal, dealershipIds: ["dealer-b"] }, { ...principal, locationIds: ["location-b"] },
    ]) assert.throws(() => requireLeadAccess(denied, lead, capability), AuthorizationError);
  }
});

test("web and desktop clients are accepted only from the explicit configured client list", async () => {
 const multi=createGoogleVerifier({...env,GOOGLE_CLIENT_IDS:"test-client.apps.googleusercontent.com, desktop-client"},localKeys);
 assert.equal((await multi(await token({aud:"desktop-client"}))).sub,"staff@dealer.example");
 await assert.rejects(multi(await token({aud:"unregistered-client"})));
});
test("optional Workspace domain restriction rejects other accounts", async () => {
 const restricted=createGoogleVerifier({...env,GOOGLE_ALLOWED_DOMAIN:"dealer.example"},localKeys);
 assert.equal((await restricted(await token({hd:"dealer.example"}))).sub,"staff@dealer.example");
 await assert.rejects(restricted(await token({})));
 await assert.rejects(restricted(await token({hd:"other.example"})));
});
test("Google access tokens that are not signed ID tokens are rejected", async () => {
 await assert.rejects(verifier("ya29.opaque-access-token"));
});
