import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { AuthorizationError, type AuthenticatedPrincipal } from "../../packages/contracts/src/index";
import {
  AuthenticationError, authMode, createCognitoVerifier, createPrincipalResolver, requireLeadAccess,
} from "../../packages/server-auth/src/index";

const principal: AuthenticatedPrincipal = {
  userId: "staff-1", tenantId: "tenant-a", dealershipIds: ["dealer-a"],
  locationIds: ["location-a"], capabilities: ["lead:read", "lead:write", "task:write"],
};
const env = {
  AUTH_MODE: "cognito", COGNITO_USER_POOL_ID: "us-east-1_testpool", COGNITO_CLIENT_ID: "test-client",
  AUTH_PRINCIPALS_JSON: JSON.stringify({ "staff-1": principal }),
};
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const verifier = createCognitoVerifier(env);
verifier.cacheJwks({ keys: [{ ...keys.publicKey.export({ format: "jwk" }), kid: "test-key", alg: "RS256", use: "sig" }] });
function token(overrides: Record<string, unknown> = {}, privateKey = keys.privateKey) {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "test-key" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    sub: "staff-1", iss: "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_testpool",
    client_id: "test-client", token_use: "access", exp: Math.floor(Date.now() / 1000) + 300,
    ...overrides,
  })).toString("base64url");
  const input = `${header}.${payload}`;
  return `${input}.${sign("RSA-SHA256", Buffer.from(input), privateKey).toString("base64url")}`;
}
const resolve = createPrincipalResolver({ demoPrincipal: principal, env, verifyToken: (jwt) => verifier.verify(jwt) });
function request(jwt?: string, extra: Record<string, string> = {}, method = "GET") {
  return new Request("https://dealer.example/command/api/leads/lead-a", {
    method, headers: { ...(jwt ? { authorization: `Bearer ${jwt}` } : {}), ...extra },
  });
}
function unauthorized(error: unknown) {
  return error instanceof AuthenticationError && error.status === 401;
}

test("verified access token resolves only server-provisioned scope", async () => {
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
  ["wrong client", { client_id: "another-client" }], ["ID token", { token_use: "id", aud: "test-client" }],
] as const) {
  test(`rejects ${name}`, async () => { await assert.rejects(resolve(request(token(claims))), unauthorized); });
}
test("rejects a token signed by a different key", async () => {
  const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
  await assert.rejects(resolve(request(token({}, other.privateKey))), unauthorized);
});
test("valid but unprovisioned user is forbidden", async () => {
  await assert.rejects(resolve(request(token({ sub: "unknown" }))), AuthorizationError);
});
test("malformed server registry fails closed", async () => {
  for (const registry of [undefined, "{", "[]", '{"staff-1":{"tenantId":"tenant-a"}}',
    JSON.stringify({ "staff-1": { ...principal, capabilities: ["superuser"] } })]) {
    const resolver = createPrincipalResolver({ demoPrincipal: principal,
      env: { ...env, AUTH_PRINCIPALS_JSON: registry }, verifyToken: (jwt) => verifier.verify(jwt) });
    await assert.rejects(resolver(request(token())), (error: unknown) => error instanceof AuthenticationError && error.status === 503);
  }
});
test("missing or mistyped production auth mode never enables demo", () => {
  for (const AUTH_MODE of [undefined, "congito", ""]) {
    assert.throws(() => authMode({ NODE_ENV: "production", AUTH_MODE }), AuthenticationError);
  }
  assert.equal(authMode({ NODE_ENV: "development" }), "demo");
  assert.equal(authMode({ NODE_ENV: "production", AUTH_MODE: "demo" }), "demo");
});
test("demo identity is blocked for Aurora and cannot be mutated by callers", async () => {
  const demo = createPrincipalResolver({ demoPrincipal: principal, env: { AUTH_MODE: "demo" } });
  const first = await demo(request()); first.capabilities.push("platform:admin");
  assert.deepEqual(await demo(request()), principal);
  const production = createPrincipalResolver({ demoPrincipal: principal, env: { AUTH_MODE: "demo", DATA_MODE: "aurora" } });
  await assert.rejects(production(request()), AuthenticationError);
});
test("cookie mutations require same origin; bearer clients can operate without browser origin", async () => {
  const cookie = `__Host-vandlabs-access-token=${token()}`;
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
 const multi=createCognitoVerifier({...env,COGNITO_CLIENT_IDS:"test-client, desktop-client"});
 multi.cacheJwks({keys:[{...keys.publicKey.export({format:"jwk"}),kid:"test-key",alg:"RS256",use:"sig"}]});
 assert.equal((await multi.verify(token({client_id:"desktop-client"}))).sub,"staff-1");
 await assert.rejects(multi.verify(token({client_id:"unregistered-client"})));
});
