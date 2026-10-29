BEGIN;

-- Additive: platform administrators approve, change or disable a dealership's sourcing data source (the licensed or dealer feed behind
-- acquisition research and the business API). Sources live in dealer_commerce.payload.sources, as the legacy platform stored them.
-- The function re-checks the administrator grant and validates every field; the runtime role has no other way to write sources.

CREATE FUNCTION intelligence_admin_set_source(p_admin uuid, p_tenant uuid, p_source jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE k text; existing jsonb;
BEGIN
  IF NOT intelligence_is_platform_admin(p_admin) THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = p_tenant AND tenant_id = p_tenant) THEN RETURN false; END IF;
  IF jsonb_typeof(p_source) <> 'object'
     OR coalesce(p_source->>'id', '') !~ '^[a-z0-9_-]{2,64}$'
     OR coalesce(length(p_source->>'name'), 0) NOT BETWEEN 2 AND 120
     OR p_source->>'kind' NOT IN ('dealer', 'licensed_api')
     OR coalesce(length(p_source->>'agreement'), 0) NOT BETWEEN 3 AND 250
     OR jsonb_typeof(p_source->'dealerUse') <> 'boolean' OR jsonb_typeof(p_source->'aiProcessing') <> 'boolean'
     OR jsonb_typeof(p_source->'redistribute') <> 'boolean' OR jsonb_typeof(p_source->'enabled') <> 'boolean' THEN
    RAISE EXCEPTION 'invalid_source' USING ERRCODE = '22023';
  END IF;
  IF (p_source->>'expiresAt')::timestamptz <= now() AND (p_source->'enabled')::boolean THEN RAISE EXCEPTION 'invalid_source' USING ERRCODE = '22023'; END IF;
  -- Only these fields are stored.
  p_source := jsonb_build_object('id', p_source->>'id', 'name', p_source->>'name', 'kind', p_source->>'kind', 'agreement', p_source->>'agreement',
    'dealerUse', p_source->'dealerUse', 'aiProcessing', p_source->'aiProcessing', 'redistribute', p_source->'redistribute', 'enabled', p_source->'enabled',
    'expiresAt', to_char((p_source->>'expiresAt')::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  INSERT INTO dealer_commerce(tenant_id, payload) VALUES (p_tenant,
    jsonb_build_object('subscription', NULL, 'features', '{}'::jsonb, 'sources', jsonb_build_array(p_source), 'vehicles', '[]'::jsonb, 'fuel', '[]'::jsonb, 'keys', '[]'::jsonb, 'usage', '{}'::jsonb, 'audit', '[]'::jsonb))
  ON CONFLICT (tenant_id) DO UPDATE SET
    payload = jsonb_set(dealer_commerce.payload, '{sources}', jsonb_build_array(p_source) ||
      coalesce((SELECT jsonb_agg(s) FROM jsonb_array_elements(coalesce(dealer_commerce.payload->'sources', '[]'::jsonb)) s WHERE s->>'id' <> p_source->>'id'), '[]'::jsonb)),
    version = dealer_commerce.version + 1, updated_at = now();
  SELECT coalesce(jsonb_array_length(payload->'sources'), 0) INTO k FROM dealer_commerce WHERE tenant_id = p_tenant;
  IF k::int > 50 THEN RAISE EXCEPTION 'source_limit' USING ERRCODE = '22023'; END IF;
  INSERT INTO platform_audit(id, tenant_id, actor, action, subject, payload)
  VALUES (gen_random_uuid(), p_tenant, p_admin::text, 'platform.source_set', p_source->>'id', p_source - 'agreement');
  RETURN true;
END $$;

-- The administrator view of a dealership's sources now includes the agreement reference, so switching a source on or off keeps it.
CREATE OR REPLACE FUNCTION intelligence_admin_commerce(p_admin uuid, p_tenant uuid)
RETURNS TABLE (subscription jsonb, features jsonb, usage jsonb, sources jsonb, version bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT c.payload->'subscription', coalesce(c.payload->'features', '{}'::jsonb), coalesce(c.payload->'usage', '{}'::jsonb),
         coalesce((SELECT jsonb_agg(jsonb_build_object('id', s->>'id', 'name', s->>'name', 'kind', s->>'kind', 'enabled', s->'enabled', 'expiresAt', s->>'expiresAt', 'agreement', s->>'agreement', 'dealerUse', s->'dealerUse', 'aiProcessing', s->'aiProcessing', 'redistribute', s->'redistribute'))
                   FROM jsonb_array_elements(coalesce(c.payload->'sources', '[]'::jsonb)) s), '[]'::jsonb), c.version
  FROM dealer_commerce c WHERE c.tenant_id = p_tenant AND intelligence_is_platform_admin(p_admin)
$$;

REVOKE ALL ON FUNCTION intelligence_admin_set_source(uuid, uuid, jsonb) FROM PUBLIC;

DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['vandlabs_app', 'vandlabs_runtime'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION intelligence_admin_set_source(uuid, uuid, jsonb) TO %I', r);
    END IF;
  END LOOP;
END $$;

COMMIT;
