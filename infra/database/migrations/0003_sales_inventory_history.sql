BEGIN;
CREATE TABLE sales (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL, lead_id uuid NOT NULL, vehicle_id uuid NOT NULL,
 payload jsonb NOT NULL, amount numeric(14,2) NOT NULL CHECK(amount > 0), sold_at timestamptz NOT NULL,
 FOREIGN KEY (tenant_id, lead_id) REFERENCES leads(tenant_id,id),
 FOREIGN KEY (tenant_id, vehicle_id) REFERENCES vehicles(tenant_id,id),
 UNIQUE(tenant_id,vehicle_id), UNIQUE(tenant_id,lead_id)
);
CREATE TABLE inventory_history (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL, vehicle_id uuid NOT NULL,
 payload jsonb NOT NULL, occurred_at timestamptz NOT NULL,
 FOREIGN KEY (tenant_id, vehicle_id) REFERENCES vehicles(tenant_id,id)
);
CREATE INDEX inventory_history_vehicle_date ON inventory_history(tenant_id,vehicle_id,occurred_at DESC);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['sales','inventory_history'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',t);
 END LOOP;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='vandlabs_app') THEN
  GRANT SELECT,INSERT ON sales,inventory_history TO vandlabs_app;
 END IF;
END $$;
COMMIT;
