BEGIN;

-- External observations are distinct from dealership-owned inventory and from demo fixtures.
-- Migration does not import any data. A licensed/dealer-authorized source must be registered
-- explicitly by the data operator before a record can become visible.
CREATE TABLE intelligence_market_sources (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9_-]{2,64}$'),
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  agreement_reference text NOT NULL CHECK (length(agreement_reference) BETWEEN 3 AND 250),
  dealer_use boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE intelligence_market_observations (
  source_id text NOT NULL REFERENCES intelligence_market_sources(id),
  external_id text NOT NULL CHECK (length(external_id) BETWEEN 1 AND 160),
  make text NOT NULL CHECK (length(make) BETWEEN 1 AND 80),
  model text NOT NULL CHECK (length(model) BETWEEN 1 AND 100),
  variant text NOT NULL DEFAULT '',
  year integer CHECK (year BETWEEN 1950 AND 2100),
  fuel text NOT NULL DEFAULT '',
  transmission text NOT NULL DEFAULT '',
  km integer CHECK (km BETWEEN 0 AND 2000000),
  owners integer CHECK (owners BETWEEN 1 AND 20),
  city text NOT NULL CHECK (length(city) BETWEEN 1 AND 100),
  state text NOT NULL DEFAULT '',
  asking_price_inr bigint CHECK (asking_price_inr > 0 AND asking_price_inr <= 1000000000),
  source_url text,
  observed_at timestamptz NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, external_id),
  CONSTRAINT market_source_url_https CHECK (source_url IS NULL OR source_url ~ '^https://')
);
CREATE INDEX intelligence_market_observations_filters ON intelligence_market_observations
 (lower(make), lower(model), lower(city), observed_at DESC);
CREATE INDEX intelligence_market_observations_recent ON intelligence_market_observations (observed_at DESC);

-- No application role may directly modify source contracts or market evidence.
ALTER TABLE intelligence_market_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence_market_sources FORCE ROW LEVEL SECURITY;
ALTER TABLE intelligence_market_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence_market_observations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON intelligence_market_sources, intelligence_market_observations FROM PUBLIC;

-- A tightly-scoped, read-only projection. Application authentication and permissions
-- are checked at the Next.js API boundary. Expired/disabled/unlicensed sources stay hidden.
CREATE FUNCTION intelligence_market_observations_live()
RETURNS TABLE (
  listing_id text, source_name text, make text, model text, variant text,
  year integer, fuel text, transmission text, km integer, owners integer,
  city text, state text, asking_price_inr bigint, source_url text, observed_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT o.source_id || ':' || o.external_id, s.name, o.make, o.model, o.variant,
    o.year, o.fuel, o.transmission, o.km, o.owners, o.city, o.state,
    o.asking_price_inr, o.source_url, o.observed_at
  FROM intelligence_market_observations o
  JOIN intelligence_market_sources s ON s.id = o.source_id
  WHERE s.enabled AND s.dealer_use AND s.expires_at > now()
$$;
REVOKE ALL ON FUNCTION intelligence_market_observations_live() FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['vandlabs_app', 'vandlabs_runtime'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION intelligence_market_observations_live() TO %I', r);
    END IF;
  END LOOP;
END $$;

COMMIT;
