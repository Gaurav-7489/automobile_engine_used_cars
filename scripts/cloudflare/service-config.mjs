// Least privilege for Worker secrets: only the Command Center calls the Dealer AI Worker and
// reads licensed-feed credentials; only the public site calls discovery AI.
const commandOnly = new Set(["DEALER_AI_URL", "DEALER_AI_SERVICE_TOKEN", "VANDLABS_FEEDS_JSON", "VANDLABS_FEED_TOKENS_JSON"]);
const webOnly = new Set(["DISCOVERY_AI_SERVICE_TOKEN"]);
export function serviceSecrets(surface, secrets) {
  if (!["web", "command-center", "platform"].includes(surface)) throw new Error("Unknown application surface");
  return Object.fromEntries(Object.entries(secrets).filter(([key]) =>
    (surface === "command-center" || !commandOnly.has(key)) && (surface === "web" || !webOnly.has(key))));
}
