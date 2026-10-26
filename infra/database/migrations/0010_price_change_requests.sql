BEGIN;
-- Owner-approved asking-price changes. The payload is the request record; status is a column so
-- "one pending request per vehicle" is enforced by the database, not only by the application.
CREATE TABLE price_change_requests (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL, vehicle_id uuid NOT NULL,
 status text NOT NULL CHECK (status IN ('pending','approved','rejected','stale')),
 payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (tenant_id, vehicle_id) REFERENCES vehicles(tenant_id, id)
);
CREATE UNIQUE INDEX price_change_requests_one_pending ON price_change_requests (tenant_id, vehicle_id) WHERE status = 'pending';
CREATE INDEX price_change_requests_tenant_created ON price_change_requests (tenant_id, created_at DESC);
ALTER TABLE price_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_change_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON price_change_requests
 USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
 WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vandlabs_app') THEN
  GRANT SELECT, INSERT, UPDATE ON price_change_requests TO vandlabs_app;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vandlabs_runtime') THEN
  GRANT SELECT, INSERT, UPDATE ON price_change_requests TO vandlabs_runtime;
 END IF;
END $$;
COMMIT;
