BEGIN;
CREATE TABLE IF NOT EXISTS dealer_commerce (
 tenant_id uuid PRIMARY KEY REFERENCES organizations(id),
 payload jsonb NOT NULL,
 version bigint NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (jsonb_typeof(payload) = 'object')
);
ALTER TABLE dealer_commerce ENABLE ROW LEVEL SECURITY;
ALTER TABLE dealer_commerce FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='dealer_commerce' AND policyname='tenant_isolation') THEN
 CREATE POLICY tenant_isolation ON dealer_commerce USING (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
 END IF;
END $$;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='vandlabs_app') THEN
 GRANT SELECT,INSERT,UPDATE ON dealer_commerce TO vandlabs_app;
 END IF;
END $$;
COMMIT;
