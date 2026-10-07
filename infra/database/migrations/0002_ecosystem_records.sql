BEGIN;
ALTER TABLE organizations ADD COLUMN tenant_id uuid;
UPDATE organizations o SET tenant_id = (SELECT d.tenant_id FROM dealerships d WHERE d.organization_id=o.id LIMIT 1);
UPDATE organizations SET tenant_id=id WHERE tenant_id IS NULL;
ALTER TABLE organizations ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE organizations ADD CONSTRAINT organizations_tenant_id_unique UNIQUE (tenant_id, id);
ALTER TABLE dealerships ADD CONSTRAINT dealerships_tenant_id_unique UNIQUE (tenant_id, id);
ALTER TABLE locations ADD CONSTRAINT locations_tenant_id_unique UNIQUE (tenant_id, id);
ALTER TABLE vehicles ADD CONSTRAINT vehicles_tenant_id_unique UNIQUE (tenant_id, id);
ALTER TABLE leads ADD CONSTRAINT leads_tenant_id_unique UNIQUE (tenant_id, id);
ALTER TABLE dealerships ADD FOREIGN KEY (tenant_id, organization_id) REFERENCES organizations(tenant_id, id);
ALTER TABLE locations ADD FOREIGN KEY (tenant_id, dealership_id) REFERENCES dealerships(tenant_id, id);
ALTER TABLE vehicles ADD FOREIGN KEY (tenant_id, dealership_id) REFERENCES dealerships(tenant_id, id);
ALTER TABLE vehicles ADD FOREIGN KEY (tenant_id, location_id) REFERENCES locations(tenant_id, id);
ALTER TABLE leads ADD FOREIGN KEY (tenant_id, dealership_id) REFERENCES dealerships(tenant_id, id);
ALTER TABLE leads ADD FOREIGN KEY (tenant_id, location_id) REFERENCES locations(tenant_id, id);
ALTER TABLE leads ADD FOREIGN KEY (tenant_id, vehicle_id) REFERENCES vehicles(tenant_id, id);
ALTER TABLE tasks ADD FOREIGN KEY (tenant_id, lead_id) REFERENCES leads(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE journey_events ADD FOREIGN KEY (tenant_id, vehicle_id) REFERENCES vehicles(tenant_id, id);
CREATE TABLE lead_activities (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL, lead_id uuid NOT NULL,
 payload jsonb NOT NULL, occurred_at timestamptz NOT NULL,
 FOREIGN KEY (tenant_id, lead_id) REFERENCES leads(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE automation_rules (id uuid PRIMARY KEY, tenant_id uuid NOT NULL, payload jsonb NOT NULL);
CREATE TABLE automation_runs (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL, lead_id uuid NOT NULL, rule_id uuid NOT NULL,
 trigger text NOT NULL, outcome text NOT NULL, payload jsonb NOT NULL,
 FOREIGN KEY (tenant_id, lead_id) REFERENCES leads(tenant_id,id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX automation_created_once ON automation_runs(tenant_id,lead_id,rule_id,trigger) WHERE outcome='created';
CREATE TABLE appointments (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL, lead_id uuid NOT NULL, payload jsonb NOT NULL,
 FOREIGN KEY (tenant_id, lead_id) REFERENCES leads(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX lead_activity_tenant_lead ON lead_activities(tenant_id,lead_id,occurred_at DESC);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['organizations','lead_activities','automation_rules','automation_runs','appointments'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',t);
 END LOOP;
END $$;
COMMIT;
