import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const baseSecrets = ["DATABASE_URL", "TENANT_CONFIG_JSON", "SESSION_SECRET"];
const oidcSecrets = [ "OIDC_ISSUER", "OIDC_AUDIENCE", "OIDC_JWKS_URL", "OIDC_CLIENT_ID", "OIDC_AUTHORIZE_URL", "OIDC_TOKEN_URL", "OIDC_REVOKE_URL"];
const cognitoSecrets = ["COGNITO_DOMAIN", "COGNITO_USER_POOL_ID", "COGNITO_CLIENT_ID"];
export const runtimeSecrets = [...baseSecrets, ...oidcSecrets];
export const runtimeVariables = ["CLOUDFLARE_ACCOUNT_ID", "CF_PUBLIC_ORIGIN"];

// Only allow fixed Cloudflare endpoints. Never log response bodies, headers or errors
// that could contain credentials. This performs no deployment or billing mutations.
export async function preflight(env, request = fetch) {
  const mode = env.AUTH_MODE || "oidc";
  const required = [...baseSecrets, ...(mode === "cognito" ? cognitoSecrets : oidcSecrets), ...runtimeVariables];
  const missing = required.filter(key => !env[key]?.trim());
  const account = env.CLOUDFLARE_ACCOUNT_ID || env.CF_PREFLIGHT_ACCOUNT_ID;
  const checks = [];
  if (!["oidc", "cognito"].includes(mode)) checks.push({ name: "staff-auth-mode", status: "failed" });
  if (!env.CLOUDFLARE_API_TOKEN?.trim()) checks.push({ name: "deployment-token", status: "failed" });
  else if (!/^[a-f0-9]{32}$/.test(account || "")) checks.push({ name: "account-id", status: "failed" });
  else {
    for (const [name, suffix, optional] of [
      ["worker-script-access", "workers/scripts", false],
      ["r2-bucket-access", "r2/buckets", false],
      ["workers-subscription", "subscriptions", true],
    ]) {
      try {
        const response = await request(`https://api.cloudflare.com/client/v4/accounts/${account}/${suffix}`, {
          method: "GET", redirect: "error", signal: AbortSignal.timeout(10000),
          headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
        });
        const body = await response.json();
        const success = response.ok && body.success === true;
        const check = { name, status: success ? "passed" : optional ? "unverified" : "failed" };
        if (name === "workers-subscription" && success) {
          const subscriptions = Array.isArray(body.result) ? body.result : [];
          const paid = subscriptions.some(s => /worker/i.test(s.rate_plan?.id || "") && s.state === "Paid" && Number(s.price) > 0);
          // Reading billing records is not proof that an appropriate Workers plan exists.
          check.status = paid ? "passed" : "unverified";
        }
        checks.push(check);
      } catch {
        checks.push({ name, status: optional ? "unverified" : "failed" });
      }
    }
  }
  const credentialsReady = !checks.some(c => c.status === "failed");
  return { credentialsReady, runtimeConfigured: missing.length === 0, missing, checks,
    deploymentAccepted: false, note: "Read-only checks cannot prove deployment/edit permissions, MFA, database connectivity or production acceptance." };
}

export function formatReport(report) {
  return ["## Cloudflare deployment preflight", "", ...report.checks.map(c => `- ${c.name}: ${c.status}`),
    "", `Runtime configuration: ${report.runtimeConfigured ? "present (not validated)" : "blocked"}`,
    ...report.missing.map(key => `- Missing: ${key}`), "", report.note, ""].join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await preflight(process.env);
  const output = formatReport(report);
  console.log(output);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, output);
  process.exitCode = report.credentialsReady && report.runtimeConfigured ? 0 : 1;
}
