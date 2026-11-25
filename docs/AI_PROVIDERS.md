# AI providers: Gemini and Claude

The staff **Assistant** and the **customer AI agent** (website chat, WhatsApp, Instagram) run on one provider-independent
engine. The provider is picked by environment variables; switching between Google Gemini and Anthropic Claude needs no
code change and no redeploy of different code, only a change of variables (and a redeploy so they take effect).

There is **no automatic fallback between providers**. If the selected provider is not configured, rejects the key, is out of
quota or is down, the AI features say so (staff see a clear message; customers get an acknowledgement and the team gets the
conversation). Nothing silently switches to another, possibly paid, service.

## Code map

| Piece | File |
| --- | --- |
| Configuration and limits (env only) | `apps/intelligence/lib/server/ai/config.ts` |
| Engine: tool loop, budgets, per-minute limit, concurrency, timeout, retries, usage | `apps/intelligence/lib/server/ai/engine.ts` |
| Gemini adapter (official `@google/genai` SDK) | `apps/intelligence/lib/server/ai/providers/gemini.ts` |
| Claude adapter (`@anthropic-ai/sdk`) | `apps/intelligence/lib/server/ai/providers/anthropic.ts` |
| Shared error kinds and user-facing messages | `apps/intelligence/lib/server/ai/errors.ts` |
| Usage ledger and daily budgets | `apps/intelligence/lib/server/ai/usage.ts` |
| Saved assistant conversations | `apps/intelligence/lib/server/ai/history.ts` |
| Status / availability check | `apps/intelligence/lib/server/ai/status.ts` |
| Staff assistant tools and prompt (unchanged permissions) | `apps/intelligence/lib/server/assistant.ts` |
| Customer agent tools and rules (unchanged) | `apps/intelligence/lib/server/customer-ai.ts` |
| Routes | `app/api/assistant/route.ts`, `app/api/assistant/threads/…`, `app/api/settings/messaging/route.ts` |
| Migration | `infra/database/migrations/0028_intelligence_ai_usage_history.sql` |

How a question flows: route → secret guard (unchanged) → entitlement check (unchanged) → saved thread read → engine
(budget → per-minute limit → concurrency slot → model call with timeout → tools run **in our code** with the member's tenant,
branches and role → next call …) → secret redaction on the stream (unchanged) → answer saved to the member's thread.

Tools are never executed by the provider. Gemini's automatic function calling is switched off; the engine passes each call
to the same `runTool` as before, which re-checks the role's capability, scopes every query to the session's tenant and
branches, and never returns customer contact details or secrets.

## Environment variables

Secrets go in the hosting provider's encrypted environment settings (Vercel / Cloudflare), never in the repository.

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `AI_PROVIDER` | no | `anthropic` | `gemini` or `anthropic`. Unset keeps the original Claude behaviour. |
| `GEMINI_API_KEY` | for Gemini | – | Secret. Server-only. |
| `GEMINI_MODEL` | no | `gemini-flash-latest` | Any model the key can use for `generateContent`. See "Models" below. |
| `GEMINI_API_VERSION` | no | `v1beta` | The `-latest` aliases exist only on `v1beta`; SDK 3.x defaults to `v1`. |
| `GEMINI_THINKING_LEVEL` | no | `low` | `minimal`, `low`, `medium`, `high` or `off`. Low saves free-tier tokens. |
| `ANTHROPIC_API_KEY` | for Claude | – | Secret. Server-only. |
| `ANTHROPIC_MODEL` / `ASSISTANT_MODEL` | no | `claude-opus-5-5` | `ASSISTANT_MODEL` is the original name and still works. |
| `AI_TIMEOUT_MS` | no | 25000 (Gemini) / 100000 | Per model call, including streaming. |
| `AI_MAX_RETRIES` | no | 1 (Gemini) / 2 | Only for temporary failures, only before any text was shown. |
| `AI_MAX_RETRY_DELAY_MS` | no | 8000 | If the provider asks to wait longer, the user is told to try later instead. |
| `AI_CALLS_PER_MINUTE` | no | 5 (Gemini) / 0 | Shared across instances, per provider and model. 0 = off. |
| `AI_MAX_CONCURRENCY` | no | 3 (Gemini) / 8 | Model calls at once per server instance. |
| `AI_QUEUE_WAIT_MS` | no | 15000 | How long a request waits for a slot or the next minute. |
| `AI_USER_REQUESTS_PER_10MIN` | no | 15 (Gemini) / 30 | Questions per member per 10 minutes (shared). |
| `AI_TENANT_DAILY_CALLS` | no | 200 (Gemini) / 0 | Model calls per dealership per day. 0 = no limit. |
| `AI_TENANT_DAILY_TOKENS` | no | 400000 (Gemini) / 0 | Tokens per dealership per day. 0 = no limit. |
| `AI_GLOBAL_DAILY_CALLS` | no | 900 (Gemini) / 0 | Model calls per day across all dealerships. 0 = no limit. |
| `AI_ASSISTANT_MAX_OUTPUT_TOKENS` | no | 2048 (Gemini) / 16000 | |
| `AI_CUSTOMER_MAX_OUTPUT_TOKENS` | no | 1024 (Gemini) / 2000 | |

