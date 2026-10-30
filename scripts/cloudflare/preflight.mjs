import { pathToFileURL } from "node:url";

/** Secrets the one Intelligence Worker needs; APP_ORIGIN is a plain variable. */
export const workerSecrets = ["DATABASE_URL", "SESSION_SECRET"];
export const requiredVariables = ["CLOUDFLARE_ACCOUNT_ID", "APP_ORIGIN"];

/** Read-only check before a deploy. Never logs values, response bodies or headers. */
export async function preflight(env, request = fetch) {
  const missing = [...workerSecrets, ...requiredVariables, "CLOUDFLARE_API_TOKEN"].filter(key => !env[key]?.trim());
  const checks = [];
  if (env.APP_ORIGIN && !/^https:\/\/[^/]+$/.test(env.APP_ORIGIN)) checks.push({ name: "app-origin", status: "failed" });
  if (env.SESSION_SECRET && env.SESSION_SECRET.length < 32) checks.push({ name: "session-secret-length", status: "failed" });
  const account = env.CLOUDFLARE_ACCOUNT_ID;
  if (env.CLOUDFLARE_API_TOKEN && /^[a-f0-9]{32}$/.test(account ?? "")) {
    try {
      const response = await request(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts`, {
        method: "GET", redirect: "error", signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
      });
      checks.push({ name: "worker-script-access", status: response.ok ? "passed" : "failed" });
    } catch { checks.push({ name: "worker-script-access", status: "failed" }); }
  } else if (account) checks.push({ name: "account-id", status: "failed" });
  return { ready: !missing.length && checks.every(c => c.status === "passed"), missing, checks };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  preflight(process.env).then(result => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ready ? 0 : 1);
  });
}
