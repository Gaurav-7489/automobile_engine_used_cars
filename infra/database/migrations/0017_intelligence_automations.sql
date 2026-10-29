BEGIN;

-- Additive: follow-up automation rules and an append-only run log for the unified workspace. The legacy automation_rules and
-- automation_runs tables key on uuids and foreign-key shared lead rows, which Intelligence's own leads do not have, so these
-- tables are separate. Rows are tenant-scoped by forced row-level security like every other workspace table.

CREATE TABLE intelligence_automation_rules (
  tenant_id uuid NOT NULL REFERENCES organizations(id),
  rule_id text NOT NULL,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, rule_id),
  CHECK (jsonb_typeof(payload) = 'object')
);

CREATE TABLE intelligence_automation_runs (
  tenant_id uuid NOT NULL REFERENCES organizations(id),
  run_id text NOT NULL,
  rule_id text NOT NULL,
  rule_name text NOT NULL,
  lead_id text NOT NULL,
  trigger text NOT NULL CHECK (trigger IN ('lead_created', 'stage_changed')),
  outcome text NOT NULL CHECK (outcome IN ('created', 'skipped_consent', 'skipped_provider', 'skipped_duplicate')),
  task_id text,
  detail text NOT NULL DEFAULT '',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, run_id)
);
CREATE UNIQUE INDEX intelligence_automation_created_once ON intelligence_automation_runs (tenant_id, lead_id, rule_id, trigger) WHERE outcome = 'created';
CREATE INDEX intelligence_automation_runs_recent ON intelligence_automation_runs (tenant_id, occurred_at DESC);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['intelligence_automation_rules', 'intelligence_automation_runs'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
  END LOOP;
END $$;

DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['vandlabs_app', 'vandlabs_runtime'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON intelligence_automation_rules TO %I', r);
      EXECUTE format('GRANT SELECT, INSERT ON intelligence_automation_runs TO %I', r);
    END IF;
  END LOOP;
END $$;

COMMIT;
