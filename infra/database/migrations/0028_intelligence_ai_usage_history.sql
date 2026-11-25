BEGIN;

-- Additive. Provider-independent AI bookkeeping:
--  1. intelligence_ai_usage: one row per model call (assistant or customer agent), with tokens, outcome and latency, so each
--     dealership's daily AI budget can be enforced across every serverless instance and usage can be reported.
--  2. intelligence_assistant_threads / _messages: the staff assistant's saved conversations. Each one belongs to one member
--     of one dealership; row-level security keeps dealerships apart and every query also filters by the member.
-- No prompts, tool results or API keys are stored in the usage ledger. Conversation text is what the member typed and the
-- answer they were shown (already passed through the secret filter).

CREATE TABLE intelligence_ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id text,
  feature text NOT NULL CHECK (feature IN ('assistant', 'customer')),
  provider text NOT NULL CHECK (provider IN ('anthropic', 'gemini')),
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens integer NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  status text NOT NULL CHECK (status IN ('ok', 'error')),
  error_kind text,
  latency_ms integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX intelligence_ai_usage_tenant_time ON intelligence_ai_usage (tenant_id, created_at DESC);
CREATE INDEX intelligence_ai_usage_time ON intelligence_ai_usage (created_at);

CREATE TABLE intelligence_assistant_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id text NOT NULL,
  title text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX intelligence_assistant_threads_owner ON intelligence_assistant_threads (tenant_id, user_id, updated_at DESC);

CREATE TABLE intelligence_assistant_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES intelligence_assistant_threads (id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  user_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL CHECK (length(content) <= 40000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX intelligence_assistant_messages_thread ON intelligence_assistant_messages (thread_id, created_at);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['intelligence_ai_usage', 'intelligence_assistant_threads', 'intelligence_assistant_messages'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
  END LOOP;
END $$;

-- Today's model calls and tokens for one dealership, plus today's calls across all dealerships (the provider's quota is per
-- project, not per dealership). "Today" follows Pacific time because that is when Gemini's free-tier daily quota resets.
-- It returns counts only; no dealership can read another's rows.
CREATE FUNCTION intelligence_ai_usage_today(p_tenant uuid)
RETURNS TABLE (tenant_calls integer, tenant_tokens bigint, all_calls integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH day AS (SELECT (date_trunc('day', now() AT TIME ZONE 'America/Los_Angeles') AT TIME ZONE 'America/Los_Angeles') AS since)
  SELECT
    (SELECT count(*)::integer FROM intelligence_ai_usage u, day WHERE u.tenant_id = p_tenant AND u.created_at >= day.since),
    (SELECT coalesce(sum(u.input_tokens + u.output_tokens), 0)::bigint FROM intelligence_ai_usage u, day WHERE u.tenant_id = p_tenant AND u.created_at >= day.since),
    (SELECT count(*)::integer FROM intelligence_ai_usage u, day WHERE u.created_at >= day.since)
$$;
REVOKE ALL ON FUNCTION intelligence_ai_usage_today(uuid) FROM PUBLIC;

DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['vandlabs_app', 'vandlabs_runtime'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT, INSERT ON intelligence_ai_usage TO %I', r);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON intelligence_assistant_threads, intelligence_assistant_messages TO %I', r);
      EXECUTE format('GRANT EXECUTE ON FUNCTION intelligence_ai_usage_today(uuid) TO %I', r);
    END IF;
  END LOOP;
END $$;

COMMIT;
