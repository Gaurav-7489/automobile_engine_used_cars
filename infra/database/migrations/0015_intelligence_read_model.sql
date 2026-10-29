BEGIN;

-- Additive: a tenant-scoped read model so workspace pages query only the rows they show.
-- Each table holds one row per vehicle, lead or sale: typed columns for filtering, sorting and aggregation, and the
-- fully reconciled record as JSON. Rows are derived from the authoritative tables and rebuilt whenever their source
-- changes (see lib/server/read-model.ts); nothing here is a second source of truth and the whole thing can be dropped
-- and rebuilt without data loss.

CREATE TABLE intelligence_vehicle_index (
  tenant_id uuid NOT NULL,
  stock_id text NOT NULL,
  branch_id uuid NOT NULL,
  status text NOT NULL,
  make text NOT NULL,
  model text NOT NULL,
  variant text NOT NULL DEFAULT '',
  year integer NOT NULL,
  fuel text NOT NULL,
  transmission text NOT NULL,
  km integer NOT NULL,
  owners integer NOT NULL,
  registration text NOT NULL,
  asking_paise bigint,
  landed_paise bigint NOT NULL,
  acquired_day date NOT NULL,
  sold_day date,
  has_images boolean NOT NULL,
  cost_complete boolean NOT NULL,
  search text NOT NULL,
  data jsonb NOT NULL,
  shared_updated_at timestamptz NOT NULL,
  doc_updated_at timestamptz,
  cost_version integer,
  PRIMARY KEY (tenant_id, stock_id)
);
CREATE INDEX intelligence_vehicle_index_branch_status ON intelligence_vehicle_index (tenant_id, branch_id, status);
CREATE INDEX intelligence_vehicle_index_acquired ON intelligence_vehicle_index (tenant_id, status, acquired_day);
CREATE INDEX intelligence_vehicle_index_make ON intelligence_vehicle_index (tenant_id, make);

CREATE TABLE intelligence_lead_index (
  tenant_id uuid NOT NULL,
  lead_id text NOT NULL,
  branch_id uuid NOT NULL,
  stage text NOT NULL,
  owner text NOT NULL,
  source text NOT NULL,
  vehicle_stock_id text,
  created_at timestamptz NOT NULL,
  last_touch_at timestamptz NOT NULL,
  next_due_at timestamptz,
  has_sale boolean NOT NULL,
  has_appointment boolean NOT NULL,
  overdue_flag boolean NOT NULL,
  marketing_consent boolean NOT NULL,
  search text NOT NULL,
  data jsonb NOT NULL,
  shared_updated_at timestamptz NOT NULL,
  doc_updated_at timestamptz,
  PRIMARY KEY (tenant_id, lead_id)
);
CREATE INDEX intelligence_lead_index_branch_stage ON intelligence_lead_index (tenant_id, branch_id, stage);
CREATE INDEX intelligence_lead_index_created ON intelligence_lead_index (tenant_id, created_at DESC);
CREATE INDEX intelligence_lead_index_vehicle ON intelligence_lead_index (tenant_id, vehicle_stock_id);

CREATE TABLE intelligence_sale_index (
  tenant_id uuid NOT NULL,
  sale_id text NOT NULL,
  vehicle_stock_id text NOT NULL,
  branch_id uuid NOT NULL,
  closed_at timestamptz NOT NULL,
  price_paise bigint NOT NULL,
  from_ledger boolean NOT NULL,   -- sale came from the shared sales ledger: branch, landed cost and state follow the vehicle
  landed_paise bigint,
  direct_paise bigint NOT NULL DEFAULT 0,
  state text NOT NULL,
  data jsonb NOT NULL,
  source_updated_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, sale_id)
);
CREATE INDEX intelligence_sale_index_closed ON intelligence_sale_index (tenant_id, closed_at DESC);
CREATE INDEX intelligence_sale_index_vehicle ON intelligence_sale_index (tenant_id, vehicle_stock_id);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['intelligence_vehicle_index', 'intelligence_lead_index', 'intelligence_sale_index'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)$p$, t);
  END LOOP;
END $$;

-- Indexes the existing tables need for the lookups the read model and per-record commands make.
CREATE INDEX IF NOT EXISTS leads_tenant_vehicle_created_idx ON leads (tenant_id, vehicle_id, created_at DESC);
CREATE INDEX IF NOT EXISTS leads_tenant_updated_idx ON leads (tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS vehicles_tenant_updated_idx ON vehicles (tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS intelligence_documents_tenant_collection_idx ON intelligence_documents (tenant_id, collection, updated_at DESC);

DO $$ DECLARE r text; t text; BEGIN
  FOREACH r IN ARRAY ARRAY['vandlabs_app', 'vandlabs_runtime'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      FOREACH t IN ARRAY ARRAY['intelligence_vehicle_index', 'intelligence_lead_index', 'intelligence_sale_index'] LOOP
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO %I', t, r);
      END LOOP;
    END IF;
  END LOOP;
END $$;

COMMIT;