"Day" for the budgets follows Pacific time, when Gemini's free-tier daily quota resets.

## What was verified against the real Gemini API (synthetic data only, 25 Nov 2026)

With the project's key, SDK `@google/genai` 3.6.1, API `v1beta`:

- `models.get` succeeds for `gemini-flash-latest` (the status check uses this; it costs no generation quota).
- `gemini-flash-latest` **returned 503 "high demand" on every generation attempt** during testing, and then 429.
- `gemini-2.5-flash` is listed by the models endpoint but generation returns 404 "no longer available to new users".
  Listing a model does not prove it can be used.
- `gemini-3.5-flash` worked end to end through the engine: streamed answers, multi-step function calling (3 calls for one
  question), the product-guide lookup, the customer agent's `car_details`, conversation context, and token accounting.
- The free tier allowed **5 generate requests per minute per model** for this project. Failed (503) requests also count.
  One assistant question usually takes 2–3 calls, so the whole project can serve roughly 2 questions a minute per model.

## Response time

Measured 25 Nov 2026 with `gemini-3.5-flash-lite` and `GEMINI_THINKING_LEVEL=minimal` (synthetic data, from the engine):
1.2 s for a how-to question (one model call, answered from the guide excerpts sent with the question), 1.5–1.7 s for stock
questions (one lookup plus the answer). The page shows what is being looked up ("Looking up your cars…") within about 0.5–1 s
and "Still working…" after 10 s. At the same time `gemini-3.5-flash` took 22–40 s per call because it was overloaded, so the
lite model is the recommended setting on the free tier. Free-tier latency is not guaranteed; a paid tier is needed for that.

## Differences from Claude to be aware of

- **Prompt caching**: Claude's explicit cache is used as before. Gemini caches implicitly; the stable instructions are sent
  first so they can be reused. No paid context cache is created.
- **Server-side fallback** (`fallbacks: "default"`) is an Anthropic feature and is kept for Claude only. Gemini has no
  equivalent; a Gemini refusal (safety stop) is reported as "I can't help with that request."
- **Strict tool schemas**: Claude enforces them; Gemini receives the same JSON Schema through `parametersJsonSchema` but does
  not guarantee strictness, so every tool still validates and clamps its own arguments (unchanged code).
- **Grounding**: in testing, Gemini once drafted a social post with features not in the car's record when the car had only
  been mentioned earlier in the chat. The assistant's instructions now require looking the car up again before drafting and
  forbid unrecorded features. Spot-check drafts during the trial.

## Scaling path

- **10 users (now)**: one Vercel/Cloudflare deployment, Neon Postgres, no extra services. Limits above are DB-backed where they
  must hold across instances (per-member rate, per-minute calls, daily budgets) and in-process where per instance is enough
  (concurrency). Expect "busy" messages on the Gemini free tier when several people ask at once (5 calls/minute).
- **~100 users**: move Gemini to a paid tier (raises the per-minute quota by orders of magnitude) and raise
  `AI_CALLS_PER_MINUTE` / budgets with env vars only. Optionally set `GEMINI_MODEL` to a lighter model for the customer agent.
- **1,000+ users**: the usage ledger grows by one row per model call; add a nightly roll-up into daily totals and prune old
  rows (the budget query only reads today). Replace the in-process concurrency semaphore with the shared limiter if instance
  counts grow large. If traffic is spiky, move customer-channel replies (WhatsApp/Instagram webhooks) to a queue so the
  webhook acknowledges immediately; the engine API does not change. Per-dealership budgets can then follow subscription plans.

## Deploying

1. Apply migration `0028_intelligence_ai_usage_history.sql` (`pnpm db:migrate` against the production database). It is
   additive; the old code ignores the new tables, so it can be applied before the code is deployed.
2. Set the variables in the hosting provider (Production and Preview as needed). For Gemini: `AI_PROVIDER=gemini`,
   `GEMINI_API_KEY`, and `GEMINI_MODEL`. Leave the Anthropic key in place if you want to switch back later; it is not used
   while `AI_PROVIDER=gemini`.
3. Deploy. Open **Assistant**: the footer names the provider and model, and a warning appears if the key or model was
   rejected, the quota is exhausted, or the last call failed.
4. Rollback: set `AI_PROVIDER=anthropic` (or remove it) and redeploy. No data migration is needed.
