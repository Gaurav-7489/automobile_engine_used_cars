import { json, problem, rateLimited, readJson } from "../api";
import { can } from "../permissions";
import { validateRule, type RuleInput } from "../automation";
import { clientKey, hitShared } from "../rate-limit";
import { getPrincipal } from "./auth";
import { sameOrigin } from "./csrf";
import { tenantTx } from "./db";
import { readEntitlements } from "./entitlement-store";
import { auditRuleChange, deleteRule, saveRule } from "./automation-store";

/** Create (no id), replace or delete one automation rule. Needs automations.manage and the automations feature; every change is audited. */
export async function ruleMutation(request: Request, id: string | null, verb: "save" | "delete"): Promise<Response> {
  if (!sameOrigin(request)) return problem(403, "forbidden", "Request origin is not allowed.");
  const current = await getPrincipal();
  if (!current) return problem(401, "unauthenticated", "Sign in to continue.");
  const { principal } = current;
  if (!can(principal.role, "automations.manage")) return problem(403, "forbidden", "Your role cannot change automations.");
  const limit = await hitShared(`automation-rules:${principal.userId}:${clientKey(request)}`, 60, 60_000);
  if (!limit.allowed) return rateLimited("Too many changes in a short time. Wait a moment.", limit.retryAfter);
  let input: ReturnType<typeof validateRule> | null = null;
  if (verb === "save") {
    const body = await readJson<RuleInput>(request, 20_000);
    if (!body || typeof body !== "object") return problem(422, "invalid", "Send the rule.");
    input = validateRule(body);
    if ("fields" in input) return problem(422, "invalid", "Fix the highlighted fields.", { fields: input.fields });
  }
  try {
    return await tenantTx(principal.tenantId, async (c) => {
      const entitlements = await readEntitlements(c, principal.tenantId);
      if (!entitlements.features.automations.enabled) return problem(403, "not_entitled", entitlements.features.automations.reason);
      if (verb === "delete") {
        if (!id || !(await deleteRule(c, principal.tenantId, id))) return problem(404, "not_found", "That rule was not found.");
        await auditRuleChange(c, principal.tenantId, principal.name, "automation.rule_deleted", id, "Rule deleted");
        return json({ ok: true });
      }
      const rule = await saveRule(c, principal.tenantId, id, (input as { rule: Parameters<typeof saveRule>[3] }).rule);
      if (!rule) return problem(404, "not_found", "That rule was not found.");
      await auditRuleChange(c, principal.tenantId, principal.name, id ? "automation.rule_updated" : "automation.rule_created", rule.id, `${rule.name}: ${rule.enabled ? "enabled" : "disabled"}`);
      return json({ ok: true, rule });
    });
  } catch (error) {
    console.error(JSON.stringify({ event: "automation_rule_failure", user: principal.userId, message: error instanceof Error ? error.message : "unknown" }));
    return problem(500, "failed", "The rule could not be saved. Nothing was changed. Try again.");
  }
}
