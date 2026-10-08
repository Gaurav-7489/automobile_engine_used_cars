BEGIN;
CREATE TABLE stock_costs (
 tenant_id uuid NOT NULL, vehicle_id uuid NOT NULL, version integer NOT NULL CHECK(version>0), payload jsonb NOT NULL,
 PRIMARY KEY(tenant_id,vehicle_id), FOREIGN KEY(tenant_id,vehicle_id) REFERENCES vehicles(tenant_id,id)
);
CREATE TABLE stock_cost_history (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL, vehicle_id uuid NOT NULL, payload jsonb NOT NULL,
 FOREIGN KEY(tenant_id,vehicle_id) REFERENCES vehicles(tenant_id,id)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['stock_costs','stock_cost_history'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',t);
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='vandlabs_app') THEN
  GRANT SELECT,INSERT,UPDATE ON stock_costs TO vandlabs_app;
  GRANT SELECT,INSERT ON stock_cost_history TO vandlabs_app;
 END IF;
END $$;
COMMIT;
