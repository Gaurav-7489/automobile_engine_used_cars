BEGIN;
CREATE TABLE staff_members (
 tenant_id uuid NOT NULL,
 user_id text NOT NULL,
 payload jsonb NOT NULL,
 PRIMARY KEY (tenant_id, user_id)
);
CREATE TABLE platform_audit (
 id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL,
 actor text NOT NULL,
 action text NOT NULL,
 subject text NOT NULL,
 payload jsonb NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX platform_audit_tenant_time ON platform_audit(tenant_id,occurred_at DESC);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['staff_members','platform_audit'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',t);
 END LOOP;
END $$;
COMMIT;
