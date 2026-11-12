BEGIN;

-- Additive: advertising accounts a dealership connects through the provider's own consent screen (Google Ads, Meta).
-- Access and refresh tokens are stored encrypted by the application (AES-256-GCM); the database never sees them in the clear.
-- One row per dealership and provider, tenant-scoped by forced row-level security like every other workspace table.

CREATE TABLE intelligence_ad_connections (
  tenant_id uuid NOT NULL REFERENCES organizations(id),
  provider text NOT NULL CHECK (provider IN ('google', 'meta')),
  account_id text NOT NULL,
  account_name text NOT NULL DEFAULT '',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  access_cipher text NOT NULL,
  refresh_cipher text,
  expires_at timestamptz,
  connected_by uuid NOT NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, provider),
  CHECK (jsonb_typeof(details) = 'object')
);

ALTER TABLE intelligence_ad_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence_ad_connections FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON intelligence_ad_connections
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- Typical asking prices by state, across every dealership's published stock. Aggregates only: a state and model appear once at
-- least one published car exists, and no dealership, stock number or single car is identifiable beyond what /cars already shows.
CREATE FUNCTION intelligence_state_prices(p_make text, p_model text)
RETURNS TABLE (state text, cars integer, dealers integer, median numeric, low numeric, high numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT m.state, count(*)::int, count(DISTINCT m.tenant_id)::int,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY m.price), min(m.price), max(m.price)
  FROM intelligence_marketplace_live() m
  WHERE m.price IS NOT NULL AND btrim(m.state) <> ''
    AND (p_make = '' OR lower(m.make) = lower(p_make))
    AND (p_model = '' OR lower(m.model) = lower(p_model))
  GROUP BY m.state
$$;

CREATE FUNCTION intelligence_state_price_models()
RETURNS TABLE (make text, model text, cars integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT m.make, m.model, count(*)::int FROM intelligence_marketplace_live() m
  WHERE m.price IS NOT NULL AND btrim(m.state) <> '' AND m.make <> '' AND m.model <> ''
  GROUP BY m.make, m.model
$$;

REVOKE ALL ON FUNCTION intelligence_state_prices(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION intelligence_state_price_models() FROM PUBLIC;

DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['vandlabs_app', 'vandlabs_runtime'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION intelligence_state_prices(text, text) TO %I', r);
      EXECUTE format('GRANT EXECUTE ON FUNCTION intelligence_state_price_models() TO %I', r);
      IF r = 'vandlabs_runtime' THEN
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON intelligence_ad_connections TO %I', r);
      END IF;
    END IF;
  END LOOP;
END $$;

COMMIT;
