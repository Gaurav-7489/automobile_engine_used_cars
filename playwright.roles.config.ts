import { defineConfig } from "@playwright/test";
import { generateKeyPairSync } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { staffRoles } from "./packages/contracts/src/platform";

// A real signed-token/HTTPS-JWKS fixture, isolated from shared environments.
// Never disable TLS verification or add test bypasses to application auth.
let directory = process.env.VANDLABS_ROLE_FIXTURE_DIR;
if (!directory) {
  directory = mkdtempSync(join(tmpdir(), "vandlabs-role-auth-"));
  process.env.VANDLABS_ROLE_FIXTURE_DIR = directory;
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  writeFileSync(join(directory, "jwt.pem"), keys.privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  writeFileSync(join(directory, "jwks.json"), JSON.stringify({ keys: [{ ...keys.publicKey.export({ format: "jwk" }), kid: "isolated-role-test", use: "sig", alg: "RS256" }] }));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(directory, "tls.key"), "-out", join(directory, "tls.crt"), "-days", "1", "-subj", "/CN=VandLabs isolated test issuer", "-addext", "subjectAltName=IP:127.0.0.1"], { stdio: "ignore" });
}
const principals = Object.fromEntries(Object.entries(staffRoles).map(([role, capabilities]) => [role, { userId: role, tenantId: "tenant-apex", dealershipIds: ["dealer-select"], locationIds: ["loc-kochi", "loc-bengaluru"], capabilities: [...capabilities], ...(role === "sales" ? { assignedLeadOnly: true } : {}) }]));
export default defineConfig({
  testDir: "./tests/role-e2e", outputDir: "role-test-results", workers: 1,
  use: { baseURL: "http://127.0.0.1:3001", trace: "off" },
  webServer: [
    { command: "node tests/role-e2e/issuer.mjs", url: "https://127.0.0.1:3443/jwks", ignoreHTTPSErrors: true, reuseExistingServer: false, env: { VANDLABS_ROLE_FIXTURE_DIR: directory } },
    { command: "pnpm --filter @vandlabs/command-center start", url: "http://127.0.0.1:3001/command/login", reuseExistingServer: false,
      env: { AUTH_MODE: "oidc", AUTH_REGISTRY_MODE: "environment", AUTH_PRINCIPALS_JSON: JSON.stringify(principals), DATA_MODE: "demo", OIDC_ISSUER: "https://127.0.0.1:3443", OIDC_JWKS_URL: "https://127.0.0.1:3443/jwks", OIDC_AUDIENCE: "isolated-dealer-api", OIDC_CLIENT_ID: "isolated-web", NODE_EXTRA_CA_CERTS: join(directory, "tls.crt") } },
  ],
});
