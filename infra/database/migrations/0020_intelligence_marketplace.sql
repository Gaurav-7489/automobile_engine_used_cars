BEGIN;

-- Additive: the public VandLabs marketplace (/cars). It lists, across dealerships, exactly the stock each dealer already shows on
-- its own public pages (/l/{tenant}): published and not sold or archived, public fields only. Never registration, costs, leads
-- or notes. A dealership leaves the marketplace by setting workspace meta payload.marketplace.listed = false.
--
-- Every row is tenant-scoped by forced row-level security, so a cross-dealership read needs these SECURITY DEFINER functions.
-- They take no tenant input and expose nothing beyond what the per-dealer public pages already publish.

CREATE INDEX IF NOT EXISTS vehicles_marketplace_live ON vehicles (updated_at DESC) WHERE publish_status = 'published' AND availability_status IN ('available', 'reserved');

CREATE FUNCTION intelligence_marketplace_live()
RETURNS TABLE (tenant_id uuid, stock_id text, dealer text, year integer, make text, model text, variant text, fuel text, transmission text,
  km bigint, price numeric, photo text, city text, state text, availability text, listed_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT v.tenant_id, v.stock_id,
    coalesce(nullif(btrim(m.payload->'profile'->>'displayName'), ''), o.name, '') AS dealer,
    CASE WHEN v.payload->>'year' ~ '^\d{4}$' THEN (v.payload->>'year')::int END,
    coalesce(v.payload->>'make', ''), coalesce(v.payload->>'model', ''), coalesce(v.payload->>'variant', ''),
    coalesce(v.payload->>'fuelType', ''), coalesce(v.payload->>'transmission', ''),
    CASE WHEN v.payload->>'mileage' ~ '^\d{1,9}$' THEN (v.payload->>'mileage')::bigint ELSE 0 END,
    CASE WHEN v.payload->>'price' ~ '^\d{1,12}(\.\d+)?$' AND (v.payload->>'price')::numeric > 0 THEN (v.payload->>'price')::numeric END,
    (SELECT e->>'url' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v.payload->'media') = 'array' THEN v.payload->'media' ELSE '[]'::jsonb END) e
      WHERE e->>'url' LIKE 'https://%' LIMIT 1),
    l.city, l.state, v.availability_status, v.updated_at
  FROM vehicles v
  JOIN locations l ON l.id = v.location_id AND l.tenant_id = v.tenant_id
  JOIN LATERAL (SELECT name FROM organizations WHERE organizations.tenant_id = v.tenant_id ORDER BY created_at LIMIT 1) o ON true
  LEFT JOIN intelligence_documents m ON m.tenant_id = v.tenant_id AND m.collection = 'meta' AND m.id = 'workspace'
  WHERE v.publish_status = 'published' AND v.availability_status IN ('available', 'reserved')
    AND coalesce(m.payload->'marketplace'->>'listed', 'true') <> 'false'
$$;

REVOKE ALL ON FUNCTION intelligence_marketplace_live() FROM PUBLIC;

DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['vandlabs_app', 'vandlabs_runtime'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION intelligence_marketplace_live() TO %I', r);
    END IF;
  END LOOP;
END $$;

COMMIT;
