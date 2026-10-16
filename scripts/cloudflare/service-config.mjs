// Only the Command Center's dealer recommendations call /explain. Never pass
// its credential or licensed-feed credentials to the public or platform apps.
export function serviceSecrets(surface, secrets) {
  const commandOnly = new Set(["DEALER_AI_URL", "DEALER_AI_SERVICE_TOKEN", "VANDLABS_FEEDS_JSON", "VANDLABS_FEED_TOKENS_JSON"]);
  const notificationOnly = new Set(["RESEND_API_KEY", "NOTIFICATION_FROM", "NOTIFICATION_TO"]);
  if (!["web", "command-center", "platform"].includes(surface)) throw new Error("Unknown application surface");
  return Object.fromEntries(Object.entries(secrets).filter(([key]) => !notificationOnly.has(key) && (surface === "command-center" || !commandOnly.has(key))));
}

export function dealerAIConfiguration(env) {
  const endpoint = env.DEALER_AI_URL, token = env.DEALER_AI_SERVICE_TOKEN;
  if (!endpoint && !token) return { name: "dealer-ai-configuration", status: "disabled" };
  let validURL = false;
  try {
    const url = new URL(endpoint);
    validURL = endpoint === endpoint.trim() && url.protocol === "https:" && !url.username && !url.password && url.pathname === "/explain" && !url.search && !url.hash;
  } catch { /* Report only a fixed status, never a credential-bearing URL. */ }
  return { name: "dealer-ai-configuration", status: validURL && /^[A-Za-z0-9_-]{43}$/.test(token || "") ? "passed" : "failed" };
}
